import Dexie, { type EntityTable } from 'dexie';
import type { AccessEvent, Card, Group, PresenceRecord } from '../domain/types';

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
  cards!: EntityTable<Card, 'id'>;
  events!: EntityTable<AccessEvent, 'seq'>;
  presence!: EntityTable<PresenceRecord, 'cardId'>;
  settings!: EntityTable<SettingRecord, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      groups: 'id, sortOrder',
      cards: 'id, &number, &token, groupId',
      events: '++seq, timestamp, cardId',
      presence: 'cardId, status',
      settings: 'key',
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

/** Löscht alle Daten (Karten, Gruppen, Protokoll, Anwesenheit, Einstellungen). */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.groups, db.cards, db.events, db.presence, db.settings], async () => {
    await Promise.all([db.groups.clear(), db.cards.clear(), db.events.clear(), db.presence.clear(), db.settings.clear()]);
  });
}
