/**
 * Automatische Sicherung in einen Ordner (z. B. USB-Stick oder Netzlaufwerk).
 * Nutzt die File System Access API von Chrome/Edge am Computer – die App darf
 * nach einmaliger Erlaubnis Dateien in genau diesen Ordner schreiben.
 *
 * Die Sicherung ist wie das manuelle Backup mit einem eigenen Backup-Passwort
 * verschlüsselt. Dieses Passwort liegt mit dem Datenschlüssel verschlüsselt auf
 * dem Gerät – automatische Sicherungen laufen daher nur, solange die Daten
 * entsperrt sind.
 */
import type { EncryptedData } from '../domain/types';
import { decryptText, encryptText, passwordProblem } from '../security/crypto';
import { getDataKey } from '../security/session';
import { createBackupFile } from './backup';
import { AUTO_BACKUP_DIR_KEY, AUTO_BACKUP_KEY, ValidationError, db } from './db';
import { saveSettings } from './settings';

/** Ausschnitt aus FileSystemDirectoryHandle, den die Sicherung braucht. */
export interface BackupDirHandle {
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
}

export interface AutoBackupConfig {
  /** Name des gewählten Ordners (zur Anzeige). */
  dirName: string;
  passwordEnc: EncryptedData;
  intervalHours: number;
  /** So viele Sicherungen bleiben im Ordner, ältere werden gelöscht. */
  keep: number;
  lastRunAt?: number;
  lastFile?: string;
  lastError?: string;
}

const FILE_PATTERN = /^zutrittskontrolle-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zkb$/;

/** Ist eine Sicherung fällig? */
export function autoBackupDue(now: number, lastRunAt: number | undefined, intervalHours: number): boolean {
  return !lastRunAt || now - lastRunAt >= intervalHours * 60 * 60 * 1000;
}

/** Welche Sicherungsdateien sollen weg? Nur eigene Dateien, die neuesten `keep` bleiben. */
export function backupFilesToDelete(names: string[], keep: number): string[] {
  const own = names.filter((n) => FILE_PATTERN.test(n)).sort().reverse(); // Datum im Namen → sortierbar
  return own.slice(Math.max(1, keep));
}

/** Kann dieser Browser einen Ordner zum Schreiben auswählen? (Chrome/Edge am Computer) */
export function directoryPickerAvailable(): boolean {
  return typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function pickBackupDirectory(): Promise<BackupDirHandle> {
  const w = window as Window & { showDirectoryPicker?: (o: object) => Promise<BackupDirHandle> };
  if (!w.showDirectoryPicker) throw new ValidationError('Ordnerauswahl wird von diesem Browser nicht unterstützt.');
  return w.showDirectoryPicker({ id: 'zutrittskontrolle-backup', mode: 'readwrite', startIn: 'documents' });
}

/** Ablage des Ordner-Zugriffs (im Browser: IndexedDB; in Tests austauschbar). */
interface DirStore {
  get(): Promise<BackupDirHandle | undefined>;
  put(dir: BackupDirHandle): Promise<void>;
  remove(): Promise<void>;
}

const indexedDbDirStore: DirStore = {
  async get() {
    return (await db.settings.get(AUTO_BACKUP_DIR_KEY))?.value as BackupDirHandle | undefined;
  },
  async put(dir) {
    await db.settings.put({ key: AUTO_BACKUP_DIR_KEY, value: dir });
  },
  async remove() {
    await db.settings.delete(AUTO_BACKUP_DIR_KEY);
  },
};
let dirStore: DirStore = indexedDbDirStore;

/** Nur für Tests: Ordner-Zugriffe im Speicher halten (die Test-Datenbank kann sie nicht speichern). */
export function setDirStoreForTests(store: DirStore | null): void {
  dirStore = store ?? indexedDbDirStore;
}

export function loadAutoBackupDir(): Promise<BackupDirHandle | undefined> {
  return dirStore.get();
}

export async function loadAutoBackup(): Promise<AutoBackupConfig | undefined> {
  const rec = await db.settings.get(AUTO_BACKUP_KEY);
  return rec?.value as AutoBackupConfig | undefined;
}

async function updateConfig(patch: Partial<AutoBackupConfig>): Promise<void> {
  const current = await loadAutoBackup();
  if (current) await db.settings.put({ key: AUTO_BACKUP_KEY, value: { ...current, ...patch } });
}

/** Automatische Sicherung einrichten (Daten müssen entsperrt sein). */
export async function configureAutoBackup(opts: { dir: BackupDirHandle; password: string; intervalHours: number; keep: number }): Promise<void> {
  const problem = passwordProblem(opts.password);
  if (problem) throw new ValidationError(problem);
  const key = getDataKey();
  if (!key) throw new ValidationError('Die Daten sind gesperrt. Bitte zuerst mit dem Admin-Passwort anmelden.');
  const config: AutoBackupConfig = {
    dirName: opts.dir.name,
    passwordEnc: await encryptText(key, opts.password),
    intervalHours: opts.intervalHours,
    keep: opts.keep,
  };
  await dirStore.put(opts.dir);
  await db.settings.put({ key: AUTO_BACKUP_KEY, value: config });
}

export async function disableAutoBackup(): Promise<void> {
  await db.settings.delete(AUTO_BACKUP_KEY);
  await dirStore.remove();
}

/** Darf die App gerade in den Ordner schreiben? ('prompt' = nach einem Neustart erneut erlauben) */
export async function autoBackupPermission(): Promise<PermissionState> {
  const dir = await dirStore.get();
  if (!dir) return 'denied';
  return (await dir.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
}

export type AutoBackupRun = 'done' | 'not-due' | 'disabled' | 'locked' | 'no-permission' | 'busy' | 'error';

let running = false;

/**
 * Führt die Sicherung aus, wenn sie fällig ist (oder `force`). `interactive` darf
 * nach der Ordner-Erlaubnis fragen – nur nach einem Klick des Nutzers.
 */
export async function runAutoBackup(
  appVersion: string,
  opts: { force?: boolean; interactive?: boolean; now?: number; iterations?: number } = {},
): Promise<AutoBackupRun> {
  if (running) return 'busy';
  const config = await loadAutoBackup();
  if (!config) return 'disabled';
  const key = getDataKey();
  if (!key) return 'locked';
  const now = opts.now ?? Date.now();
  if (!opts.force && !autoBackupDue(now, config.lastRunAt, config.intervalHours)) return 'not-due';

  running = true;
  try {
    const dir = await dirStore.get();
    if (!dir) {
      await updateConfig({ lastError: 'Der Sicherungsordner ist nicht mehr bekannt – bitte neu einrichten.' });
      return 'no-permission';
    }
    let permission = (await dir.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (permission !== 'granted' && opts.interactive && dir.requestPermission) {
      permission = await dir.requestPermission({ mode: 'readwrite' });
    }
    if (permission !== 'granted') {
      await updateConfig({ lastError: 'Der Zugriff auf den Sicherungsordner muss erneut erlaubt werden.' });
      return 'no-permission';
    }
    const password = await decryptText(key, config.passwordEnc);
    const file = await createBackupFile(password, appVersion, opts.iterations);
    const handle = await dir.getFileHandle(file.filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.blob);
    await writable.close();

    const names: string[] = [];
    for await (const entry of dir.values()) if (entry.kind === 'file') names.push(entry.name);
    for (const name of backupFilesToDelete(names, config.keep)) await dir.removeEntry(name);

    await updateConfig({ lastRunAt: now, lastFile: file.filename, lastError: undefined });
    await saveSettings({ lastBackupAt: now });
    return 'done';
  } catch (err) {
    await updateConfig({ lastError: err instanceof Error ? err.message : 'Sicherung fehlgeschlagen.' });
    return 'error';
  } finally {
    running = false;
  }
}
