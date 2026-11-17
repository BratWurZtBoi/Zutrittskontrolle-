/**
 * Fiktive Testkarten. Alle Namen sind frei erfunden; statt echter Fotos
 * werden neutrale Platzhalter-Avatare (Initialen) erzeugt.
 */
import { addDays, toLocalDateString } from '../domain/dates';
import type { CardHolder, CardUpdate } from '../domain/types';
import { db } from './db';
import { createCards, setCardBlocked, updateCard } from './cards';
import { DEFAULT_GROUPS, ensureDefaultGroups } from './groups';

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

interface SeedCard {
  rank?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  room?: string;
  accessGranted?: boolean;
  blocked?: boolean;
  validFromDays?: number;
  validUntilDays?: number;
  note?: string;
}

// Fiktive Personen, Einheiten und Räume
const STAFF: SeedCard[] = [
  { rank: 'Hptm', firstName: 'Max', lastName: 'Mustermann', company: '1. Kompanie', position: 'Kompaniechef', room: '2.14' },
  { rank: 'OFw', firstName: 'Erika', lastName: 'Musterfrau', company: 'Stab', position: 'S4', room: '1.03' },
  { rank: 'StFw', firstName: 'Hans', lastName: 'Beispiel', company: 'Stab', position: 'Admin', room: '1.05' },
  { rank: 'Lt', firstName: 'Lena', lastName: 'Probe', company: '2. Kompanie', position: 'Zugführerin', room: '3.02' },
  { rank: 'HptGefr', firstName: 'Tom', lastName: 'Testmann', company: 'Versorgung', position: 'Kraftfahrer', room: 'H1' },
  { rank: 'Uffz', firstName: 'Paul', lastName: 'Platzhalter', company: 'Versorgung', blocked: true, note: 'Vorübergehend gesperrt' },
  { rank: 'OGefr', firstName: 'Clara', lastName: 'Fiktiv', company: 'Stab', accessGranted: false, note: 'Keine Berechtigung' },
  { firstName: 'Jonas', lastName: 'Demo', company: 'Aushilfe', validFromDays: -90, validUntilDays: -1, note: 'Vertrag beendet' },
  { rank: 'Fhr', firstName: 'Sophie', lastName: 'Zukunft', company: '1. Kompanie', validFromDays: 30, note: 'Beginnt in 30 Tagen' },
];

const VISITORS: SeedCard[] = [
  { firstName: 'Felix', lastName: 'Gast', company: 'Beispiel GmbH', validUntilDays: 0, note: 'Termin bei Max Mustermann' },
  { firstName: 'Mia', lastName: 'Lieferant', company: 'Muster Logistik', validUntilDays: 0 },
  {},
  {},
  {},
];

/**
 * Legt fiktive Testkarten an (nur wenn noch keine Testdaten vorhanden). Liefert die Anzahl.
 * Die Personendaten werden verschlüsselt gespeichert – die Daten müssen entsperrt sein.
 */
export async function seedTestCards(today = new Date()): Promise<number> {
  await ensureDefaultGroups();
  if ((await db.cards.filter((c) => c.testData === true).count()) > 0) return 0;
  const groups = await db.groups.toArray();
  const staffGroup = groups.find((g) => g.prefix === DEFAULT_GROUPS[0]?.prefix) ?? groups[0];
  const visitorGroup = groups.find((g) => g.prefix === DEFAULT_GROUPS[1]?.prefix) ?? groups[1] ?? groups[0];
  if (!staffGroup || !visitorGroup) return 0;

  let created = 0;
  let avatar = 0;
  for (const [groupId, list] of [
    [staffGroup.id, STAFF],
    [visitorGroup.id, VISITORS],
  ] as const) {
    const cards = await createCards({ groupId, count: list.length, testData: true });
    for (const [i, s] of list.entries()) {
      const card = cards[i];
      if (!card) continue;
      created++;
      if (!s.firstName || !s.lastName) continue;
      const holder: CardHolder = {
        rank: s.rank,
        firstName: s.firstName,
        lastName: s.lastName,
        company: s.company,
        position: s.position,
        room: s.room,
        photo: placeholderAvatar(s.firstName, s.lastName, avatar++),
        note: s.note ? `Fiktive Testperson – ${s.note}` : 'Fiktive Testperson',
      };
      const update: CardUpdate = {
        accessGranted: s.accessGranted ?? true,
        validFrom: s.validFromDays !== undefined ? toLocalDateString(addDays(today, s.validFromDays)) : undefined,
        validUntil: s.validUntilDays !== undefined ? toLocalDateString(addDays(today, s.validUntilDays)) : undefined,
        holder,
      };
      await updateCard(card.id, update);
      if (s.blocked) await setCardBlocked(card.id, true);
    }
  }
  return created;
}

/** Entfernt alle Testkarten inkl. deren Protokolleinträge und Anwesenheit. */
export async function removeTestCards(): Promise<number> {
  return db.transaction('rw', [db.cards, db.presence, db.events], async () => {
    const ids = (await db.cards.toArray()).filter((c) => c.testData).map((c) => c.id);
    await db.cards.bulkDelete(ids);
    await db.presence.bulkDelete(ids);
    await db.events.where('cardId').anyOf(ids).delete();
    return ids.length;
  });
}
