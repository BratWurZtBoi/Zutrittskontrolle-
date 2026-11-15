import Dexie, { type EntityTable } from 'dexie';
import type { AccessEvent, Person, PresenceRecord } from '../domain/types';

export interface SettingRecord {
  key: string;
  value: unknown;
}

/**
 * Lokale Datenbank (IndexedDB über Dexie). Funktioniert identisch im Browser,
 * in der installierten PWA und in der Android-App (WebView).
 */
export class ZkDatabase extends Dexie {
  persons!: EntityTable<Person, 'id'>;
  events!: EntityTable<AccessEvent, 'seq'>;
  presence!: EntityTable<PresenceRecord, 'personId'>;
  settings!: EntityTable<SettingRecord, 'key'>;

  constructor(name = 'zutrittskontrolle') {
    super(name);
    this.version(1).stores({
      persons: 'id, &personnelNo, &cardToken, lastName',
      events: '++seq, timestamp, personId',
      presence: 'personId, status',
      settings: 'key',
    });
  }
}

export const db = new ZkDatabase();

/** Löscht alle Daten (Personen, Protokoll, Anwesenheit, Einstellungen). */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.persons, db.events, db.presence, db.settings], async () => {
    await Promise.all([db.persons.clear(), db.events.clear(), db.presence.clear(), db.settings.clear()]);
  });
}
