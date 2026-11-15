import { generateCardToken } from '../domain/cardCode';
import { isValidIsoDate } from '../domain/dates';
import type { Person, PersonInput } from '../domain/types';
import { db } from './db';

export const MAX_PERSONS = 100;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function normalize(input: PersonInput): PersonInput {
  return {
    ...input,
    personnelNo: input.personnelNo.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    validFrom: input.validFrom?.trim() || undefined,
    validUntil: input.validUntil?.trim() || undefined,
    note: input.note?.trim() || undefined,
    photo: input.photo || undefined,
  };
}

async function validate(input: PersonInput, ownId?: string): Promise<void> {
  if (!input.firstName) throw new ValidationError('Bitte einen Vornamen eingeben.');
  if (!input.lastName) throw new ValidationError('Bitte einen Nachnamen eingeben.');
  if (!input.personnelNo) throw new ValidationError('Bitte eine ID eingeben.');
  if (input.personnelNo.length > 20) throw new ValidationError('Die ID darf höchstens 20 Zeichen lang sein.');
  if (input.validFrom && !isValidIsoDate(input.validFrom)) throw new ValidationError('„Gültig ab“ ist kein gültiges Datum.');
  if (input.validUntil && !isValidIsoDate(input.validUntil)) throw new ValidationError('„Gültig bis“ ist kein gültiges Datum.');
  if (input.validFrom && input.validUntil && input.validFrom > input.validUntil) {
    throw new ValidationError('„Gültig bis“ liegt vor „Gültig ab“.');
  }
  const existing = await db.persons.where('personnelNo').equals(input.personnelNo).first();
  if (existing && existing.id !== ownId) {
    throw new ValidationError(`Die ID „${input.personnelNo}“ ist bereits vergeben.`);
  }
}

export async function listPersons(): Promise<Person[]> {
  const all = await db.persons.toArray();
  return all.sort(
    (a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'),
  );
}

export function getPerson(id: string): Promise<Person | undefined> {
  return db.persons.get(id);
}

export function findPersonByCardToken(token: string): Promise<Person | undefined> {
  return db.persons.where('cardToken').equals(token).first();
}

export async function createPerson(raw: PersonInput, now = Date.now()): Promise<Person> {
  const input = normalize(raw);
  return db.transaction('rw', db.persons, async () => {
    if ((await db.persons.count()) >= MAX_PERSONS) {
      throw new ValidationError(`Es können höchstens ${MAX_PERSONS} Personen angelegt werden.`);
    }
    await validate(input);
    const person: Person = {
      ...input,
      id: newId(),
      cardToken: generateCardToken(),
      cardIssuedAt: now,
      cardBlocked: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.persons.add(person);
    return person;
  });
}

export async function updatePerson(id: string, raw: PersonInput, now = Date.now()): Promise<Person> {
  const input = normalize(raw);
  return db.transaction('rw', db.persons, async () => {
    const current = await db.persons.get(id);
    if (!current) throw new ValidationError('Person nicht gefunden.');
    await validate(input, id);
    const updated: Person = {
      ...current,
      ...input,
      // optionale Felder explizit übernehmen, damit Löschen möglich ist
      photo: input.photo,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      note: input.note,
      updatedAt: now,
    };
    await db.persons.put(updated);
    return updated;
  });
}

/** Löscht die Person. Das Protokoll bleibt erhalten (enthält eine Namenskopie). */
export async function deletePerson(id: string): Promise<void> {
  await db.transaction('rw', [db.persons, db.presence], async () => {
    await db.persons.delete(id);
    await db.presence.delete(id);
  });
}

export async function setCardBlocked(id: string, blocked: boolean, now = Date.now()): Promise<void> {
  const changed = await db.persons.update(id, { cardBlocked: blocked, updatedAt: now });
  if (!changed) throw new ValidationError('Person nicht gefunden.');
}

/** Stellt einen neuen Ausweis aus. Der bisherige QR-Code wird damit ungültig. */
export async function reissueCard(id: string, now = Date.now()): Promise<Person> {
  return db.transaction('rw', db.persons, async () => {
    const current = await db.persons.get(id);
    if (!current) throw new ValidationError('Person nicht gefunden.');
    const updated: Person = {
      ...current,
      cardToken: generateCardToken(),
      cardIssuedAt: now,
      cardBlocked: false,
      updatedAt: now,
    };
    await db.persons.put(updated);
    return updated;
  });
}

/** Schlägt die nächste freie ID im Format P-0001 vor. */
export async function suggestPersonnelNo(prefix = 'P-'): Promise<string> {
  const all = await db.persons.toArray();
  let max = 0;
  for (const p of all) {
    if (p.personnelNo.startsWith(prefix)) {
      const n = Number.parseInt(p.personnelNo.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}
