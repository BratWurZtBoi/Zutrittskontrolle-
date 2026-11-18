/**
 * Einladungen zu Veranstaltungen (Serienbrief): Layout wie bei Karten (positionierte Elemente,
 * Platzhalter), aber eigene Formate (A4, A5, A6, DIN lang), Platzhalter und Bausteine.
 * Reine Funktionen ohne DOM/DB.
 */
import {
  INVITATION_FORMATS,
  fitSide,
  newCardElement,
  type CardData,
  type CardElement,
  type CardLayout,
  type CardOrientation,
  type CardSize,
} from './cardLayout';
import { toCsv } from './csv';
import type { Guest, GuestPerson, Occasion } from './occasion';

export { INVITATION_FORMATS };

export const INVITATION_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: '{briefanrede}', label: 'Briefanrede' },
  { key: '{anrede}', label: 'Anrede' },
  { key: '{dienstgrad}', label: 'Dienstgrad' },
  { key: '{vorname}', label: 'Vorname' },
  { key: '{nachname}', label: 'Nachname' },
  { key: '{name}', label: 'Name' },
  { key: '{einheit}', label: 'Einheit/Firma' },
  { key: '{kategorie}', label: 'Kategorie' },
  { key: '{nr}', label: 'Nr. der Einladung' },
  { key: '{veranstaltung}', label: 'Veranstaltung' },
  { key: '{datum}', label: 'Datum' },
  { key: '{ort}', label: 'Ort' },
  { key: '{einlass}', label: 'Einlass' },
  { key: '{organisation}', label: 'Organisation' },
];

const join = (sep: string, parts: (string | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(sep);

/** „Sehr geehrter Herr Oberst Mustermann“ / „Sehr geehrte Frau Musterfrau“ / „Guten Tag Max Mustermann“. */
export function letterSalutation(p: GuestPerson | undefined): string {
  if (!p) return 'Sehr geehrte Damen und Herren';
  const s = p.salutation?.trim().toLowerCase();
  if (s === 'herr') return join(' ', ['Sehr geehrter Herr', p.rank, p.lastName]);
  if (s === 'frau') return join(' ', ['Sehr geehrte Frau', p.rank, p.lastName]);
  return join(' ', ['Guten Tag', p.salutation, p.rank, p.firstName, p.lastName]);
}

/** „Samstag, 12. Dezember 2026“ */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** „17:30 bis 19:00 Uhr“ bzw. „ab 17:30 Uhr“ */
export function entryText(o: Pick<Occasion, 'entryFrom' | 'entryUntil'>): string {
  if (o.entryFrom && o.entryUntil) return `${o.entryFrom} bis ${o.entryUntil} Uhr`;
  if (o.entryFrom) return `ab ${o.entryFrom} Uhr`;
  if (o.entryUntil) return `bis ${o.entryUntil} Uhr`;
  return '';
}

/** Platzhalter-Werte einer Einladung. */
export function invitationValues(
  occasion: Pick<Occasion, 'name' | 'date' | 'location' | 'entryFrom' | 'entryUntil'>,
  guest: Pick<Guest, 'person' | 'number' | 'category'>,
  orgName: string,
): Record<string, string> {
  const p = guest.person;
  return {
    briefanrede: letterSalutation(p),
    anrede: p?.salutation ?? '',
    dienstgrad: p?.rank ?? '',
    vorname: p?.firstName ?? '',
    nachname: p?.lastName ?? '',
    name: join(' ', [p?.rank, p?.firstName, p?.lastName]),
    einheit: p?.company ?? '',
    kategorie: guest.category ?? '',
    nr: String(guest.number),
    veranstaltung: occasion.name,
    datum: longDate(occasion.date),
    ort: occasion.location ?? '',
    einlass: entryText(occasion),
    organisation: orgName,
  };
}

/** Farben der Einladung: „Gruppenfarbe“ = Farbe der Veranstaltung. */
export function invitationCardData(occasion: Pick<Occasion, 'name' | 'color'>, guest: Pick<Guest, 'number' | 'category'>, orgName: string): CardData {
  return { number: `Nr. ${guest.number}`, groupName: guest.category || occasion.name, groupColor: occasion.color, orgName };
}

/** Fiktiver Gast für die Vorschau im Editor. */
export const SAMPLE_GUEST: Pick<Guest, 'person' | 'number' | 'category'> = {
  number: 12,
  category: 'Gast',
  person: { salutation: 'Frau', firstName: 'Erika', lastName: 'Musterfrau', company: 'Beispiel GmbH' },
};

type Spec = Omit<CardElement, 'align' | 'bold'> & Partial<Pick<CardElement, 'align' | 'bold'>>;
const el = (spec: Spec): CardElement => ({ align: 'left', bold: false, ...spec });

const LETTER_TEXT =
  'wir laden Sie herzlich zu unserer Veranstaltung ein und freuen uns auf Ihren Besuch.\n\nBitte bringen Sie diese Einladung mit – der QR-Code wird beim Einlass gescannt und gilt nur einmal.';

/** Vorlagen: Brief (hochkant, A4/A5/A6) und Karte (quer, A5/A6/DIN lang). */
export const INVITATION_TEMPLATES: { id: string; label: string; orientation: CardOrientation; elements: () => CardElement[] }[] = [
  {
    id: 'brief',
    label: 'Brief (Hochformat)',
    orientation: 'portrait',
    elements: () => [
      el({ id: 'head', type: 'band', x: 0, y: 0, w: 100, h: 9, size: 0, color: 'group' }),
      el({ id: 'org', type: 'text', text: '{organisation}', x: 8, y: 3, w: 84, size: 2.2, bold: true, color: 'on-group' }),
      el({ id: 'title', type: 'text', text: 'Einladung', x: 8, y: 13, w: 84, size: 5, bold: true, color: 'group' }),
      el({ id: 'event', type: 'text', text: '{veranstaltung}', x: 8, y: 20, w: 84, size: 3.4, bold: true }),
      el({ id: 'salutation', type: 'text', text: '{briefanrede},', x: 8, y: 29, w: 84, size: 1.9 }),
      el({ id: 'body', type: 'text', text: LETTER_TEXT, x: 8, y: 33, w: 84, size: 1.9 }),
      el({ id: 'details', type: 'text', text: 'Datum: {datum}\nOrt: {ort}\nEinlass: {einlass}', x: 8, y: 52, w: 50, size: 1.9, bold: true }),
      el({ id: 'qr', type: 'qr', x: 64, y: 50, w: 28, size: 0 }),
      el({ id: 'qr-note', type: 'text', text: 'Einladung Nr. {nr}\nnur einmal gültig', x: 60, y: 71, w: 36, size: 1.5, align: 'center' }),
      el({ id: 'name', type: 'text', text: '{name}\n{einheit}', x: 8, y: 80, w: 84, size: 1.9 }),
      el({ id: 'foot', type: 'band', x: 0, y: 97, w: 100, h: 3, size: 0, color: 'group' }),
    ],
  },
  {
    id: 'karte',
    label: 'Karte (Querformat)',
    orientation: 'landscape',
    elements: () => [
      el({ id: 'side', type: 'band', x: 0, y: 0, w: 3, h: 100, size: 0, color: 'group' }),
      el({ id: 'title', type: 'text', text: 'Einladung', x: 7, y: 7, w: 60, size: 9, bold: true, color: 'group' }),
      el({ id: 'event', type: 'text', text: '{veranstaltung}', x: 7, y: 21, w: 60, size: 6, bold: true }),
      el({ id: 'salutation', type: 'text', text: '{briefanrede},\nwir freuen uns auf Ihren Besuch.', x: 7, y: 36, w: 60, size: 3.6 }),
      el({ id: 'details', type: 'text', text: '{datum}\n{ort}\nEinlass {einlass}', x: 7, y: 58, w: 60, size: 3.6, bold: true }),
      el({ id: 'qr', type: 'qr', x: 72, y: 18, w: 23, size: 0 }),
      el({ id: 'qr-note', type: 'text', text: 'Nr. {nr} · nur einmal gültig', x: 68, y: 62, w: 31, size: 2.8, align: 'center' }),
      el({ id: 'org', type: 'text', text: '{organisation}', x: 7, y: 88, w: 88, size: 2.8 }),
    ],
  },
];

/** Bausteine für „Hinzufügen“ im Einladungs-Editor. */
export const INVITATION_PRESETS: { id: string; label: string; hint: string; make: (id: string, size: CardSize) => CardElement }[] = [
  { id: 'salutation', label: 'Briefanrede', hint: '„Sehr geehrte Frau …“', make: (id) => el({ id, type: 'text', text: '{briefanrede},', x: 8, y: 30, w: 84, size: 2 }) },
  { id: 'body', label: 'Einladungstext', hint: 'mehrere Zeilen', make: (id) => el({ id, type: 'text', text: LETTER_TEXT, x: 8, y: 35, w: 84, size: 2 }) },
  { id: 'event', label: 'Veranstaltung', hint: 'Name der Veranstaltung', make: (id) => el({ id, type: 'text', text: '{veranstaltung}', x: 8, y: 20, w: 84, size: 3.5, bold: true }) },
  { id: 'details', label: 'Datum, Ort, Einlass', hint: 'aus der Veranstaltung', make: (id) => el({ id, type: 'text', text: 'Datum: {datum}\nOrt: {ort}\nEinlass: {einlass}', x: 8, y: 55, w: 60, size: 2, bold: true }) },
  { id: 'name', label: 'Name des Gastes', hint: 'Dienstgrad, Name, Einheit', make: (id) => el({ id, type: 'text', text: '{name}\n{einheit}', x: 8, y: 80, w: 84, size: 2 }) },
  { id: 'number', label: 'Nr. der Einladung', hint: 'z. B. Nr. 12', make: (id) => el({ id, type: 'text', text: 'Einladung Nr. {nr}', x: 60, y: 72, w: 36, size: 1.6, align: 'center' }) },
  { id: 'text', label: 'Freier Text', hint: 'z. B. Programm, Anfahrt', make: (id) => el({ id, type: 'text', text: 'Text', x: 8, y: 65, w: 84, size: 2 }) },
  { id: 'qr', label: 'QR-Code', hint: 'Einlass – nur einmal gültig', make: (id, size) => newCardElement('qr', id, size) },
  { id: 'logo', label: 'Logo', hint: 'Bild unter „Design“', make: (id, size) => newCardElement('logo', id, size) },
  { id: 'band', label: 'Farbfläche', hint: 'Streifen, Rahmen', make: (id, size) => newCardElement('band', id, size) },
];

/** Einladung, wenn noch keine gestaltet ist: A5 hoch mit der Brief-Vorlage. */
export function defaultInvitation(occasionId: string, now = 0): CardLayout {
  const base: CardLayout = {
    id: `einladung-${occasionId}`,
    name: 'Einladung',
    orientation: 'portrait',
    format: 'a5',
    background: { color: '#ffffff' },
    textColor: '#0f172a',
    elements: INVITATION_TEMPLATES[0]!.elements(),
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, elements: fitSide({ background: base.background, elements: base.elements }, { w: 148, h: 210 }).elements };
}

/** Dateiname je Gast, nur ASCII: „Einladung_012_Mustermann_Max.pdf“. */
export function invitationFilename(guest: Pick<Guest, 'number' | 'person'>, ext = 'pdf'): string {
  const fold = (s: string) =>
    s
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/[^\w-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  const name = fold(join('_', [guest.person?.lastName, guest.person?.firstName]));
  return `Einladung_${String(guest.number).padStart(3, '0')}${name ? `_${name}` : ''}.${ext}`;
}

/** Versandliste (z. B. für Outlook-Serien-E-Mail): Adresse, Briefanrede und Dateiname je Gast. */
export function mailingListCsv(guests: Guest[]): string {
  return toCsv([
    ['Nr.', 'Anrede', 'Dienstgrad', 'Vorname', 'Nachname', 'E-Mail', 'Briefanrede', 'Einheit/Firma', 'Kategorie', 'Datei'],
    ...guests.map((g) => [
      g.number,
      g.person?.salutation ?? '',
      g.person?.rank ?? '',
      g.person?.firstName ?? '',
      g.person?.lastName ?? '',
      g.person?.email ?? '',
      letterSalutation(g.person),
      g.person?.company ?? '',
      g.category ?? '',
      invitationFilename(g),
    ]),
  ]);
}

/** Für wen Einladungen erstellt werden. Stornierte Einladungen nie. */
export type InvitationSelection = 'all' | 'post' | 'mail' | 'open';

export const INVITATION_SELECTIONS: { value: InvitationSelection; label: string }[] = [
  { value: 'all', label: 'Alle Gäste' },
  { value: 'post', label: 'Ohne E-Mail (per Post/von Hand)' },
  { value: 'mail', label: 'Mit E-Mail' },
  { value: 'open', label: 'Noch nicht eingelassen' },
];

export function selectInvitationGuests<G extends Pick<Guest, 'cancelled' | 'admittedAt' | 'person' | 'category' | 'number'>>(
  guests: G[],
  selection: InvitationSelection,
  category = '',
): G[] {
  return guests
    .filter((g) => {
      if (g.cancelled) return false;
      if (category && (g.category?.trim() || '') !== category) return false;
      if (selection === 'post') return !g.person?.email;
      if (selection === 'mail') return Boolean(g.person?.email);
      if (selection === 'open') return g.admittedAt === undefined;
      return true;
    })
    .sort((a, b) => a.number - b.number);
}
