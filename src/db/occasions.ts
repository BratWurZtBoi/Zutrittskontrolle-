/**
 * Veranstaltungen: Gästeliste (verschlüsselt), Einlass mit Einmal-Codes, eigenes Einlass-Protokoll.
 * Web Crypto nie innerhalb einer Transaktion: erst lesen, dann (ent)schlüsseln, dann schreiben.
 */
import { entryBlocker, type Decision } from '../domain/access';
import { normalizeCardLayout, type CardLayout } from '../domain/cardLayout';
import { generateCardToken, parseAppCode } from '../domain/cardCode';
import { isValidIsoDate, toLocalDateString } from '../domain/dates';
import {
  OCCASION_COLORS,
  cardAdmissions,
  decideCardGuestEntry,
  decideGuestEntry,
  guestName,
  repeatEntryDecision,
  type Guest,
  type GuestPerson,
  type GuestRecord,
  type Occasion,
  type OccasionLogEntry,
  type OccasionLogRecord,
} from '../domain/occasion';
import type { AccessEventRecord, Card, CardRecord, Group } from '../domain/types';
import { decryptJson, decryptText, encryptJson, encryptText } from '../security/crypto';
import { cachedDecrypt } from '../security/decryptCache';
import { getDataKey } from '../security/session';
import { requireKey, toCard } from './cards';
import { ValidationError, db, newId } from './db';
import type { ScanOutcome } from './scans';
import { loadSettings, saveSettings } from './settings';

export const MAX_GUESTS = 2000;

// ---------------------------------------------------------------------------
// Veranstaltungen
// ---------------------------------------------------------------------------

export type OccasionInput = Omit<Occasion, 'id' | 'createdAt' | 'updatedAt'>;

function normalizeOccasion(input: OccasionInput): OccasionInput {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Bitte einen Namen für die Veranstaltung eingeben.');
  if (!isValidIsoDate(input.date)) throw new ValidationError('Bitte ein gültiges Datum eingeben.');
  const time = (t?: string) => (t && /^\d{2}:\d{2}$/.test(t) ? t : undefined);
  return {
    ...input,
    name: name.slice(0, 80),
    location: input.location?.trim() || undefined,
    entryFrom: time(input.entryFrom),
    entryUntil: time(input.entryUntil),
    resultLayoutId: input.resultLayoutId || undefined,
    idleLayoutId: input.idleLayoutId || undefined,
  };
}

export interface OccasionSummary extends Occasion {
  guests: number;
  admitted: number;
}

/** Alle Veranstaltungen, neueste zuerst, mit Anzahl Gäste/Eingelassene (ohne Entschlüsseln). */
export async function listOccasions(): Promise<OccasionSummary[]> {
  const [occasions, guests] = await Promise.all([db.occasions.toArray(), db.guests.toArray()]);
  return occasions
    .map((o) => {
      const own = guests.filter((g) => g.occasionId === o.id && !g.cancelled);
      return { ...o, guests: own.length, admitted: own.filter((g) => g.admittedAt !== undefined).length };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function getOccasion(id: string): Promise<Occasion | undefined> {
  return db.occasions.get(id);
}

/** Vorschlag für eine neue Veranstaltung (heute, nächste freie Farbe). */
export async function newOccasionDefaults(now = new Date()): Promise<OccasionInput> {
  const count = await db.occasions.count();
  return { name: '', date: toLocalDateString(now), color: OCCASION_COLORS[count % OCCASION_COLORS.length]!, cardsAllowed: false };
}

export async function createOccasion(input: OccasionInput, now = Date.now()): Promise<Occasion> {
  const occasion: Occasion = { ...normalizeOccasion(input), id: newId(), createdAt: now, updatedAt: now };
  await db.occasions.add(occasion);
  return occasion;
}

export async function updateOccasion(id: string, input: OccasionInput, now = Date.now()): Promise<Occasion> {
  const current = await db.occasions.get(id);
  if (!current) throw new ValidationError('Veranstaltung nicht gefunden.');
  const next: Occasion = { ...current, ...normalizeOccasion(input), updatedAt: now };
  await db.occasions.put(next);
  return next;
}

/** Einladung (Serienbrief-Layout) der Veranstaltung speichern. */
export async function saveInvitation(occasionId: string, layout: CardLayout, now = Date.now()): Promise<void> {
  const invitation = normalizeCardLayout({ ...layout, id: `einladung-${occasionId}`, updatedAt: now });
  const changed = await db.occasions.update(occasionId, { invitation, updatedAt: now });
  if (!changed) throw new ValidationError('Veranstaltung nicht gefunden.');
}

/** Löscht die Veranstaltung mit Gästeliste und Einlass-Protokoll. Läuft gerade der Einlass, wird er beendet. */
export async function deleteOccasion(id: string): Promise<void> {
  await db.transaction('rw', [db.occasions, db.guests, db.occasionLog], async () => {
    await db.guests.where('occasionId').equals(id).delete();
    await db.occasionLog.where('occasionId').equals(id).delete();
    await db.occasions.delete(id);
  });
  if ((await loadSettings()).activeOccasionId === id) await saveSettings({ activeOccasionId: undefined });
}

// ---------------------------------------------------------------------------
// Einlass-Modus (je Gerät)
// ---------------------------------------------------------------------------

export async function startEntry(id: string): Promise<void> {
  if (!(await db.occasions.get(id))) throw new ValidationError('Veranstaltung nicht gefunden.');
  await saveSettings({ activeOccasionId: id });
}

export async function endEntry(): Promise<void> {
  await saveSettings({ activeOccasionId: undefined });
}

/** Veranstaltung, deren Einlass auf diesem Gerät läuft (oder undefined). */
export async function loadActiveOccasion(): Promise<Occasion | undefined> {
  const id = (await loadSettings()).activeOccasionId;
  return id ? db.occasions.get(id) : undefined;
}

// ---------------------------------------------------------------------------
// Gäste
// ---------------------------------------------------------------------------

export async function toGuest(record: GuestRecord, key: CryptoKey | null = getDataKey()): Promise<Guest> {
  const { personEnc, nameEnc: _nameEnc, ...rest } = record;
  let person: GuestPerson | undefined;
  if (personEnc && key) {
    try {
      person = await cachedDecrypt(key, personEnc, () => decryptJson<GuestPerson>(key, personEnc));
    } catch {
      person = undefined;
    }
  }
  return { ...rest, person, hasPerson: Boolean(personEnc) };
}

/** Gäste einer Veranstaltung, nach Nummer (entschlüsselt, sofern entsperrt). */
export async function listGuests(occasionId: string): Promise<Guest[]> {
  const records = await db.guests.where('occasionId').equals(occasionId).toArray();
  const key = getDataKey();
  const guests = await Promise.all(records.map((r) => toGuest(r, key)));
  return guests.sort((a, b) => a.number - b.number);
}

/** Nur die Kennzahlen-Felder (ohne Entschlüsseln) – z. B. für die Statusleiste. */
export function listGuestRecords(occasionId: string): Promise<GuestRecord[]> {
  return db.guests.where('occasionId').equals(occasionId).toArray();
}

export function normalizeGuestPerson(p: GuestPerson): GuestPerson {
  const t = (v?: string) => v?.trim() || undefined;
  const person: GuestPerson = {
    salutation: t(p.salutation),
    rank: t(p.rank),
    firstName: p.firstName.trim(),
    lastName: p.lastName.trim(),
    company: t(p.company),
    email: t(p.email),
    note: t(p.note),
  };
  if (!person.firstName && !person.lastName) throw new ValidationError('Bitte mindestens Vor- oder Nachnamen eingeben.');
  if (person.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) throw new ValidationError(`E-Mail-Adresse „${person.email}“ ist ungültig.`);
  return person;
}

async function encryptPerson(key: CryptoKey, person: GuestPerson) {
  return { personEnc: await encryptJson(key, person), nameEnc: await encryptText(key, guestName(person) ?? '') };
}

export interface NewGuest {
  person: GuestPerson;
  category?: string;
  /** Zutritt mit dieser vorhandenen Karte statt Einladung (null beim Bearbeiten = Verknüpfung lösen). */
  cardId?: string | null;
}

/** Karte für einen Gast prüfen und die Verknüpfungsfelder liefern (in einer Transaktion aufrufen). */
async function cardLink(occasionId: string, cardId: string, guestId?: string): Promise<Pick<GuestRecord, 'cardId' | 'cardNumber' | 'cardHolderSince'>> {
  const card = await db.cards.get(cardId);
  if (!card) throw new ValidationError('Die Karte gibt es nicht (mehr).');
  if (!card.holderEnc && !card.holder) throw new ValidationError(`Karte ${card.number} ist keiner Person zugeordnet.`);
  if (card.lostAt || card.blocked) throw new ValidationError(`Karte ${card.number} ist gesperrt bzw. verloren gemeldet.`);
  const taken = await db.guests
    .where('occasionId')
    .equals(occasionId)
    .filter((g) => g.cardId === cardId && g.id !== guestId)
    .first();
  if (taken) throw new ValidationError(`Karte ${card.number} steht schon auf der Gästeliste (Gast Nr. ${taken.number}).`);
  return { cardId: card.id, cardNumber: card.number, cardHolderSince: card.holderSince };
}

/** Gäste hinzufügen (einzeln oder Import). Nummern fortlaufend je Veranstaltung. */
export async function addGuests(occasionId: string, items: NewGuest[], now = Date.now()): Promise<Guest[]> {
  const key = requireKey();
  if (!(await db.occasions.get(occasionId))) throw new ValidationError('Veranstaltung nicht gefunden.');
  const prepared = await Promise.all(
    items.map(async (item) => {
      const person = normalizeGuestPerson(item.person);
      return { ...(await encryptPerson(key, person)), category: item.category?.trim() || undefined };
    }),
  );
  const records = await db.transaction('rw', [db.guests, db.cards], async () => {
    const existing = await db.guests.where('occasionId').equals(occasionId).toArray();
    if (existing.length + prepared.length > MAX_GUESTS) throw new ValidationError(`Höchstens ${MAX_GUESTS} Gäste je Veranstaltung.`);
    let number = existing.reduce((max, g) => Math.max(max, g.number), 0);
    const added: GuestRecord[] = [];
    for (const [i, p] of prepared.entries()) {
      const cardId = items[i]?.cardId;
      const link = cardId ? await cardLink(occasionId, cardId) : {};
      if (link.cardId && added.some((g) => g.cardId === link.cardId)) throw new ValidationError(`Karte ${link.cardNumber} ist doppelt in der Liste.`);
      added.push({ id: newId(), occasionId, number: ++number, token: generateCardToken(), ...p, ...link, createdAt: now, updatedAt: now });
    }
    await db.guests.bulkAdd(added);
    return added;
  });
  return Promise.all(records.map((r) => toGuest(r, key)));
}

export async function addGuest(occasionId: string, item: NewGuest, now = Date.now()): Promise<Guest> {
  const [guest] = await addGuests(occasionId, [item], now);
  return guest!;
}

export async function updateGuest(id: string, item: NewGuest, now = Date.now()): Promise<Guest> {
  const key = requireKey();
  const person = normalizeGuestPerson(item.person);
  const enc = await encryptPerson(key, person);
  const record = await db.transaction('rw', [db.guests, db.cards], async () => {
    const current = await db.guests.get(id);
    if (!current) throw new ValidationError('Gast nicht gefunden.');
    const { cardId: _c, cardNumber: _n, cardHolderSince: _h, ...base } = current;
    // cardId undefined = Verknüpfung unverändert, null = lösen, sonst (neu) verknüpfen
    const link =
      item.cardId === undefined
        ? { cardId: current.cardId, cardNumber: current.cardNumber, cardHolderSince: current.cardHolderSince }
        : item.cardId === null
          ? {}
          : item.cardId === current.cardId
            ? { cardId: current.cardId, cardNumber: current.cardNumber, cardHolderSince: current.cardHolderSince }
            : await cardLink(current.occasionId, item.cardId, id);
    const next: GuestRecord = { ...base, ...enc, ...link, category: item.category?.trim() || undefined, updatedAt: now };
    await db.guests.put(next);
    return next;
  });
  return toGuest(record, key);
}

export async function setGuestCancelled(id: string, cancelled: boolean, now = Date.now()): Promise<void> {
  await db.guests.update(id, { cancelled, updatedAt: now });
}

export async function deleteGuest(id: string): Promise<void> {
  await db.guests.delete(id);
}

/** Personendaten aller Gäste löschen (nach der Veranstaltung) – Zahlen und Zeiten bleiben. */
export async function eraseGuestData(occasionId: string): Promise<number> {
  return db.transaction('rw', [db.guests, db.occasionLog], async () => {
    const guests = await db.guests.where('occasionId').equals(occasionId).toArray();
    const withData = guests.filter((g) => g.personEnc || g.nameEnc);
    await db.guests.bulkPut(withData.map(({ personEnc: _p, nameEnc: _n, ...rest }) => rest));
    const log = await db.occasionLog.where('occasionId').equals(occasionId).toArray();
    await db.occasionLog.bulkPut(log.filter((e) => e.nameEnc).map(({ nameEnc: _n, ...rest }) => rest));
    return withData.length;
  });
}

// ---------------------------------------------------------------------------
// Einlass
// ---------------------------------------------------------------------------

export interface OccasionScanOptions {
  occasionId: string;
  cooldownMs: number;
  source: AccessEventRecord['source'];
  now?: Date;
}

type Brief = Pick<Occasion, 'id' | 'name' | 'color' | 'resultLayoutId'>;
const brief = (o: Occasion): Brief => ({ id: o.id, name: o.name, color: o.color, resultLayoutId: o.resultLayoutId });

/**
 * Scan im Einlass-Modus: Einladung (nur einmal gültig) bzw. Dienstausweis (wenn erlaubt).
 * Wird nicht in Anwesenheit/Protokoll der Zutrittskontrolle gebucht, sondern im Einlass-Protokoll.
 * Liefert null, wenn die Veranstaltung nicht (mehr) existiert – dann gilt die normale Zutrittskontrolle.
 */
export async function processOccasionScan(text: string, opts: OccasionScanOptions): Promise<ScanOutcome | null> {
  const now = opts.now ?? new Date();
  const at = now.getTime();
  const code = parseAppCode(text);

  const result = await db.transaction('rw', [db.occasions, db.guests, db.occasionLog, db.cards, db.groups], async () => {
    const occasion = await db.occasions.get(opts.occasionId);
    if (!occasion) return null;
    const log = (entry: Omit<OccasionLogRecord, 'occasionId' | 'timestamp' | 'source'>) =>
      db.occasionLog.add({ occasionId: occasion.id, timestamp: at, source: opts.source, ...entry });

    if (code?.kind === 'guest') {
      const guest = await db.guests.where('token').equals(code.token).first();
      const decision = decideGuestEntry({ guest, occasionId: occasion.id, now, cooldownMs: opts.cooldownMs });
      let record = guest;
      if (guest && decision.outcome === 'granted') {
        record = { ...guest, admittedAt: at, admittedSource: opts.source, updatedAt: at };
        await db.guests.put(record);
      }
      if (decision.outcome !== 'duplicate') {
        await log({
          outcome: decision.outcome === 'granted' ? 'admitted' : 'denied',
          reason: decision.reason,
          guestId: guest?.id,
          guestNumber: guest?.number,
          category: guest?.category,
          nameEnc: guest?.nameEnc,
        });
      }
      // Einladung einer anderen Veranstaltung: Name der anderen Veranstaltung für die Anzeige
      const other = guest && guest.occasionId !== occasion.id ? await db.occasions.get(guest.occasionId) : undefined;
      return { occasion, decision, guest: record, other, card: undefined, group: undefined, admittedAt: guest?.admittedAt };
    }

    if (code?.kind === 'card') {
      let card = await db.cards.where('token').equals(code.token).first();
      // Alter QR-Code (Karte wurde neu ausgestellt)?
      const oldCard = card ? undefined : await db.cards.where('oldTokens').equals(code.token).first();
      card ??= oldCard;
      const group = card ? await db.groups.get(card.groupId) : undefined;

      // Gast mit vorhandener Karte: Gästeliste entscheidet, nur einmal
      const guest = card && !oldCard ? await findCardGuest(occasion.id, card) : undefined;
      if (card && guest) {
        const decision = decideCardGuestEntry({ guest, card: { ...card, hasHolder: Boolean(card.holderEnc || card.holder) }, now, cooldownMs: opts.cooldownMs });
        let record = guest;
        if (decision.outcome === 'granted') {
          record = { ...guest, admittedAt: at, admittedSource: opts.source, updatedAt: at };
          await db.guests.put(record);
        }
        if (decision.outcome !== 'duplicate') {
          await log({
            outcome: decision.outcome === 'granted' ? 'admitted' : 'denied',
            reason: decision.reason,
            guestId: guest.id,
            guestNumber: guest.number,
            cardId: card.id,
            cardNumber: card.number,
            category: guest.category,
            nameEnc: decision.reason === 'CARD_PERSON_CHANGED' ? card.nameEnc : guest.nameEnc,
          });
        }
        return { occasion, decision, guest: record, other: undefined, card, group, admittedAt: guest.admittedAt };
      }

      const { decision, admittedAt } = oldCard
        ? { decision: { outcome: 'denied', reason: 'OLD_CARD' } satisfies Decision, admittedAt: undefined }
        : await decideCardAtOccasion(occasion, card, group, now, opts.cooldownMs);
      if (decision.outcome !== 'duplicate') {
        await log({
          outcome: decision.outcome === 'granted' ? 'admitted' : 'denied',
          reason: decision.reason,
          cardId: card?.id,
          cardNumber: card?.number,
          category: group?.name,
          nameEnc: card?.nameEnc,
        });
      }
      return { occasion, decision, guest: undefined, other: undefined, card, group, admittedAt };
    }

    const decision: Decision = { outcome: 'denied', reason: 'INVALID_CODE' };
    await log({ outcome: 'denied', reason: 'INVALID_CODE' });
    return { occasion, decision, guest: undefined, other: undefined, card: undefined, group: undefined, admittedAt: undefined };
  });
  if (!result) return null;

  // Entschlüsseln erst nach der Transaktion
  const key = getDataKey();
  return {
    decision: result.decision,
    at,
    occasion: brief(result.occasion),
    guest: result.guest ? await toGuest(result.guest, key) : undefined,
    otherOccasion: result.other ? brief(result.other) : undefined,
    card: result.card ? await toCard(result.card, key) : undefined,
    group: result.group,
    admittedAt: result.decision.reason === 'ALREADY_ADMITTED' ? result.admittedAt : undefined,
  };
}

/** Gast dieser Veranstaltung, der mit der Karte (oder einer Karte, die sie ersetzt) hineindarf. */
async function findCardGuest(occasionId: string, card: CardRecord): Promise<GuestRecord | undefined> {
  const ids = [card.id];
  let previous = card.replaces;
  for (let i = 0; previous && i < 5; i++) {
    ids.push(previous);
    previous = (await db.cards.get(previous))?.replaces;
  }
  const guests = await db.guests
    .where('occasionId')
    .equals(occasionId)
    .filter((g) => Boolean(g.cardId && ids.includes(g.cardId)))
    .toArray();
  return guests.find((g) => !g.cancelled) ?? guests[0];
}

async function decideCardAtOccasion(
  occasion: Occasion,
  card: CardRecord | undefined,
  group: Group | undefined,
  now: Date,
  cooldownMs: number,
): Promise<{ decision: Decision; admittedAt?: number }> {
  const deny = (reason: Decision['reason']) => ({ decision: { outcome: 'denied', reason } satisfies Decision });
  if (!card) return deny('UNKNOWN_CARD');
  if (card.lostAt) return deny('CARD_LOST');
  if (!occasion.cardsAllowed) return deny('CARDS_NOT_ADMITTED');
  if (card.blocked) return deny('CARD_BLOCKED');
  const blocker = entryBlocker({ ...card, hasHolder: Boolean(card.holderEnc || card.holder) }, group, now);
  if (blocker) return deny(blocker);
  // Dienstausweis gilt je Veranstaltung nur einmal (wie eine Einladung) – bis „Zurücknehmen“
  const entries = await db.occasionLog
    .where('occasionId')
    .equals(occasion.id)
    .filter((e) => e.cardId === card.id)
    .toArray();
  const admittedAt = cardAdmissions(entries).get(card.id)?.timestamp;
  const repeat = repeatEntryDecision(admittedAt, now, cooldownMs);
  return repeat ? { decision: repeat, admittedAt } : { decision: { outcome: 'granted', reason: 'OK', direction: 'in' } };
}

/** Einlass mit Dienstausweis zurücknehmen (Fehlbedienung): der Ausweis gilt wieder, im Protokoll vermerkt. */
export async function undoCardAdmission(occasionId: string, cardId: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.occasionLog, async () => {
    const entries = await db.occasionLog.where('occasionId').equals(occasionId).filter((e) => e.cardId === cardId).toArray();
    const current = cardAdmissions(entries).get(cardId);
    if (!current) return;
    await db.occasionLog.add({
      occasionId,
      timestamp: Math.max(now, current.timestamp),
      source: 'manual',
      outcome: 'undone',
      reason: 'ADMISSION_UNDONE',
      cardId,
      cardNumber: current.cardNumber,
      category: current.category,
      nameEnc: current.nameEnc,
    });
  });
}

/** Gast von Hand einlassen (Einladung vergessen). Bereits eingelassen/storniert → abgelehnt, nichts gebucht. */
export async function admitGuestManually(guestId: string, now = new Date()): Promise<ScanOutcome> {
  const at = now.getTime();
  const result = await db.transaction('rw', [db.occasions, db.guests, db.occasionLog], async () => {
    const guest = await db.guests.get(guestId);
    if (!guest) throw new ValidationError('Gast nicht gefunden.');
    const occasion = await db.occasions.get(guest.occasionId);
    if (!occasion) throw new ValidationError('Veranstaltung nicht gefunden.');
    const decision = decideGuestEntry({ guest, occasionId: occasion.id, now, cooldownMs: 0 });
    if (decision.outcome !== 'granted') return { occasion, guest, decision };
    const record: GuestRecord = { ...guest, admittedAt: at, admittedSource: 'manual', updatedAt: at };
    await db.guests.put(record);
    await db.occasionLog.add({
      occasionId: occasion.id,
      timestamp: at,
      source: 'manual',
      outcome: 'admitted',
      reason: 'OK',
      guestId: guest.id,
      guestNumber: guest.number,
      category: guest.category,
      nameEnc: guest.nameEnc,
    });
    return { occasion, guest: record, decision };
  });
  return { decision: result.decision, at, occasion: brief(result.occasion), guest: await toGuest(result.guest), manual: true };
}

/** Einlass zurücknehmen (Fehlbedienung): Einladung gilt wieder, im Protokoll vermerkt. */
export async function undoAdmission(guestId: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', [db.guests, db.occasionLog], async () => {
    const guest = await db.guests.get(guestId);
    if (!guest || guest.admittedAt === undefined) return;
    const { admittedAt: _a, admittedSource: _s, ...rest } = guest;
    await db.guests.put({ ...rest, updatedAt: now });
    await db.occasionLog.add({
      occasionId: guest.occasionId,
      timestamp: now,
      source: 'manual',
      outcome: 'undone',
      reason: 'ADMISSION_UNDONE',
      guestId: guest.id,
      guestNumber: guest.number,
      category: guest.category,
      nameEnc: guest.nameEnc,
    });
  });
}

/** Einlass-Protokoll einer Veranstaltung, neueste zuerst (Namen entschlüsselt, sofern entsperrt). */
export async function listOccasionLog(occasionId: string): Promise<OccasionLogEntry[]> {
  const records = await db.occasionLog.where('occasionId').equals(occasionId).toArray();
  const key = getDataKey();
  const entries = await Promise.all(
    records.map(async ({ nameEnc, ...rest }): Promise<OccasionLogEntry> => {
      if (!nameEnc) return rest;
      if (!key) return { ...rest, nameLocked: true };
      try {
        return { ...rest, name: await cachedDecrypt(key, nameEnc, () => decryptText(key, nameEnc)) };
      } catch {
        return { ...rest, nameLocked: true };
      }
    }),
  );
  return entries.sort((a, b) => b.timestamp - a.timestamp || (b.seq ?? 0) - (a.seq ?? 0));
}

/** Für die Notfallliste: eingelassene Gäste und mit Dienstausweis eingelassene Personen. */
export async function listAdmittedPeople(occasionId: string): Promise<{ guests: Guest[]; cards: { card: Card; since: number }[] }> {
  const [guestRecords, log] = await Promise.all([
    db.guests.where('occasionId').equals(occasionId).toArray(),
    db.occasionLog.where('occasionId').equals(occasionId).toArray(),
  ]);
  const firstByCard = new Map([...cardAdmissions(log)].map(([cardId, e]) => [cardId, e.timestamp]));
  const cardRecords = (await db.cards.bulkGet([...firstByCard.keys()])).filter((c): c is CardRecord => Boolean(c));
  const key = getDataKey();
  const guests = await Promise.all(guestRecords.filter((g) => g.admittedAt !== undefined && !g.cancelled).map((g) => toGuest(g, key)));
  const cards = await Promise.all(cardRecords.map(async (c) => ({ card: await toCard(c, key), since: firstByCard.get(c.id)! })));
  return { guests, cards };
}

// ---------------------------------------------------------------------------
// Beispiel (nur fiktive Daten)
// ---------------------------------------------------------------------------

const SAMPLE_GUESTS: NewGuest[] = [
  { category: 'VIP', person: { salutation: 'Herr', rank: 'Oberst', firstName: 'Max', lastName: 'Mustermann', company: 'Musterkommando', email: 'max.mustermann@example.com' } },
  { category: 'VIP', person: { salutation: 'Frau', firstName: 'Erika', lastName: 'Musterfrau', company: 'Stadt Musterhausen', email: 'erika.musterfrau@example.com' } },
  { category: 'Presse', person: { salutation: 'Herr', firstName: 'Felix', lastName: 'Gast', company: 'Musterzeitung' } },
  { category: 'Gast', person: { salutation: 'Frau', rank: 'Hptm', firstName: 'Lena', lastName: 'Probe', company: '1. Kompanie' } },
  { category: 'Gast', person: { salutation: 'Herr', firstName: 'Tom', lastName: 'Testmann', company: 'Beispiel GmbH', note: 'Fiktiver Testgast' } },
  { category: 'Gast', person: { salutation: 'Frau', firstName: 'Mia', lastName: 'Beispiel', company: 'Beispiel GmbH' } },
];

/** Beispielveranstaltung mit fiktiven Gästen (heute) – zum Ausprobieren. */
export async function createSampleOccasion(now = new Date()): Promise<Occasion> {
  requireKey();
  const occasion = await createOccasion({
    ...(await newOccasionDefaults(now)),
    name: 'Beispiel: Sommerfest (Testdaten)',
    location: 'Musterkaserne, Halle 1',
    entryFrom: '17:30',
    entryUntil: '19:00',
  });
  await addGuests(occasion.id, SAMPLE_GUESTS);
  return occasion;
}
