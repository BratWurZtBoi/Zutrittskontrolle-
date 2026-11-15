import { beforeEach, describe, expect, it } from 'vitest';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import {
  autoBackupDue,
  backupFilesToDelete,
  configureAutoBackup,
  loadAutoBackup,
  loadAutoBackupDir,
  runAutoBackup,
  setDirStoreForTests,
  type BackupDirHandle,
} from './autoBackup';
import { openBackupFile } from './backup';
import { createCards, updateCard } from './cards';
import { clearAllData } from './db';
import { ensureDefaultGroups, listGroups } from './groups';
import { loadSettings } from './settings';

const FAST = 1000;
const H = 60 * 60 * 1000;

/** Ordner im Arbeitsspeicher – verhält sich wie FileSystemDirectoryHandle. */
function fakeDir(permission: PermissionState = 'granted') {
  const files = new Map<string, Blob>();
  let perm = permission;
  const dir: BackupDirHandle = {
    name: 'USB-Stick',
    async getFileHandle(name) {
      return {
        async createWritable() {
          let data: Blob | undefined;
          return {
            async write(d: Blob) {
              data = d;
            },
            async close() {
              if (data) files.set(name, data);
            },
          };
        },
      };
    },
    async removeEntry(name) {
      files.delete(name);
    },
    async *values() {
      for (const name of files.keys()) yield { kind: 'file' as const, name };
    },
    async queryPermission() {
      return perm;
    },
    async requestPermission() {
      perm = 'granted';
      return perm;
    },
  };
  return { dir, files };
}

let stored: BackupDirHandle | undefined;
setDirStoreForTests({
  get: async () => stored,
  put: async (d) => {
    stored = d;
  },
  remove: async () => {
    stored = undefined;
  },
});

beforeEach(async () => {
  stored = undefined;
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', FAST)).dataKey);
  await ensureDefaultGroups();
});

describe('Automatische Sicherung – Regeln', () => {
  it('fällig nach Ablauf des Intervalls', () => {
    expect(autoBackupDue(10 * H, undefined, 24)).toBe(true);
    expect(autoBackupDue(30 * H, 10 * H, 24)).toBe(false);
    expect(autoBackupDue(34 * H, 10 * H, 24)).toBe(true);
  });

  it('löscht nur eigene, ältere Sicherungen', () => {
    const names = [
      'zutrittskontrolle-backup-2026-11-13-0900.zkb',
      'zutrittskontrolle-backup-2026-11-15-0900.zkb',
      'notizen.txt',
      'zutrittskontrolle-backup-2026-11-14-0900.zkb',
    ];
    expect(backupFilesToDelete(names, 2)).toEqual(['zutrittskontrolle-backup-2026-11-13-0900.zkb']);
    expect(backupFilesToDelete(names, 0)).toHaveLength(2); // mindestens eine bleibt
  });
});

describe('Automatische Sicherung – Ablauf', () => {
  it('schreibt ein verschlüsseltes Backup in den Ordner und räumt auf', async () => {
    const [staff] = await listGroups();
    const [card] = await createCards({ groupId: staff!.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Max', lastName: 'Mustermann' } });
    const { dir, files } = fakeDir();
    files.set('zutrittskontrolle-backup-2020-01-01-0000.zkb', new Blob(['alt']));
    await configureAutoBackup({ dir, password: 'Sicherungs-Passwort', intervalHours: 24, keep: 1 });
    expect(JSON.stringify(await loadAutoBackup())).not.toContain('Sicherungs-Passwort');

    const now = new Date(2026, 10, 15, 9, 0).getTime();
    expect(await runAutoBackup('0.7.0', { now, iterations: FAST })).toBe('done');
    expect([...files.keys()]).toHaveLength(1); // alte Datei gelöscht
    const [name, blob] = [...files.entries()][0]!;
    expect(name).toMatch(/^zutrittskontrolle-backup-.*\.zkb$/);
    const text = await blob.text();
    expect(text).not.toContain('Mustermann');
    const payload = await openBackupFile(text, 'Sicherungs-Passwort');
    expect(payload.cards[0]?.holder?.lastName).toBe('Mustermann');
    expect((await loadAutoBackup())?.lastRunAt).toBe(now);
    expect((await loadSettings()).lastBackupAt).toBe(now); // Backup-Erinnerung zurückgesetzt

    expect(await runAutoBackup('0.7.0', { now: now + H, iterations: FAST })).toBe('not-due');
  });

  it('ohne Ordnerzugriff oder gesperrt: keine Sicherung, Hinweis gespeichert', async () => {
    const { dir, files } = fakeDir('prompt');
    await configureAutoBackup({ dir, password: 'Sicherungs-Passwort', intervalHours: 24, keep: 7 });
    expect(await runAutoBackup('0.7.0', { iterations: FAST })).toBe('no-permission');
    expect((await loadAutoBackup())?.lastError).toContain('erneut erlaubt');
    expect(files.size).toBe(0);
    // nach Klick („interaktiv“) wird gefragt und gesichert
    expect(await runAutoBackup('0.7.0', { interactive: true, iterations: FAST })).toBe('done');
    expect((await loadAutoBackup())?.lastError).toBeUndefined();

    setDataKeyForTests(null);
    expect(await runAutoBackup('0.7.0', { force: true, iterations: FAST })).toBe('locked');
  });

  it('Einstellung bleibt bei „Alle Daten löschen“ erhalten', async () => {
    const { dir } = fakeDir();
    await configureAutoBackup({ dir, password: 'Sicherungs-Passwort', intervalHours: 24, keep: 7 });
    await clearAllData();
    expect(await loadAutoBackup()).toMatchObject({ dirName: 'USB-Stick', intervalHours: 24 });
    expect(await loadAutoBackupDir()).toBe(dir);
  });
});
