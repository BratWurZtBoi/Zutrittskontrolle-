import Dexie, { type EntityTable } from 'dexie';
import type { CardLayout } from '../domain/cardLayout';
import type { GuestRecord, Occasion, OccasionLogRecord } from '../domain/occasion';
import type { PresentationLayout } from '../domain/presentationLayout';
import type { AccessEventRecord, CardRecord, Group, PresenceRecord, UnassignedRecord } from '../domain/types';

export interface SettingRecord {
  key: string;
  value: unknown;
}

export const DB_NAME = 'zutrittskontrolle-daten';
/** Datenbank des ersten Prototyps (nur fiktive Testdaten) – wird beim Start entfernt. */
const LEGACY_DB_NAME = 'zutrittskontrolle';

/**
 * Lokale Datenbank (IndexedDB über Dexie). Funktioniert identisch im Browser
 * und in der installierten PWA auf Android und Windows.
 *
 * Schemaänderungen nur über eine NEUE version(n) – bestehende Versionen nie ändern.
 */
export class ZkDatabase extends Dexie {
  groups!: EntityTable<Group, 'id'>;
  cards!: EntityTable<CardRecord, 'id'>;
  events!: EntityTable<AccessEventRecord, 'seq'>;
  presence!: EntityTable<PresenceRecord, 'cardId'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  layouts!: EntityTable<PresentationLayout, 'id'>;
  cardLayouts!: EntityTable<CardLayout, 'id'>;
  unassigned!: EntityTable<UnassignedRecord, 'id'>;
  occasions!: EntityTable<Occasion, 'id'>;
  guests!: EntityTable<GuestRecord, 'id'>;
  occasionLog!: EntityTable<OccasionLogRecord, 'seq'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      groups: 'id, sortOrder',
      cards: 'id, &number, &token, groupId',
      events: '++seq, timestamp, cardId',
      presence: 'cardId, status',
      settings: 'key',
    });
    // v2: Präsentationslayouts (Gästebildschirm)
    this.version(2).stores({
      layouts: 'id',
    });
    // v3: Kartenlayouts (gedruckte Karten)
    this.version(3).stores({
      cardLayouts: 'id',
    });
    // v4: Personen aus dem Import ohne Gruppe („Nicht zugeordnet“)
    this.version(4).stores({
      unassigned: 'id, createdAt',
    });
    // v5: Veranstaltungen mit Gästeliste (Einladungen nur einmal gültig) und eigenem Einlass-Protokoll
    this.version(5).stores({
      occasions: 'id, date',
      guests: 'id, occasionId, &token',
      occasionLog: '++seq, occasionId',
    });
  }
}

export const db = new ZkDatabase();

export async function removeLegacyDatabase(): Promise<void> {
  try {
    if (await Dexie.exists(LEGACY_DB_NAME)) await Dexie.delete(LEGACY_DB_NAME);
  } catch {
    /* nicht kritisch */
  }
}

export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Schlüssel des Passwort-Tresors in der Einstellungstabelle. */
export const VAULT_KEY = 'vault';
/** Prüfwert der Bediener-PIN in der Einstellungstabelle. */
export const OPERATOR_PIN_KEY = 'operatorPin';
/** Automatische Sicherung: Einstellungen mit verschlüsseltem Backup-Passwort … */
export const AUTO_BACKUP_KEY = 'autoBackup';
/** … und der Ordner (Zugriffsrecht des Browsers, FileSystemDirectoryHandle). */
export const AUTO_BACKUP_DIR_KEY = 'autoBackupDir';
/** Gerätebezogene Zugangsdaten – bleiben bei „Alle Daten löschen“ und beim Einspielen eines Backups erhalten. */
export const DEVICE_SECRET_KEYS = [VAULT_KEY, OPERATOR_PIN_KEY, AUTO_BACKUP_KEY, AUTO_BACKUP_DIR_KEY];

/**
 * Löscht alle Daten (Karten, Gruppen, Protokoll, Anwesenheit, Einstellungen).
 * Admin-Passwort und Bediener-PIN bleiben erhalten, außer `includePassword` ist gesetzt.
 */
export async function clearAllData(includePassword = false): Promise<void> {
  await db.transaction('rw', [...db.tables], async () => {
    await Promise.all(db.tables.filter((t) => t.name !== 'settings').map((t) => t.clear()));
    if (includePassword) await db.settings.clear();
    else await db.settings.where('key').noneOf(DEVICE_SECRET_KEYS).delete();
  });
}
