/**
 * Veranstaltungen: Einlass mit Einladung (QR-Code nur einmal gültig).
 * Reine Funktionen ohne Datenbank – Entscheidung, Kennzahlen, Filter, Zeitverlauf.
 */
import type { Decision } from './access';
import type { CardLayout } from './cardLayout';
import type { AccessEventRecord, EncryptedData, ReasonCode } from './types';

/** Eine Veranstaltung (enthält keine Personendaten). */
export interface Occasion {
  id: string;
  name: string;
  /** Datum YYYY-MM-DD */
  date: string;
  location?: string;
  /** Einlass von/bis, „HH:MM“ – nur zur Information (z. B. auf der Einladung). */
  entryFrom?: string;
  entryUntil?: string;
  /** Farbe der Veranstaltung (Band, Statusleiste, Gästebildschirm). */
  color: string;
  /** Dienstausweise (Karten) gelten zusätzlich zu den Einladungen. */
  cardsAllowed: boolean;
  /** Gästebildschirm: Scan-Anzeige bzw. Ruhebildschirm (leer = wie sonst). */
  resultLayoutId?: string;
  idleLayoutId?: string;
  /** Gestaltung der Einladung (Serienbrief); fehlt = Standard-Einladung. Enthält keine Personendaten. */
  invitation?: CardLayout;
  createdAt: number;
  updatedAt: number;
}

/** Personendaten eines Gastes (verschlüsselt gespeichert). */
export interface GuestPerson {
  /** Anrede, z. B. „Herr“, „Frau“ */
  salutation?: string;
  rank?: string;
  firstName: string;
  lastName: string;
  /** Einheit/Firma */
  company?: string;
  email?: string;
  note?: string;
  /** Namen der Begleitpersonen (optional, z. B. für die Notfallliste). */
  companionNames?: string[];
}

/** Gast, wie er in der Datenbank liegt. */
export interface GuestRecord {
  id: string;
  occasionId: string;
  /** Laufende Nummer je Veranstaltung (auf der Einladung, zum Suchen). */
  number: number;
  /** Zufälliges Token im QR-Code („ZE1:…“). */
  token: string;
  /** Kategorie, z. B. „VIP“, „Presse“ – unverschlüsselt (für Kennzahlen ohne Entsperren). */
  category?: string;
  /** Personendaten (fehlen nach „Gästedaten löschen“). */
  personEnc?: EncryptedData;
  /** Name für Einlass-Protokoll (funktioniert auch gesperrt). */
  nameEnc?: EncryptedData;
  cancelled?: boolean;
  /** Eingelassen um (einmalig). */
  admittedAt?: number;
  admittedSource?: AccessEventRecord['source'];
  /** Zutritt mit vorhandener Karte statt Einladung (Karte der Zutrittskontrolle). */
  cardId?: string;
  /** Kartennummer (Anzeige, auch gesperrt). */
  cardNumber?: string;
  /** holderSince der Karte beim Verknüpfen – ändert sich die Person der Karte, gilt sie nicht mehr. */
  cardHolderSince?: number;
  /** Angemeldete Begleitpersonen (0–9, unverschlüsselt – nur eine Zahl). */
  companions?: number;
  /** Tatsächlich eingelassene Begleitpersonen (beim Einlass = angemeldet, danach korrigierbar). */
  companionsAdmitted?: number;
  createdAt: number;
  updatedAt: number;
}

/** Gast für die Oberfläche (entschlüsselt, sofern entsperrt). */
export interface Guest extends Omit<GuestRecord, 'personEnc' | 'nameEnc'> {
  person?: GuestPerson;
  /** Personendaten vorhanden (auch wenn gesperrt). */
  hasPerson: boolean;
}

/** Einlass-Protokoll einer Veranstaltung (getrennt vom normalen Protokoll). */
export interface OccasionLogRecord {
  seq?: number;
  occasionId: string;
  timestamp: number;
  outcome: 'admitted' | 'denied' | 'undone';
  reason: ReasonCode;
  guestId?: string;
  guestNumber?: number;
  /** Dienstausweis statt Einladung */
  cardId?: string;
  cardNumber?: string;
  category?: string;
  nameEnc?: EncryptedData;
  source: AccessEventRecord['source'];
}

export interface OccasionLogEntry extends Omit<OccasionLogRecord, 'nameEnc'> {
  name?: string;
  nameLocked?: boolean;
}

export const OCCASION_COLORS = ['#7c3aed', '#db2777', '#0891b2', '#16a34a', '#ea580c', '#2563eb'];

// ---------------------------------------------------------------------------
// Entscheidung
// ---------------------------------------------------------------------------

/**
 * Schon eingelassen? Kurz danach (Code wird noch hingehalten) = Doppelscan, nicht als Abweisung gezählt;
 * später = „Bereits eingelassen“. undefined = darf hinein.
 */
export function repeatEntryDecision(admittedAt: number | undefined, now: Date, cooldownMs: number): Decision | undefined {
  if (admittedAt === undefined) return undefined;
  const since = now.getTime() - admittedAt;
  if (since >= 0 && since < cooldownMs) {
    return { outcome: 'duplicate', reason: 'DUPLICATE', direction: 'in', secondsSinceLast: Math.round(since / 1000) };
  }
  return { outcome: 'denied', reason: 'ALREADY_ADMITTED', direction: 'in' };
}

/**
 * Einlass mit Einladung: nur einmal. Ein erneuter Scan kurz danach (Gast hält den Code
 * noch hin) gilt als Doppelscan und wird nicht als Abweisung gezählt.
 */
export function decideGuestEntry(input: {
  guest: Pick<GuestRecord, 'occasionId' | 'cancelled' | 'admittedAt'> | undefined;
  occasionId: string;
  now: Date;
  cooldownMs: number;
}): Decision {
  const { guest, occasionId, now, cooldownMs } = input;
  if (!guest) return { outcome: 'denied', reason: 'UNKNOWN_GUEST' };
  if (guest.occasionId !== occasionId) return { outcome: 'denied', reason: 'OTHER_OCCASION' };
  if (guest.cancelled) return { outcome: 'denied', reason: 'GUEST_CANCELLED' };
  return repeatEntryDecision(guest.admittedAt, now, cooldownMs) ?? { outcome: 'granted', reason: 'OK', direction: 'in' };
}

/**
 * Gast mit vorhandener Karte: Die Gästeliste entscheidet (Gruppenregeln/Gültigkeit der Karte spielen keine
 * Rolle), aber verlorene/gesperrte Karten und ein Personenwechsel auf der Karte werden abgewiesen.
 */
export function decideCardGuestEntry(input: {
  guest: Pick<GuestRecord, 'occasionId' | 'cancelled' | 'admittedAt' | 'cardHolderSince'>;
  card: { lostAt?: number; blocked: boolean; holderSince?: number; hasHolder: boolean };
  now: Date;
  cooldownMs: number;
}): Decision {
  const { guest, card, now, cooldownMs } = input;
  if (card.lostAt) return { outcome: 'denied', reason: 'CARD_LOST' };
  if (card.blocked) return { outcome: 'denied', reason: 'CARD_BLOCKED' };
  if (!card.hasHolder || card.holderSince !== guest.cardHolderSince) return { outcome: 'denied', reason: 'CARD_PERSON_CHANGED' };
  return decideGuestEntry({ guest, occasionId: guest.occasionId, now, cooldownMs });
}

/**
 * Mit Dienstausweis eingelassen (ohne Gästeliste): je Karte der aktuelle Einlass – erster Einlass seit dem
 * letzten „Zurücknehmen“. Einträge von Gästen mit Karte (guestId) zählen hier nicht.
 */
export function cardAdmissions<E extends Pick<OccasionLogRecord, 'outcome' | 'cardId' | 'guestId' | 'timestamp' | 'seq'>>(log: E[]): Map<string, E> {
  const sorted = [...log].sort((a, b) => a.timestamp - b.timestamp || (a.seq ?? 0) - (b.seq ?? 0));
  const admitted = new Map<string, E>();
  for (const e of sorted) {
    if (!e.cardId || e.guestId) continue;
    if (e.outcome === 'admitted') {
      if (!admitted.has(e.cardId)) admitted.set(e.cardId, e);
    } else if (e.outcome === 'undone') admitted.delete(e.cardId);
  }
  return admitted;
}

// ---------------------------------------------------------------------------
// Kennzahlen
// ---------------------------------------------------------------------------

/**
 * Kennzahlen in **Personen** (Gast + Begleitpersonen). Erwartet je Gast: 1 + angemeldete Begleitpersonen
 * (kamen mehr als angemeldet, zählt die tatsächliche Zahl).
 */
export interface OccasionStats {
  /** Erwartete Personen (ohne stornierte Einladungen) */
  invited: number;
  /** Eingelassene Personen */
  admitted: number;
  /** Noch erwartete Personen */
  open: number;
  /** Stornierte Einladungen (Gäste) */
  cancelled: number;
  /** Quote in Prozent (gerundet) */
  rate: number;
  /** davon: eingelassene Gäste bzw. Begleitpersonen */
  admittedGuests: number;
  admittedCompanions: number;
  perCategory: { category: string; invited: number; admitted: number }[];
}

export const NO_CATEGORY = 'Ohne Kategorie';

type StatsGuest = Pick<GuestRecord, 'cancelled' | 'admittedAt' | 'category' | 'companions' | 'companionsAdmitted'>;

/** Personen dieses Gastes: erwartet (1 + angemeldete bzw. tatsächliche Begleitung) und eingelassen. */
export function guestPersons(g: StatsGuest): { expected: number; admitted: number; companionsIn: number } {
  const announced = g.companions ?? 0;
  if (g.admittedAt === undefined) return { expected: 1 + announced, admitted: 0, companionsIn: 0 };
  const companionsIn = g.companionsAdmitted ?? 0;
  return { expected: 1 + Math.max(announced, companionsIn), admitted: 1 + companionsIn, companionsIn };
}

export function occasionStats(guests: StatsGuest[]): OccasionStats {
  let invited = 0;
  let admitted = 0;
  let cancelled = 0;
  let admittedGuests = 0;
  let admittedCompanions = 0;
  const cats = new Map<string, { invited: number; admitted: number }>();
  for (const g of guests) {
    if (g.cancelled) {
      cancelled++;
      continue;
    }
    const p = guestPersons(g);
    invited += p.expected;
    admitted += p.admitted;
    if (g.admittedAt !== undefined) admittedGuests++;
    admittedCompanions += p.companionsIn;
    const key = g.category?.trim() || NO_CATEGORY;
    const c = cats.get(key) ?? { invited: 0, admitted: 0 };
    c.invited += p.expected;
    c.admitted += p.admitted;
    cats.set(key, c);
  }
  const perCategory = [...cats.entries()]
    .map(([category, c]) => ({ category, ...c }))
    .sort((a, b) => b.invited - a.invited || a.category.localeCompare(b.category, 'de'));
  return {
    invited,
    admitted,
    open: invited - admitted,
    cancelled,
    rate: invited ? Math.round((admitted / invited) * 100) : 0,
    admittedGuests,
    admittedCompanions,
    perCategory,
  };
}

// ---------------------------------------------------------------------------
// Begleitpersonen
// ---------------------------------------------------------------------------

/** Höchstens so viele Begleitpersonen anmelden … */
export const MAX_COMPANIONS = 9;
/** … beim Einlass dürfen es (mit Hinweis) mehr werden. */
export const MAX_COMPANIONS_ADMITTED = 20;

export function clampCompanions(n: unknown, max = MAX_COMPANIONS): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0;
}

/** „eine Begleitperson“ / „2 Begleitpersonen“ / '' */
export function companionsText(n: number | undefined): string {
  if (!n || n <= 0) return '';
  return n === 1 ? 'eine Begleitperson' : `${n} Begleitpersonen`;
}

/** Namen bereinigen: getrimmt, ohne leere, höchstens MAX_COMPANIONS_ADMITTED. */
export function normalizeCompanionNames(names: string[] | undefined): string[] | undefined {
  const list = (names ?? []).map((n) => n.trim().slice(0, 80)).filter(Boolean).slice(0, MAX_COMPANIONS_ADMITTED);
  return list.length ? list : undefined;
}

/** Einlass-Zeitpunkte gewichtet nach Personen (für den Zeitverlauf). */
export function admissionTimes(guests: StatsGuest[]): number[] {
  return guests.flatMap((g) => (g.admittedAt !== undefined && !g.cancelled ? Array<number>(1 + (g.companionsAdmitted ?? 0)).fill(g.admittedAt) : []));
}

/** Einlass im Zeitverlauf: Anzahl je Zeitfenster (Standard 15 Minuten), lückenlos vom ersten bis zum letzten. */
export function admissionTimeline(times: number[], bucketMinutes = 15): { from: number; count: number }[] {
  if (times.length === 0) return [];
  const size = bucketMinutes * 60_000;
  const start = (t: number) => {
    const d = new Date(t);
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(d.getMinutes() / bucketMinutes) * bucketMinutes);
    return d.getTime();
  };
  const counts = new Map<number, number>();
  for (const t of times) counts.set(start(t), (counts.get(start(t)) ?? 0) + 1);
  const keys = [...counts.keys()].sort((a, b) => a - b);
  const out: { from: number; count: number }[] = [];
  for (let t = keys[0]!; t <= keys[keys.length - 1]!; t += size) out.push({ from: t, count: counts.get(t) ?? 0 });
  return out;
}

// ---------------------------------------------------------------------------
// Anzeige, Suche, Filter
// ---------------------------------------------------------------------------

const join = (sep: string, parts: (string | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(sep);

/** „Hptm Mustermann, Max“ (wie bei Karten), ohne Personendaten „Gast Nr. 12“. */
export function guestListName(guest: Pick<Guest, 'person' | 'number'>): string {
  const p = guest.person;
  if (!p) return `Gast Nr. ${guest.number}`;
  return join(' ', [p.rank, join(', ', [p.lastName, p.firstName])]) || `Gast Nr. ${guest.number}`;
}

/** „Hptm Max Mustermann“ – für Scan-Ergebnis und Protokoll. */
export function guestName(p: GuestPerson | undefined): string | undefined {
  return p ? join(' ', [p.rank, p.firstName, p.lastName]) : undefined;
}

export function guestSearchText(guest: Pick<Guest, 'person' | 'number' | 'category'>): string {
  const p = guest.person;
  return [String(guest.number), guest.category, p?.salutation, p?.rank, p?.firstName, p?.lastName, p?.company, p?.email, p?.note]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export type GuestStatusFilter = 'all' | 'open' | 'admitted' | 'cancelled';

export function guestStatus(guest: Pick<GuestRecord, 'cancelled' | 'admittedAt'>): Exclude<GuestStatusFilter, 'all'> {
  if (guest.cancelled) return 'cancelled';
  return guest.admittedAt !== undefined ? 'admitted' : 'open';
}

export const GUEST_STATUS_LABEL: Record<Exclude<GuestStatusFilter, 'all'>, string> = {
  open: 'offen',
  admitted: 'eingelassen',
  cancelled: 'storniert',
};

export function filterGuests<G extends Pick<Guest, 'person' | 'number' | 'category' | 'cancelled' | 'admittedAt'>>(
  guests: G[],
  f: { query: string; status: GuestStatusFilter; category: string },
): G[] {
  const q = f.query.trim().toLowerCase();
  return guests.filter((g) => {
    if (f.status !== 'all' && guestStatus(g) !== f.status) return false;
    if (f.category && (g.category?.trim() || NO_CATEGORY) !== f.category) return false;
    return !q || guestSearchText(g).includes(q);
  });
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** Nach Nachname, Vorname (ohne Personendaten nach Nummer, ans Ende). */
export function sortGuestsByName<G extends Pick<Guest, 'person' | 'number'>>(guests: G[]): G[] {
  const key = (g: G) => (g.person ? `${g.person.lastName} ${g.person.firstName}` : '');
  return [...guests].sort((a, b) => {
    if (!a.person !== !b.person) return a.person ? -1 : 1;
    return collator.compare(key(a), key(b)) || a.number - b.number;
  });
}

/** Vorkommende Kategorien (für Auswahl und Vorschläge). */
export function guestCategories(guests: Pick<GuestRecord, 'category'>[]): string[] {
  return [...new Set(guests.map((g) => g.category?.trim()).filter((c): c is string => Boolean(c)))].sort((a, b) => collator.compare(a, b));
}

// ---------------------------------------------------------------------------
// Gast hinzufügen: bereits erfasste Personen (Karteninhaber) erkennen
// ---------------------------------------------------------------------------

const foldName = (s: string | undefined) =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

export interface HolderCandidate {
  card: { id: string; number: string; blocked: boolean; lostAt?: number; holder?: { firstName: string; lastName: string } };
}

/**
 * Karteninhaber, die zum eingegebenen Namen passen: Nachname (ab 2 Zeichen) und – falls eingegeben – Vorname
 * beginnen gleich; nur Vorname ab 3 Zeichen. Exakte Treffer zuerst, höchstens `limit`.
 */
export function findHolderMatches<C extends HolderCandidate>(
  candidates: C[],
  person: Pick<GuestPerson, 'firstName' | 'lastName'>,
  limit = 5,
): C[] {
  const first = foldName(person.firstName);
  const last = foldName(person.lastName);
  if (last.length < 2 && first.length < 3) return [];
  const scored = candidates
    .filter(({ card }) => card.holder)
    .map((c) => {
      const h = c.card.holder!;
      const hf = foldName(h.firstName);
      const hl = foldName(h.lastName);
      const ok = (last ? hl.startsWith(last) : true) && (first ? hf.startsWith(first) : true);
      const exact = (last ? hl === last : true) && (first ? hf === first : true);
      return { c, ok, exact };
    })
    .filter((x) => x.ok);
  return scored
    .sort((a, b) => Number(b.exact) - Number(a.exact) || collator.compare(a.c.card.holder!.lastName, b.c.card.holder!.lastName))
    .slice(0, limit)
    .map((x) => x.c);
}
