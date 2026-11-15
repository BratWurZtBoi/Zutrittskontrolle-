/**
 * Fiktive Testpersonen. Alle Namen sind frei erfunden; statt echter Fotos
 * werden neutrale Platzhalter-Avatare (Initialen) erzeugt.
 */
import { addDays, toLocalDateString } from '../domain/dates';
import type { PersonInput } from '../domain/types';
import { db } from './db';
import { createPerson, setCardBlocked } from './persons';

const COLORS = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626'];

export function placeholderAvatar(firstName: string, lastName: string, index: number): string {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  const color = COLORS[index % COLORS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">` +
    `<rect width="300" height="400" fill="${color}"/>` +
    `<circle cx="150" cy="150" r="70" fill="#ffffff" fill-opacity="0.25"/>` +
    `<rect x="55" y="240" width="190" height="160" rx="95" fill="#ffffff" fill-opacity="0.25"/>` +
    `<text x="150" y="172" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" ` +
    `fill="#ffffff" text-anchor="middle">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

interface SeedPerson {
  firstName: string;
  lastName: string;
  accessGranted?: boolean;
  blocked?: boolean;
  validFromDays?: number;
  validUntilDays?: number;
  note?: string;
}

const SEED: SeedPerson[] = [
  { firstName: 'Max', lastName: 'Mustermann' },
  { firstName: 'Erika', lastName: 'Musterfrau' },
  { firstName: 'Hans', lastName: 'Beispiel' },
  { firstName: 'Lena', lastName: 'Probe' },
  { firstName: 'Tom', lastName: 'Testmann' },
  { firstName: 'Mia', lastName: 'Muster' },
  { firstName: 'Anna', lastName: 'Exempel' },
  { firstName: 'Felix', lastName: 'Gast', validUntilDays: 60, note: 'Besucher – befristet' },
  { firstName: 'Paul', lastName: 'Platzhalter', blocked: true, note: 'Ausweis als verloren gemeldet' },
  { firstName: 'Clara', lastName: 'Fiktiv', accessGranted: false, note: 'Keine Berechtigung' },
  { firstName: 'Jonas', lastName: 'Demo', validFromDays: -90, validUntilDays: -1, note: 'Berechtigung abgelaufen' },
  { firstName: 'Sophie', lastName: 'Zukunft', validFromDays: 30, note: 'Startet erst in 30 Tagen' },
];

/** Legt die Testpersonen an (überspringt bereits vorhandene IDs). Liefert die Anzahl neu angelegter. */
export async function seedTestPersons(today = new Date()): Promise<number> {
  let created = 0;
  for (const [i, s] of SEED.entries()) {
    const personnelNo = `T-${String(i + 1).padStart(3, '0')}`;
    if (await db.persons.where('personnelNo').equals(personnelNo).first()) continue;
    const input: PersonInput = {
      personnelNo,
      firstName: s.firstName,
      lastName: s.lastName,
      photo: placeholderAvatar(s.firstName, s.lastName, i),
      accessGranted: s.accessGranted ?? true,
      validFrom: s.validFromDays !== undefined ? toLocalDateString(addDays(today, s.validFromDays)) : undefined,
      validUntil: s.validUntilDays !== undefined ? toLocalDateString(addDays(today, s.validUntilDays)) : undefined,
      note: s.note ? `Fiktive Testperson – ${s.note}` : 'Fiktive Testperson',
      testData: true,
    };
    const person = await createPerson(input);
    if (s.blocked) await setCardBlocked(person.id, true);
    created++;
  }
  return created;
}

/** Entfernt alle als Testdaten markierten Personen inkl. deren Protokolleinträge. */
export async function removeTestPersons(): Promise<number> {
  return db.transaction('rw', [db.persons, db.presence, db.events], async () => {
    const ids = (await db.persons.toArray()).filter((p) => p.testData).map((p) => p.id);
    await db.persons.bulkDelete(ids);
    await db.presence.bulkDelete(ids);
    await db.events.where('personId').anyOf(ids).delete();
    return ids.length;
  });
}
