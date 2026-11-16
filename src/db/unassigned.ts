/**
 * „Nicht zugeordnet“: Personen aus dem CSV-Import ohne (bekannte) Gruppe.
 * Sie haben noch keine Karte und können daher weder scannen noch anwesend sein.
 * Beim Zuordnen zu einer Gruppe bekommen sie zuerst eine freie Karte dieser Gruppe,
 * sonst wird eine neue Karte angelegt.
 */
import { holderName } from '../domain/texts';
import type { CardHolder, UnassignedPerson, UnassignedRecord } from '../domain/types';
import { decryptJson, encryptJson, encryptText } from '../security/crypto';
import { cachedDecrypt } from '../security/decryptCache';
import { getDataKey } from '../security/session';
import { MAX_BATCH, MAX_CARDS, createCards, listFreeCards, normalizeHolder, requireKey } from './cards';
import { ValidationError, db, newId } from './db';

/** Obergrenze, damit eine versehentlich riesige Datei das Gerät nicht überlastet. */
export const MAX_UNASSIGNED = 1000;

/** Datensatz → Ansicht (Personendaten nur, wenn entsperrt). Nie innerhalb einer Transaktion aufrufen. */
export async function toUnassignedPerson(record: UnassignedRecord, key: CryptoKey | null = getDataKey()): Promise<UnassignedPerson> {
  const { holderEnc, ...rest } = record;
  let holder: CardHolder | undefined;
  if (key) {
    try {
      holder = await cachedDecrypt(key, holderEnc, () => decryptJson<CardHolder>(key, holderEnc));
    } catch {
      holder = undefined;
    }
  }
  return { ...rest, holder };
}

/** Alle nicht zugeordneten Personen, älteste zuerst. */
export async function listUnassigned(): Promise<UnassignedPerson[]> {
  const records = await db.unassigned.orderBy('createdAt').toArray();
  const key = getDataKey();
  return Promise.all(records.map((r) => toUnassignedPerson(r, key)));
}

export function countUnassigned(): Promise<number> {
  return db.unassigned.count();
}

export interface NewUnassigned {
  holder: CardHolder;
  accessGranted: boolean;
  validFrom?: string;
  validUntil?: string;
  groupHint?: string;
}

/** Personen unter „Nicht zugeordnet“ ablegen (verschlüsselt). */
export async function addUnassigned(items: NewUnassigned[], now = Date.now()): Promise<number> {
  if (items.length === 0) return 0;
  const key = requireKey();
  if ((await db.unassigned.count()) + items.length > MAX_UNASSIGNED) {
    throw new ValidationError(`Es sind höchstens ${MAX_UNASSIGNED} nicht zugeordnete Personen möglich.`);
  }
  const records: UnassignedRecord[] = await Promise.all(
    items.map(async (item, i) => {
      const holder = normalizeHolder(item.holder);
      if (!holder) throw new ValidationError('Vor- oder Nachname fehlt.');
      return {
        id: newId(),
        holderEnc: await encryptJson(key, holder),
        accessGranted: item.accessGranted,
        validFrom: item.validFrom,
        validUntil: item.validUntil,
        groupHint: item.groupHint?.trim() || undefined,
        createdAt: now + i, // Reihenfolge der Datei beibehalten
      };
    }),
  );
  await db.unassigned.bulkAdd(records);
  return records.length;
}

export async function deleteUnassigned(ids: string[]): Promise<number> {
  const existing = (await db.unassigned.bulkGet(ids)).filter(Boolean).length;
  await db.unassigned.bulkDelete(ids);
  return existing;
}

export interface AssignedPerson {
  cardId: string;
  number: string;
  name: string;
}

export interface AssignUnassignedResult {
  assigned: AssignedPerson[];
  /** Davon neu angelegte Karten. */
  created: number;
}

/**
 * Personen einer Gruppe zuordnen: der Reihe nach die freien Karten der Gruppe
 * (nach Nummer), danach neue Karten. Zutritt und Gültigkeit aus dem Import werden
 * übernommen. Jede Person wird einzeln in einer Transaktion umgezogen.
 */
export async function assignUnassigned(ids: string[], groupId: string, now = Date.now()): Promise<AssignUnassignedResult> {
  const key = requireKey();
  const group = await db.groups.get(groupId);
  if (!group) throw new ValidationError('Bitte eine Gruppe wählen.');
  const records = (await db.unassigned.bulkGet(ids))
    .filter((r): r is UnassignedRecord => Boolean(r))
    .sort((a, b) => a.createdAt - b.createdAt);
  if (records.length === 0) return { assigned: [], created: 0 };

  // erst lesen und entschlüsseln, dann schreiben
  const people = await Promise.all(
    records.map(async (record) => {
      const holder = await decryptJson<CardHolder>(key, record.holderEnc);
      return { record, name: holderName(holder) ?? '', nameEnc: await encryptText(key, holderName(holder) ?? '') };
    }),
  );
  const free = await listFreeCards(groupId);
  const missing = Math.max(0, people.length - free.length);
  if (missing > 0 && (await db.cards.count()) + missing > MAX_CARDS) {
    throw new ValidationError(
      `Es sind höchstens ${MAX_CARDS} Karten möglich – für ${missing} neue Karte(n) der Gruppe „${group.name}“ ist kein Platz mehr.`,
    );
  }
  const created: { id: string; number: string }[] = [];
  for (let left = missing; left > 0; left -= MAX_BATCH) {
    created.push(...(await createCards({ groupId, count: Math.min(MAX_BATCH, left), now })));
  }
  const targets = [...free, ...created];

  const result: AssignUnassignedResult = { assigned: [], created: created.length };
  for (const [i, person] of people.entries()) {
    const target = targets[i];
    if (!target) break;
    const moved = await db.transaction('rw', [db.cards, db.unassigned], async () => {
      const [card, waiting] = await Promise.all([db.cards.get(target.id), db.unassigned.get(person.record.id)]);
      if (!card || !waiting) return false;
      if (card.holderEnc || card.holder || card.blocked || card.lostAt) return false; // inzwischen vergeben
      await db.cards.put({
        ...card,
        accessGranted: waiting.accessGranted,
        validFrom: waiting.validFrom,
        validUntil: waiting.validUntil,
        holderEnc: waiting.holderEnc, // gleicher Datenschlüssel – kein erneutes Verschlüsseln nötig
        nameEnc: person.nameEnc,
        holderSince: now,
        updatedAt: now,
      });
      await db.unassigned.delete(waiting.id);
      return true;
    });
    if (moved) result.assigned.push({ cardId: target.id, number: target.number, name: person.name });
  }
  return result;
}
