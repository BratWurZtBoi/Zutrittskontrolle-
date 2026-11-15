import { decideAccess, type Decision } from '../domain/access';
import { parseCardPayload } from '../domain/cardCode';
import type { AccessEvent, Person, ScanMode } from '../domain/types';
import { db } from './db';

export interface ScanOptions {
  mode: ScanMode;
  cooldownMs: number;
  source: AccessEvent['source'];
  now?: Date;
}

export interface ScanOutcome {
  decision: Decision;
  person?: Person;
  /** Protokolleintrag (fehlt bei Doppelscans – diese werden nicht gebucht). */
  event?: AccessEvent;
  at: number;
}

/**
 * Verarbeitet einen gescannten QR-Text: prüft den Ausweis, entscheidet,
 * protokolliert und aktualisiert die Anwesenheit – alles in einer Transaktion.
 */
export async function processScan(text: string, opts: ScanOptions): Promise<ScanOutcome> {
  const now = opts.now ?? new Date();
  const at = now.getTime();
  const token = parseCardPayload(text);

  return db.transaction('rw', [db.persons, db.presence, db.events], async () => {
    if (!token) {
      const event: AccessEvent = { timestamp: at, outcome: 'denied', reason: 'INVALID_CODE', source: opts.source };
      event.seq = await db.events.add(event);
      return { decision: { outcome: 'denied', reason: 'INVALID_CODE' }, event, at };
    }

    const person = await db.persons.where('cardToken').equals(token).first();
    const presence = person ? await db.presence.get(person.id) : undefined;
    const decision = decideAccess({ person, presence, mode: opts.mode, now, cooldownMs: opts.cooldownMs });

    if (decision.outcome === 'duplicate') return { decision, person, at };

    const event: AccessEvent = {
      timestamp: at,
      outcome: decision.outcome,
      direction: decision.direction,
      reason: decision.reason,
      personId: person?.id,
      personName: person ? `${person.firstName} ${person.lastName}` : undefined,
      personnelNo: person?.personnelNo,
      source: opts.source,
    };
    event.seq = await db.events.add(event);

    if (person && decision.outcome === 'granted' && decision.direction) {
      await db.presence.put({ personId: person.id, status: decision.direction, lastBookingAt: at });
    }
    return { decision, person, event, at };
  });
}

export function listRecentEvents(limit = 100): Promise<AccessEvent[]> {
  return db.events.orderBy('timestamp').reverse().limit(limit).toArray();
}

export interface PresentPerson {
  person: Person;
  since: number;
}

export async function listPresentPersons(): Promise<PresentPerson[]> {
  const records = await db.presence.where('status').equals('in').toArray();
  const persons = await db.persons.bulkGet(records.map((r) => r.personId));
  const result: PresentPerson[] = [];
  records.forEach((r, i) => {
    const person = persons[i];
    if (person) result.push({ person, since: r.lastBookingAt });
  });
  return result.sort((a, b) => a.person.lastName.localeCompare(b.person.lastName, 'de'));
}

export async function clearEvents(): Promise<void> {
  await db.transaction('rw', [db.events, db.presence], async () => {
    await db.events.clear();
    await db.presence.clear();
  });
}
