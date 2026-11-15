/**
 * Präsentationslayouts für den Gästebildschirm: Aufbau, Texte und Hintergrund.
 * Reine Funktionen ohne DOM/DB – gut testbar.
 *
 * Datenschutz: Platzhalter mit Personendaten werden im Scanner-Fenster gefüllt
 * (dort sind die Daten entschlüsselt). Das Präsentationsfenster bekommt nur die
 * fertigen Texte und nur die Angaben, die das Layout anzeigt.
 */

/** Aufbau des Ergebnisbildschirms. */
export type LayoutArrangement = 'center' | 'side' | 'minimal';
export type BackgroundKind = 'color' | 'gradient' | 'image';
/** 'outcome' = Ergebnisfarbe (grün/blau/rot) als Hintergrund, 'custom' = eigener Hintergrund mit farbigem Streifen. */
export type ResultBackground = 'outcome' | 'custom';
export type NameFormat = 'full' | 'first' | 'none';
export type LayoutTone = 'ok' | 'out' | 'deny' | 'warn';

export interface LayoutTexts {
  idleTitle: string;
  idleHint: string;
  inTitle: string;
  inText: string;
  outTitle: string;
  outText: string;
  denyTitle: string;
  denyText: string;
  waitTitle: string;
  waitText: string;
}

export interface PresentationLayout {
  id: string;
  name: string;
  /** Mitgeliefertes Standardlayout – nicht änderbar, nur kopierbar. */
  builtIn?: boolean;
  arrangement: LayoutArrangement;
  background: {
    kind: BackgroundKind;
    color: string;
    /** Zweite Farbe für den Verlauf. */
    color2: string;
    /** Bild als Data-URL (lokal gespeichert). */
    image?: string;
    /** Abdunkeln des Bildes, 0–0,7 (bessere Lesbarkeit). */
    dim: number;
  };
  textColor: 'light' | 'dark';
  resultBackground: ResultBackground;
  /** Logo als Data-URL (optional). */
  logo?: string;
  show: {
    photo: boolean;
    group: boolean;
    company: boolean;
    /** Ruhebildschirm: Uhrzeit und Datum. */
    clock: boolean;
    /** Ruhebildschirm: Name der Organisation. */
    org: boolean;
  };
  nameFormat: NameFormat;
  texts: LayoutTexts;
  createdAt: number;
  updatedAt: number;
}

export const STANDARD_LAYOUT_ID = 'standard';

export const DEFAULT_TEXTS: LayoutTexts = {
  idleTitle: 'Herzlich willkommen',
  idleHint: 'Bitte Karte mit QR-Code vor die Kamera halten',
  inTitle: 'Willkommen',
  inText: 'Eingang gebucht · {uhrzeit} Uhr',
  outTitle: 'Auf Wiedersehen',
  outText: 'Ausgang gebucht · {uhrzeit} Uhr',
  denyTitle: 'Kein Zutritt',
  denyText: '{grund} Bitte wenden Sie sich an den Empfang.',
  waitTitle: 'Bitte kurz warten',
  waitText: 'Ihr Eintritt wird gleich bestätigt.',
};

/** Der bisherige Präsentationsbildschirm – immer vorhanden, Grundlage für eigene Layouts. */
export const STANDARD_LAYOUT: PresentationLayout = {
  id: STANDARD_LAYOUT_ID,
  name: 'Standard',
  builtIn: true,
  arrangement: 'center',
  background: { kind: 'gradient', color: '#0f172a', color2: '#1e3a8a', dim: 0 },
  textColor: 'light',
  resultBackground: 'outcome',
  show: { photo: true, group: true, company: false, clock: true, org: true },
  nameFormat: 'full',
  texts: DEFAULT_TEXTS,
  createdAt: 0,
  updatedAt: 0,
};

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: '{vorname}', label: 'Vorname' },
  { key: '{nachname}', label: 'Nachname' },
  { key: '{name}', label: 'Vor- und Nachname' },
  { key: '{firma}', label: 'Firma / Abteilung' },
  { key: '{gruppe}', label: 'Gruppe' },
  { key: '{uhrzeit}', label: 'Uhrzeit' },
  { key: '{datum}', label: 'Datum' },
  { key: '{organisation}', label: 'Organisation' },
  { key: '{grund}', label: 'Grund (nur bei „Kein Zutritt“)' },
];

/** Welches Layout gilt? Karte vor Gruppe vor Standard; gelöschte Layouts fallen zurück. */
export function pickLayout(
  layouts: PresentationLayout[],
  ids: { card?: string; group?: string; fallback?: string },
): PresentationLayout {
  const byId = new Map(layouts.map((l) => [l.id, l]));
  for (const id of [ids.card, ids.group, ids.fallback]) {
    const found = id ? byId.get(id) : undefined;
    if (found) return found;
  }
  return byId.get(STANDARD_LAYOUT_ID) ?? STANDARD_LAYOUT;
}

export type PlaceholderValues = Partial<Record<'vorname' | 'nachname' | 'name' | 'firma' | 'gruppe' | 'uhrzeit' | 'datum' | 'organisation' | 'grund', string>>;

/**
 * Ersetzt Platzhalter wie {vorname}. Leere Werte hinterlassen keine Lücken
 * („Willkommen, {vorname}!“ ohne Namen → „Willkommen!“).
 */
export function fillPlaceholders(template: string, values: PlaceholderValues): string {
  const filled = template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const k = key.toLowerCase() as keyof PlaceholderValues;
    return k in values ? (values[k] ?? '') : match;
  });
  return filled
    .replace(/[ \t]+([,.!?:;])/g, '$1') // Leerzeichen vor Satzzeichen
    .replace(/,+([.!?])/g, '$1') // „Willkommen,!“ → „Willkommen!“
    .replace(/,{2,}/g, ',')
    .replace(/^[\s,.;:·]+/, '') // führende Satzzeichen
    .replace(/[\s,;:·]+$/, '') // Satzzeichen am Ende (außer . ! ?)
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export interface PersonForLayout {
  firstName?: string;
  lastName?: string;
  company?: string;
  photo?: string;
  groupName?: string;
  groupColor?: string;
}

/** Name nach Datenschutz-Einstellung des Layouts. */
export function formatName(person: PersonForLayout, format: NameFormat): string {
  if (format === 'none') return '';
  if (format === 'first') return person.firstName?.trim() ?? '';
  return [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
}

/** Inhalt eines Ergebnisses für den Gästebildschirm (fertige Texte, nur angezeigte Angaben). */
export interface LayoutResult {
  layoutId: string;
  tone: LayoutTone;
  title: string;
  text: string;
  name?: string;
  company?: string;
  photo?: string;
  groupName?: string;
  groupColor?: string;
}

export interface ResultInput {
  tone: LayoutTone;
  /** 'in' | 'out' | 'deny' | 'wait' | 'duplicate' – bestimmt, welche Texte gelten. */
  kind: 'in' | 'out' | 'deny' | 'wait' | 'duplicate';
  /** Vorgabetexte (z. B. „Bereits erfasst“), wenn das Layout keine eigenen hat. */
  fallbackTitle: string;
  fallbackText: string;
  /** Grund für Gäste (leer bei verlorenen Karten). */
  reason?: string;
  /** Person/Gruppe – fehlt, wenn verborgen werden soll. */
  person?: PersonForLayout;
  /** Ersatzanzeige, wenn kein Name bekannt ist (gesperrt / keine Person), z. B. „Karte B-001“. */
  cardLabel?: string;
  at: number;
  orgName: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function buildLayoutResult(layout: PresentationLayout, input: ResultInput): LayoutResult {
  const d = new Date(input.at);
  const person = input.person;
  const name = person ? formatName(person, layout.nameFormat) : '';
  const values: PlaceholderValues = {
    vorname: layout.nameFormat === 'none' ? '' : (person?.firstName ?? ''),
    nachname: layout.nameFormat === 'full' ? (person?.lastName ?? '') : '',
    name,
    firma: person?.company ?? '',
    gruppe: person?.groupName ?? '',
    uhrzeit: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    datum: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
    organisation: input.orgName,
    grund: input.reason ?? '',
  };
  const t = layout.texts;
  const templates: Record<ResultInput['kind'], [string, string]> = {
    in: [t.inTitle, t.inText],
    out: [t.outTitle, t.outText],
    deny: [t.denyTitle, t.denyText],
    wait: [t.waitTitle, t.waitText],
    duplicate: [input.fallbackTitle, input.fallbackText],
  };
  const [title, text] = templates[input.kind];
  const showPerson = layout.arrangement !== 'minimal';
  return {
    layoutId: layout.id,
    tone: input.tone,
    title: fillPlaceholders(title, values) || input.fallbackTitle,
    text: fillPlaceholders(text, values),
    // ohne Namen (gesperrt / keine Person): Kartennummer – außer das Layout zeigt keine Namen
    name: name || (layout.nameFormat === 'none' ? undefined : input.cardLabel),
    company: showPerson && layout.show.company ? person?.company || undefined : undefined,
    photo: showPerson && layout.show.photo ? person?.photo : undefined,
    groupName: showPerson && layout.show.group ? person?.groupName : undefined,
    groupColor: showPerson && layout.show.group ? person?.groupColor : undefined,
  };
}

/** Texte des Ruhebildschirms (Platzhalter ohne Personendaten). */
export function idleTexts(layout: PresentationLayout, orgName: string, now: Date): { title: string; hint: string } {
  const values: PlaceholderValues = {
    organisation: orgName,
    uhrzeit: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    datum: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
  };
  return { title: fillPlaceholders(layout.texts.idleTitle, values), hint: fillPlaceholders(layout.texts.idleHint, values) };
}

/** Neues Layout als Kopie (z. B. des Standards). */
export function copyLayout(source: PresentationLayout, id: string, name: string, now: number): PresentationLayout {
  return {
    ...structuredClone(source),
    id,
    name,
    builtIn: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/** Fehlende Felder (z. B. aus älteren Backups) mit Standardwerten ergänzen. */
export function normalizeLayout(raw: Partial<PresentationLayout> & { id: string }): PresentationLayout {
  return {
    ...STANDARD_LAYOUT,
    ...raw,
    builtIn: raw.id === STANDARD_LAYOUT_ID ? true : undefined,
    background: { ...STANDARD_LAYOUT.background, ...raw.background },
    show: { ...STANDARD_LAYOUT.show, ...raw.show },
    texts: { ...DEFAULT_TEXTS, ...raw.texts },
    name: raw.name?.trim() || 'Layout',
  };
}
