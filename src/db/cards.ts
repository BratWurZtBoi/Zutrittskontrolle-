import { generateCardToken } from '../domain/cardCode';
import { isValidIsoDate } from '../domain/dates';
import { holderName } from '../domain/texts';
import type { AccessEventRecord, Card, CardHolder, CardRecord, CardUpdate, Group } from '../domain/types';
import { decryptJson, encryptJson, encryptText } from '../security/crypto';
import { cachedDecrypt } from '../security/decryptCache';
import { getDataKey } from '../security/session';
import { ValidationError, db, newId } from './db';

/**
 * Wandelt einen gespeicherten Datensatz in die Ansicht für die Oberfläche um.
 * Personendaten werden nur entschlüsselt, wenn die Daten entsperrt sind.
 * Wichtig: Entschlüsselung immer NACH dem Lesen, nie innerhalb einer Transaktion.
 */
export async function toCard(record: CardRecord, key: CryptoKey | null = getDataKey()): Promise<Card> {
  const { holderEnc, nameEnc: _nameEnc, holder: legacy, ...rest } = record;
  let holder: CardHolder | undefined = legacy;
  if (holderEnc && key) {
    try {
      holder = await cachedDecrypt(key, holderEnc, () => decryptJson<CardHolder>(key, holderEnc));
    } catch {
      holder = undefined; // falscher Schlüssel / beschädigt – wie gesperrt behandeln
    }
  }
  return { ...rest, hasHolder: Boolean(holderEnc || legacy), holder };
}

function requireKey(): CryptoKey {
  const key = getDataKey();
  if (!key) throw new ValidationError('Die Daten sind gesperrt. Bitte zuerst mit dem Admin-Passwort entsperren.');
  return key;
}

export const MAX_CARDS = 500;
export const MAX_BATCH = 100;

function formatNumber(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

/** Höchste vergebene laufende Nummer einer Gruppe (Format PREFIX-NNN). */
async function highestNumber(prefix: string): Promise<number> {
  const all = await db.cards.toArray();
  let max = 0;
  for (const c of all) {
    if (c.number.startsWith(`${prefix}-`)) {
      const n = Number.parseInt(c.number.slice(prefix.length + 1), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

/** Nächste freie Kartennummern einer Gruppe, z. B. ["B-006", "B-007"]. */
export async function suggestNumbers(groupId: string, count: number): Promise<string[]> {
  const group = await db.groups.get(groupId);
  if (!group) return [];
  const start = (await highestNumber(group.prefix)) + 1;
  return Array.from({ length: count }, (_, i) => formatNumber(group.prefix, start + i));
}

export interface CreateCardsOptions {
  groupId: string;
  count: number;
  /** Nur bei einer einzelnen Karte: eigene Kartennummer statt der automatischen. */
  number?: string;
  testData?: boolean;
  now?: number;
}

/** Erstellt eine oder mehrere Karten (ohne Personendaten) mit fortlaufender Nummer. */
export async function createCards(opts: CreateCardsOptions): Promise<Card[]> {
  const now = opts.now ?? Date.now();
  if (!Number.isInteger(opts.count) || opts.count < 1 || opts.count > MAX_BATCH) {
    throw new ValidationError(`Es können 1 bis ${MAX_BATCH} Karten auf einmal erstellt werden.`);
  }
  return db.transaction('rw', [db.cards, db.groups], async () => {
    const group = await db.groups.get(opts.groupId);
    if (!group) throw new ValidationError('Bitte eine Gruppe wählen.');
    const existing = await db.cards.count();
    if (existing + opts.count > MAX_CARDS) {
      throw new ValidationError(`Es sind höchstens ${MAX_CARDS} Karten möglich (vorhanden: ${existing}).`);
    }

    let numbers: string[];
    const custom = opts.number?.trim();
    if (custom && opts.count === 1) {
      if (custom.length > 20) throw new ValidationError('Die Kartennummer darf höchstens 20 Zeichen lang sein.');
      if (await db.cards.where('number').equals(custom).first()) {
        throw new ValidationError(`Die Kartennummer „${custom}“ ist bereits vergeben.`);
      }
      numbers = [custom];
    } else {
      const start = (await highestNumber(group.prefix)) + 1;
      numbers = Array.from({ length: opts.count }, (_, i) => formatNumber(group.prefix, start + i));
    }

    const cards: CardRecord[] = numbers.map((number) => ({
      id: newId(),
      number,
      groupId: group.id,
      token: generateCardToken(),
      tokenIssuedAt: now,
      blocked: false,
      accessGranted: true,
      testData: opts.testData || undefined,
      createdAt: now,
      updatedAt: now,
    }));
    await db.cards.bulkAdd(cards);
    return cards;
  }).then((records) => Promise.all(records.map((r) => toCard(r))));
}

export async function getCard(id: string): Promise<Card | undefined> {
  const record = await db.cards.get(id);
  return record ? toCard(record) : undefined;
}

export interface CardWithGroup {
  card: Card;
  group: Group | undefined;
}

/** Alle Karten, sortiert nach Gruppe und Nummer. */
export async function listCards(): Promise<CardWithGroup[]> {
  // erst alle Datenbankzugriffe, dann entschlüsseln (wichtig für liveQuery)
  const [records, groups] = await Promise.all([db.cards.toArray(), db.groups.toArray()]);
  const key = getDataKey();
  const cards = await Promise.all(records.map((r) => toCard(r, key)));
  const byId = new Map(groups.map((g) => [g.id, g]));
  return cards
    .map((card) => ({ card, group: byId.get(card.groupId) }))
    .sort(
      (a, b) =>
        (a.group?.sortOrder ?? 0) - (b.group?.sortOrder ?? 0) ||
        a.card.number.localeCompare(b.card.number, 'de', { numeric: true }),
    );
}

function normalizeHolder(holder: CardHolder | undefined): CardHolder | undefined {
  if (!holder) return undefined;
  const h: CardHolder = {
    firstName: holder.firstName.trim(),
    lastName: holder.lastName.trim(),
    company: holder.company?.trim() || undefined,
    photo: holder.photo || undefined,
    note: holder.note?.trim() || undefined,
  };
  if (!h.firstName && !h.lastName) {
    throw new ValidationError('Bitte mindestens Vor- oder Nachnamen eingeben – oder die Zuordnung entfernen.');
  }
  return h;
}

function validateDates(validFrom?: string, validUntil?: string): void {
  if (validFrom && !isValidIsoDate(validFrom)) throw new ValidationError('„Gültig ab“ ist kein gültiges Datum.');
  if (validUntil && !isValidIsoDate(validUntil)) throw new ValidationError('„Gültig bis“ ist kein gültiges Datum.');
  if (validFrom && validUntil && validFrom > validUntil) {
    throw new ValidationError('„Gültig bis“ liegt vor „Gültig ab“.');
  }
}

/** Speichert Berechtigung und Personendaten einer Karte (nur entsperrt möglich). */
export async function updateCard(id: string, update: CardUpdate, now = Date.now()): Promise<Card> {
  const validFrom = update.validFrom?.trim() || undefined;
  const validUntil = update.validUntil?.trim() || undefined;
  validateDates(validFrom, validUntil);
  const holder = normalizeHolder(update.holder);
  const key = requireKey();

  // Vorbereitung außerhalb der Transaktion: bisherige Person ermitteln, neue verschlüsseln
  const before = await db.cards.get(id);
  if (!before) throw new ValidationError('Karte nicht gefunden.');
  const previous = (await toCard(before, key)).holder;
  const personChanged = holderName(previous) !== holderName(holder);
  const holderEnc = holder ? await encryptJson(key, holder) : undefined;
  const nameEnc = holder ? await encryptText(key, holderName(holder) ?? '') : undefined;

  const record = await db.transaction('rw', [db.cards, db.presence, db.events, db.groups], async () => {
    const current = await db.cards.get(id);
    if (!current) throw new ValidationError('Karte nicht gefunden.');
    if (personChanged && (current.holderEnc || current.holder)) await checkOutIfPresent(current, now);
    const { holder: _legacy, ...rest } = current;
    const updated: CardRecord = {
      ...rest,
      accessGranted: update.accessGranted,
      validFrom,
      validUntil,
      holderEnc,
      nameEnc,
      holderSince: holder ? (personChanged ? now : current.holderSince) : undefined,
      updatedAt: now,
    };
    await db.cards.put(updated);
    return updated;
  });
  return toCard(record, key);
}

/**
 * Karte zurückgeben (z. B. Besucherkarte): bucht aus, entfernt Personendaten
 * und Gültigkeit – die Karte ist danach frei für die nächste Person.
 */
export async function returnCard(id: string, now = Date.now()): Promise<Card> {
  const record = await db.transaction('rw', [db.cards, db.presence, db.events, db.groups], async () => {
    const current = await db.cards.get(id);
    if (!current) throw new ValidationError('Karte nicht gefunden.');
    await checkOutIfPresent(current, now);
    const { holder: _legacy, holderEnc: _h, nameEnc: _n, ...rest } = current;
    const updated: CardRecord = {
      ...rest,
      holderSince: undefined,
      validFrom: undefined,
      validUntil: undefined,
      updatedAt: now,
    };
    await db.cards.put(updated);
    return updated;
  });
  return toCard(record);
}

/**
 * Bucht eine anwesende Karte automatisch aus (Protokolleintrag mit Quelle „system“).
 * Der verschlüsselte Name wird unverändert übernommen – kein Schlüssel nötig.
 */
async function checkOutIfPresent(card: CardRecord, now: number): Promise<void> {
  const presence = await db.presence.get(card.id);
  if (presence?.status !== 'in') return;
  const group = await db.groups.get(card.groupId);
  const event: AccessEventRecord = {
    timestamp: now,
    outcome: 'granted',
    direction: 'out',
    reason: 'OK',
    cardId: card.id,
    cardNumber: card.number,
    groupId: card.groupId,
    groupName: group?.name,
    holderNameEnc: card.nameEnc,
    holderName: card.nameEnc ? undefined : holderName(card.holder),
    source: 'system',
  };
  await db.events.add(event);
  await db.presence.put({ cardId: card.id, status: 'out', lastBookingAt: now, bySystem: true });
}

/** Bucht alle anwesenden Karten aus (z. B. am Tagesende). Liefert die Anzahl. */
export async function checkOutAll(now = Date.now()): Promise<number> {
  return db.transaction('rw', [db.cards, db.presence, db.events, db.groups], async () => {
    const present = await db.presence.where('status').equals('in').toArray();
    let count = 0;
    for (const p of present) {
      const card = await db.cards.get(p.cardId);
      if (card) {
        await checkOutIfPresent(card, now);
        count++;
      } else {
        await db.presence.delete(p.cardId);
      }
    }
    return count;
  });
}

export async function setCardBlocked(id: string, blocked: boolean, now = Date.now()): Promise<void> {
  const changed = await db.cards.update(id, { blocked, updatedAt: now });
  if (!changed) throw new ValidationError('Karte nicht gefunden.');
}

/** Neuer QR-Code für die Karte (z. B. bei Verlust). Der bisherige Code wird ungültig. */
export async function reissueToken(id: string, now = Date.now()): Promise<Card> {
  const record = await db.transaction('rw', db.cards, async () => {
    const current = await db.cards.get(id);
    if (!current) throw new ValidationError('Karte nicht gefunden.');
    const updated: CardRecord = { ...current, token: generateCardToken(), tokenIssuedAt: now, blocked: false, updatedAt: now };
    await db.cards.put(updated);
    return updated;
  });
  return toCard(record);
}

// ---------------------------------------------------------------------------
// Mehrfachauswahl
// ---------------------------------------------------------------------------

/**
 * Personendaten mehrerer Karten entfernen (wie „Karte zurückgeben“): bucht aus,
 * entfernt Personendaten und Gültigkeit. Liefert die Anzahl geänderter Karten.
 */
export async function returnCards(ids: string[], now = Date.now()): Promise<number> {
  return db.transaction('rw', [db.cards, db.presence, db.events, db.groups], async () => {
    let count = 0;
    for (const id of ids) {
      const current = await db.cards.get(id);
      if (!current || !(current.holderEnc || current.holder || current.validFrom || current.validUntil)) continue;
      await checkOutIfPresent(current, now);
      const { holder: _legacy, holderEnc: _h, nameEnc: _n, ...rest } = current;
      await db.cards.put({ ...rest, holderSince: undefined, validFrom: undefined, validUntil: undefined, updatedAt: now });
      count++;
    }
    return count;
  });
}

/** Mehrere Karten sperren oder entsperren. */
export async function setCardsBlocked(ids: string[], blocked: boolean, now = Date.now()): Promise<number> {
  return db.cards.where('id').anyOf(ids).modify({ blocked, updatedAt: now });
}

/** Mehrere Karten löschen (Protokoll bleibt erhalten). */
export async function deleteCards(ids: string[]): Promise<number> {
  return db.transaction('rw', [db.cards, db.presence], async () => {
    const existing = (await db.cards.bulkGet(ids)).filter(Boolean).length;
    await db.cards.bulkDelete(ids);
    await db.presence.bulkDelete(ids);
    return existing;
  });
}

/** Löscht die Karte. Das Protokoll bleibt erhalten (enthält Momentaufnahmen). */
export async function deleteCard(id: string): Promise<void> {
  await db.transaction('rw', [db.cards, db.presence], async () => {
    await db.cards.delete(id);
    await db.presence.delete(id);
  });
}
