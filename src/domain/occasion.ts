/**
 * Veranstaltungen: Einlass mit Einladung (QR-Code nur einmal gültig).
 * Reine Funktionen ohne Datenbank – Entscheidung, Kennzahlen, Filter, Zeitverlauf.
 */
import type { Decision } from './access';
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
  if (guest.admittedAt !== undefined) {
    const since = now.getTime() - guest.admittedAt;
    if (since >= 0 && since < cooldownMs) {
      return { outcome: 'duplicate', reason: 'DUPLICATE', direction: 'in', secondsSinceLast: Math.round(since / 1000) };
    }
    return { outcome: 'denied', reason: 'ALREADY_ADMITTED', direction: 'in' };
  }
  return { outcome: 'granted', reason: 'OK', direction: 'in' };
}

// ---------------------------------------------------------------------------
// Kennzahlen
// ---------------------------------------------------------------------------

export interface OccasionStats {
  /** Eingeladen (ohne stornierte) */
  invited: number;
  admitted: number;
  open: number;
  cancelled: number;
  /** Quote in Prozent (gerundet) */
  rate: number;
  perCategory: { category: string; invited: number; admitted: number }[];
}

export const NO_CATEGORY = 'Ohne Kategorie';

export function occasionStats(guests: Pick<GuestRecord, 'cancelled' | 'admittedAt' | 'category'>[]): OccasionStats {
  let invited = 0;
  let admitted = 0;
  let cancelled = 0;
  const cats = new Map<string, { invited: number; admitted: number }>();
  for (const g of guests) {
    if (g.cancelled) {
      cancelled++;
      continue;
    }
    invited++;
    const isIn = g.admittedAt !== undefined;
    if (isIn) admitted++;
    const key = g.category?.trim() || NO_CATEGORY;
    const c = cats.get(key) ?? { invited: 0, admitted: 0 };
    c.invited++;
    if (isIn) c.admitted++;
    cats.set(key, c);
  }
  const perCategory = [...cats.entries()]
    .map(([category, c]) => ({ category, ...c }))
    .sort((a, b) => b.invited - a.invited || a.category.localeCompare(b.category, 'de'));
  return { invited, admitted, open: invited - admitted, cancelled, rate: invited ? Math.round((admitted / invited) * 100) : 0, perCategory };
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
