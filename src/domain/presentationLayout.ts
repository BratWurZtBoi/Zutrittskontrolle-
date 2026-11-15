/**
 * Gästebildschirm: frei gestaltbare Layouts aus positionierten Elementen.
 * Zwei Arten – getrennt voneinander gestaltbar:
 * - Ruhebildschirm (`idle`): wird angezeigt, solange niemand scannt (ein Design ist aktiv).
 * - Scan-Anzeige (`result`): erscheint beim Scannen, zuweisbar an Gruppen/Karten.
 * Reine Funktionen ohne DOM/DB – gut testbar.
 *
 * Datenschutz: Platzhalter mit Personendaten werden im Scanner-Fenster gefüllt
 * (dort sind die Daten entschlüsselt). Das Präsentationsfenster bekommt nur die
 * fertigen Texte und nur die Angaben, die das Layout anzeigt.
 */

export type ScreenKind = 'idle' | 'result';
/** Ergebnisarten der Scan-Anzeige. „wait“ umfasst auch Hinweise wie „Bereits erfasst“. */
export type ResultKind = 'in' | 'out' | 'deny' | 'wait';
export type ElementType = 'text' | 'photo' | 'group' | 'clock' | 'date' | 'logo';
export type TextAlign = 'left' | 'center' | 'right';
export type BackgroundKind = 'color' | 'gradient' | 'image';
/** 'outcome' = Ergebnisfarbe (grün/blau/rot) als Hintergrund, 'custom' = eigener Hintergrund mit farbigem Streifen. */
export type ResultBackground = 'outcome' | 'custom';
export type NameFormat = 'full' | 'first' | 'none';
export type LayoutTone = 'ok' | 'out' | 'deny' | 'warn';

/** Ein Element auf dem Bildschirm. Positionen in Prozent – unabhängig von der Bildschirmgröße. */
export interface LayoutElement {
  id: string;
  type: ElementType;
  /** Nur Textfeld: Text mit Platzhaltern wie {vorname}. */
  text?: string;
  /** Nur Textfeld (Scan-Anzeige): Ergebnissymbol (✓ / ✕ …) vor dem Text. */
  withIcon?: boolean;
  /** Linke obere Ecke in % der Bildschirmbreite bzw. -höhe. */
  x: number;
  y: number;
  /** Breite in % der Bildschirmbreite. */
  w: number;
  /** Schriftgröße in % der Bildschirmhöhe (Text, Uhr, Datum, Gruppe). */
  size: number;
  align: TextAlign;
  bold: boolean;
  /** Eigene Farbe, sonst die Schriftfarbe des Layouts. */
  color?: string;
  /** Nur Scan-Anzeige: bei welchen Ergebnissen sichtbar (fehlt/leer = immer). */
  showOn?: ResultKind[];
}

/** Texte je Ergebnis – Werte der Platzhalter {titel} und {meldung}. */
export interface ResultTexts {
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
  /** Mitgeliefert – nicht änderbar, nur kopierbar. */
  builtIn?: boolean;
  kind: ScreenKind;
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
  /** Nur Scan-Anzeige. */
  resultBackground: ResultBackground;
  /** Logo als Data-URL (für Logo-Elemente). */
  logo?: string;
  /** Nur Scan-Anzeige: wie der Name erscheint (Datenschutz). */
  nameFormat: NameFormat;
  /** Nur Scan-Anzeige: Texte je Ergebnis. */
  texts: ResultTexts;
  elements: LayoutElement[];
  createdAt: number;
  updatedAt: number;
}

export const STANDARD_LAYOUT_ID = 'standard';
export const STANDARD_IDLE_ID = 'standard-idle';

export const DEFAULT_RESULT_TEXTS: ResultTexts = {
  inTitle: 'Willkommen',
  inText: 'Eingang gebucht · {uhrzeit} Uhr',
  outTitle: 'Auf Wiedersehen',
  outText: 'Ausgang gebucht · {uhrzeit} Uhr',
  denyTitle: 'Kein Zutritt',
  denyText: '{grund} Bitte wenden Sie sich an den Empfang.',
  waitTitle: 'Bitte kurz warten',
  waitText: 'Ihr Eintritt wird gleich bestätigt.',
};

// ---------------------------------------------------------------------------
// Vorlagen
// ---------------------------------------------------------------------------

type ElementSpec = Omit<LayoutElement, 'align' | 'bold'> & Partial<Pick<LayoutElement, 'align' | 'bold'>>;
const el = (spec: ElementSpec): LayoutElement => ({ align: 'center', bold: false, ...spec });

/** Foto im Format 3:4: Breite in % der Bildschirmbreite für eine Höhe in % der Bildschirmhöhe (16:9). */
const photoWidthFor = (heightPct: number) => Math.round(((heightPct * 3) / 4) * (9 / 16) * 10) / 10;

export const RESULT_TEMPLATES: { id: string; label: string; elements: () => LayoutElement[] }[] = [
  {
    id: 'center',
    label: 'Zentriert',
    elements: () => [
      el({ id: 'title', type: 'text', text: '{titel}', withIcon: true, x: 5, y: 7, w: 90, size: 12, bold: true }),
      el({ id: 'photo', type: 'photo', x: 50 - photoWidthFor(30) / 2, y: 23, w: photoWidthFor(30), size: 0 }),
      el({ id: 'name', type: 'text', text: '{name}', x: 5, y: 56, w: 90, size: 9, bold: true }),
      el({ id: 'group', type: 'group', x: 30, y: 70, w: 40, size: 3.6 }),
      el({ id: 'message', type: 'text', text: '{meldung}', x: 10, y: 81, w: 80, size: 4.4, bold: true }),
    ],
  },
  {
    id: 'side',
    label: 'Foto links',
    elements: () => [
      el({ id: 'photo', type: 'photo', x: 6, y: 16, w: photoWidthFor(66), size: 0 }),
      el({ id: 'title', type: 'text', text: '{titel}', withIcon: true, x: 40, y: 20, w: 56, size: 9, bold: true, align: 'left' }),
      el({ id: 'name', type: 'text', text: '{name}', x: 40, y: 35, w: 56, size: 7, bold: true, align: 'left' }),
      el({ id: 'group', type: 'group', x: 40, y: 49, w: 56, size: 3.6, align: 'left' }),
      el({ id: 'message', type: 'text', text: '{meldung}', x: 40, y: 61, w: 56, size: 4.2, bold: true, align: 'left' }),
    ],
  },
  {
    id: 'text',
    label: 'Nur Text',
    elements: () => [
      el({ id: 'title', type: 'text', text: '{titel}', withIcon: true, x: 5, y: 18, w: 90, size: 17, bold: true }),
      el({ id: 'name', type: 'text', text: '{name}', x: 5, y: 46, w: 90, size: 12, bold: true }),
      el({ id: 'message', type: 'text', text: '{meldung}', x: 10, y: 70, w: 80, size: 5, bold: true }),
    ],
  },
];

export const IDLE_TEMPLATES: { id: string; label: string; elements: () => LayoutElement[] }[] = [
  {
    id: 'classic',
    label: 'Klassisch',
    elements: () => [
      el({ id: 'org', type: 'text', text: '{organisation}', x: 5, y: 17, w: 90, size: 6.2, bold: true }),
      el({ id: 'title', type: 'text', text: 'Herzlich willkommen', x: 5, y: 27, w: 90, size: 13.5, bold: true }),
      el({ id: 'hint', type: 'text', text: 'Bitte Karte mit QR-Code vor die Kamera halten', x: 5, y: 46, w: 90, size: 4.6 }),
      el({ id: 'clock', type: 'clock', x: 5, y: 56, w: 90, size: 17 }),
      el({ id: 'date', type: 'date', x: 5, y: 78, w: 90, size: 3.9 }),
    ],
  },
  {
    id: 'clock',
    label: 'Große Uhr',
    elements: () => [
      el({ id: 'org', type: 'text', text: '{organisation}', x: 5, y: 8, w: 90, size: 5, bold: true }),
      el({ id: 'clock', type: 'clock', x: 5, y: 24, w: 90, size: 34 }),
      el({ id: 'date', type: 'date', x: 5, y: 66, w: 90, size: 5 }),
      el({ id: 'hint', type: 'text', text: 'Bitte Karte vor die Kamera halten', x: 5, y: 82, w: 90, size: 4 }),
    ],
  },
  {
    id: 'text',
    label: 'Nur Text',
    elements: () => [
      el({ id: 'title', type: 'text', text: 'Herzlich willkommen', x: 5, y: 30, w: 90, size: 15, bold: true }),
      el({ id: 'hint', type: 'text', text: 'Bitte Karte mit QR-Code vor die Kamera halten', x: 5, y: 58, w: 90, size: 5 }),
    ],
  },
];

const BASE: Omit<PresentationLayout, 'id' | 'name' | 'kind' | 'elements'> = {
  background: { kind: 'gradient', color: '#0f172a', color2: '#1e3a8a', dim: 0 },
  textColor: 'light',
  resultBackground: 'outcome',
  nameFormat: 'full',
  texts: DEFAULT_RESULT_TEXTS,
  createdAt: 0,
  updatedAt: 0,
};

/** Mitgelieferte Scan-Anzeige (der bisherige Bildschirm). */
export const STANDARD_LAYOUT: PresentationLayout = {
  ...BASE,
  id: STANDARD_LAYOUT_ID,
  name: 'Standard',
  builtIn: true,
  kind: 'result',
  elements: RESULT_TEMPLATES[0]!.elements(),
};

/** Mitgelieferter Ruhebildschirm. */
export const STANDARD_IDLE: PresentationLayout = {
  ...BASE,
  id: STANDARD_IDLE_ID,
  name: 'Standard',
  builtIn: true,
  kind: 'idle',
  elements: IDLE_TEMPLATES[0]!.elements(),
};

export const BUILT_IN_LAYOUTS = [STANDARD_IDLE, STANDARD_LAYOUT];

export function builtInFor(kind: ScreenKind): PresentationLayout {
  return kind === 'idle' ? STANDARD_IDLE : STANDARD_LAYOUT;
}

export const PLACEHOLDERS: Record<ScreenKind, { key: string; label: string }[]> = {
  idle: [
    { key: '{organisation}', label: 'Organisation' },
    { key: '{uhrzeit}', label: 'Uhrzeit' },
    { key: '{datum}', label: 'Datum' },
  ],
  result: [
    { key: '{titel}', label: 'Titel je Ergebnis (z. B. „Willkommen“)' },
    { key: '{meldung}', label: 'Meldung je Ergebnis' },
    { key: '{vorname}', label: 'Vorname' },
    { key: '{nachname}', label: 'Nachname' },
    { key: '{name}', label: 'Vor- und Nachname' },
    { key: '{firma}', label: 'Firma / Abteilung' },
    { key: '{gruppe}', label: 'Gruppe' },
    { key: '{uhrzeit}', label: 'Uhrzeit' },
    { key: '{datum}', label: 'Datum' },
    { key: '{organisation}', label: 'Organisation' },
    { key: '{grund}', label: 'Grund bei „Kein Zutritt“' },
  ],
};

// ---------------------------------------------------------------------------
// Elemente bearbeiten
// ---------------------------------------------------------------------------

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 10) / 10;

/** Element an eine Position setzen – bleibt immer ganz auf dem Bildschirm. */
export function moveElement(element: LayoutElement, x: number, y: number): LayoutElement {
  return { ...element, x: round(clamp(x, 0, 100 - element.w)), y: round(clamp(y, 0, 97)) };
}

/**
 * Neues Element mit sinnvollen Startwerten – an Stellen, die in den Vorlagen frei sind
 * (Text unten, Uhr oben rechts, Datum und Logo oben links), damit nichts überdeckt wird.
 */
export function newElement(type: ElementType, id: string): LayoutElement {
  switch (type) {
    case 'text':
      return el({ id, type, text: 'Neuer Text', x: 10, y: 89, w: 80, size: 4.5 });
    case 'photo':
      return el({ id, type, x: 50 - photoWidthFor(30) / 2, y: 30, w: photoWidthFor(30), size: 0 });
    case 'group':
      return el({ id, type, x: 30, y: 89, w: 40, size: 3.6 });
    case 'clock':
      return el({ id, type, x: 72, y: 3, w: 25, size: 6, align: 'right' });
    case 'date':
      return el({ id, type, x: 3, y: 3, w: 45, size: 3.4, align: 'left' });
    case 'logo':
      return el({ id, type, x: 3, y: 3, w: 14, size: 0, align: 'left' });
  }
}

/** Welche Elemente passen zu welcher Art Bildschirm? */
export const ELEMENT_TYPES: Record<ScreenKind, { type: ElementType; label: string }[]> = {
  idle: [
    { type: 'text', label: 'Textfeld' },
    { type: 'clock', label: 'Uhrzeit' },
    { type: 'date', label: 'Datum' },
    { type: 'logo', label: 'Logo' },
  ],
  result: [
    { type: 'text', label: 'Textfeld' },
    { type: 'photo', label: 'Foto' },
    { type: 'group', label: 'Gruppe' },
    { type: 'clock', label: 'Uhrzeit' },
    { type: 'date', label: 'Datum' },
    { type: 'logo', label: 'Logo' },
  ],
};

export function isVisibleFor(element: LayoutElement, kind: ResultKind): boolean {
  return !element.showOn || element.showOn.length === 0 || element.showOn.includes(kind);
}

// ---------------------------------------------------------------------------
// Auswahl und Inhalte
// ---------------------------------------------------------------------------

/**
 * Welche Scan-Anzeige gilt? Karte vor Gruppe vor Standard; gelöschte oder unpassende
 * Layouts fallen auf die nächste Ebene bzw. das mitgelieferte Layout zurück.
 */
export function pickLayout(
  layouts: PresentationLayout[],
  ids: { card?: string; group?: string; fallback?: string },
  kind: ScreenKind = 'result',
): PresentationLayout {
  const byId = new Map(layouts.filter((l) => l.kind === kind).map((l) => [l.id, l]));
  for (const id of [ids.card, ids.group, ids.fallback]) {
    const found = id ? byId.get(id) : undefined;
    if (found) return found;
  }
  return byId.get(builtInFor(kind).id) ?? builtInFor(kind);
}

export type PlaceholderValues = Partial<
  Record<'titel' | 'meldung' | 'vorname' | 'nachname' | 'name' | 'firma' | 'gruppe' | 'uhrzeit' | 'datum' | 'organisation' | 'grund', string>
>;

/**
 * Ersetzt Platzhalter wie {vorname}. Leere Werte hinterlassen keine Lücken
 * („Willkommen, {vorname}!“ ohne Namen → „Willkommen!“). Zeilenumbrüche bleiben.
 */
export function fillPlaceholders(template: string, values: PlaceholderValues): string {
  const filled = template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const k = key.toLowerCase() as keyof PlaceholderValues;
    return k in values ? (values[k] ?? '') : match;
  });
  return filled
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]+([,.!?:;])/g, '$1') // Leerzeichen vor Satzzeichen
        .replace(/,+([.!?])/g, '$1') // „Willkommen,!“ → „Willkommen!“
        .replace(/,{2,}/g, ',')
        .replace(/^[\s,.;:·]+/, '') // führende Satzzeichen
        .replace(/[\s,;:·]+$/, '') // Satzzeichen am Ende (außer . ! ?)
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .join('\n')
    .trim();
}

const pad = (n: number) => String(n).padStart(2, '0');
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateOf = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

/** Texte eines Ruhebildschirms (Platzhalter ohne Personendaten). */
export function idleText(template: string, orgName: string, now: Date): string {
  return fillPlaceholders(template, { organisation: orgName, uhrzeit: timeOf(now), datum: dateOf(now) });
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

/** Inhalt einer Scan-Anzeige für den Gästebildschirm: fertige Texte, nur angezeigte Angaben. */
export interface LayoutResult {
  layoutId: string;
  tone: LayoutTone;
  kind: ResultKind;
  /** Fertige Texte je sichtbarem Textfeld (Element-ID → Text). */
  texts: Record<string, string>;
  photo?: string;
  /** Ersatz, wenn ein Foto-Element sichtbar ist, aber kein Foto vorliegt. */
  initials?: string;
  groupName?: string;
  groupColor?: string;
}

export interface ResultInput {
  tone: LayoutTone;
  /** Welche Texte gelten; 'duplicate' (z. B. „Bereits erfasst“) zählt als Hinweis („wait“). */
  kind: ResultKind | 'duplicate';
  /** Vorgabetexte für Hinweise ohne eigene Layout-Texte. */
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

export function buildLayoutResult(layout: PresentationLayout, input: ResultInput): LayoutResult {
  const kind: ResultKind = input.kind === 'duplicate' ? 'wait' : input.kind;
  const d = new Date(input.at);
  const person = input.person;
  const fullName = person ? formatName(person, layout.nameFormat) : '';
  const name = fullName || (layout.nameFormat === 'none' ? '' : (input.cardLabel ?? ''));
  const t = layout.texts;
  const titles: Record<ResultInput['kind'], [string, string]> = {
    in: [t.inTitle, t.inText],
    out: [t.outTitle, t.outText],
    deny: [t.denyTitle, t.denyText],
    wait: [t.waitTitle, t.waitText],
    duplicate: [input.fallbackTitle, input.fallbackText],
  };
  const base: PlaceholderValues = {
    vorname: layout.nameFormat === 'none' ? '' : (person?.firstName ?? ''),
    nachname: layout.nameFormat === 'full' ? (person?.lastName ?? '') : '',
    name,
    firma: person?.company ?? '',
    gruppe: person?.groupName ?? '',
    uhrzeit: timeOf(d),
    datum: dateOf(d),
    organisation: input.orgName,
    grund: input.reason ?? '',
  };
  const [titleTpl, messageTpl] = titles[input.kind];
  const values: PlaceholderValues = {
    ...base,
    titel: fillPlaceholders(titleTpl, base) || input.fallbackTitle,
    meldung: fillPlaceholders(messageTpl, base),
  };

  const visible = layout.elements.filter((e) => isVisibleFor(e, kind));
  const texts: Record<string, string> = {};
  for (const e of visible) if (e.type === 'text') texts[e.id] = fillPlaceholders(e.text ?? '', values);

  const result: LayoutResult = { layoutId: layout.id, tone: input.tone, kind, texts };
  if (person && visible.some((e) => e.type === 'photo')) {
    if (person.photo) result.photo = person.photo;
    else if (fullName) result.initials = `${person.firstName?.[0] ?? ''}${layout.nameFormat === 'full' ? (person.lastName?.[0] ?? '') : ''}`.toUpperCase();
  }
  if (person?.groupName && visible.some((e) => e.type === 'group')) {
    result.groupName = person.groupName;
    result.groupColor = person.groupColor;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Kopieren, Ergänzen, ältere Layouts übernehmen
// ---------------------------------------------------------------------------

/** Neues Layout als Kopie (z. B. des Standards). */
export function copyLayout(source: PresentationLayout, id: string, name: string, now: number): PresentationLayout {
  return { ...structuredClone(source), id, name, builtIn: undefined, createdAt: now, updatedAt: now };
}

/** Layout aus App-Version 0.7 (feste Anordnung statt Elementen). */
interface LegacyLayout {
  id: string;
  name?: string;
  arrangement?: 'center' | 'side' | 'minimal';
  show?: { photo?: boolean; group?: boolean; company?: boolean; clock?: boolean; org?: boolean };
  texts?: Partial<ResultTexts> & { idleTitle?: string; idleHint?: string };
  logo?: string;
}

function legacyResultElements(raw: LegacyLayout): LayoutElement[] {
  const template = RESULT_TEMPLATES.find((t) => t.id === (raw.arrangement === 'minimal' ? 'text' : raw.arrangement)) ?? RESULT_TEMPLATES[0]!;
  let elements = template.elements();
  if (raw.show?.photo === false) elements = elements.filter((e) => e.type !== 'photo');
  if (raw.show?.group === false) elements = elements.filter((e) => e.type !== 'group');
  if (raw.show?.company) {
    const nameEl = elements.find((e) => e.id === 'name');
    if (nameEl) elements.push({ ...nameEl, id: 'company', text: '{firma}', y: nameEl.y + nameEl.size + 2, size: 3.6, bold: false });
  }
  if (raw.logo) elements.push(el({ id: 'logo', type: 'logo', x: 3, y: 3, w: 14, size: 0, align: 'left' }));
  return elements;
}

/** Ruhebildschirm aus einem Layout der App-Version 0.7 (dort hingen beide zusammen). */
export function idleFromLegacy(raw: LegacyLayout, id: string, now: number): PresentationLayout {
  let elements = IDLE_TEMPLATES[0]!.elements().map((e) => {
    if (e.id === 'title' && raw.texts?.idleTitle !== undefined) return { ...e, text: raw.texts.idleTitle };
    if (e.id === 'hint' && raw.texts?.idleHint !== undefined) return { ...e, text: raw.texts.idleHint };
    return e;
  });
  if (raw.show?.clock === false) elements = elements.filter((e) => e.type !== 'clock' && e.type !== 'date');
  if (raw.show?.org === false) elements = elements.filter((e) => e.id !== 'org');
  if (raw.logo) elements.unshift(el({ id: 'logo', type: 'logo', x: 40, y: 3, w: 20, size: 0 }));
  const base = normalizeLayout(raw as Partial<PresentationLayout> & { id: string });
  return { ...base, id, name: `${base.name} (Ruhebildschirm)`, kind: 'idle', elements, createdAt: now, updatedAt: now };
}

export function isLegacyLayout(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !Array.isArray((raw as { elements?: unknown }).elements);
}

/** Fehlende Felder ergänzen und Layouts älterer App-Versionen umwandeln. */
export function normalizeLayout(raw: Partial<PresentationLayout> & { id: string }): PresentationLayout {
  const legacy = isLegacyLayout(raw);
  const kind: ScreenKind = raw.kind === 'idle' ? 'idle' : 'result';
  const texts = (raw.texts ?? {}) as Partial<ResultTexts>;
  return {
    ...BASE,
    id: raw.id,
    name: raw.name?.trim() || 'Layout',
    builtIn: raw.id === STANDARD_LAYOUT_ID || raw.id === STANDARD_IDLE_ID ? true : undefined,
    kind,
    background: { ...BASE.background, ...raw.background },
    textColor: raw.textColor === 'dark' ? 'dark' : 'light',
    resultBackground: raw.resultBackground === 'custom' ? 'custom' : 'outcome',
    logo: raw.logo,
    nameFormat: raw.nameFormat === 'first' || raw.nameFormat === 'none' ? raw.nameFormat : 'full',
    texts: {
      inTitle: texts.inTitle ?? DEFAULT_RESULT_TEXTS.inTitle,
      inText: texts.inText ?? DEFAULT_RESULT_TEXTS.inText,
      outTitle: texts.outTitle ?? DEFAULT_RESULT_TEXTS.outTitle,
      outText: texts.outText ?? DEFAULT_RESULT_TEXTS.outText,
      denyTitle: texts.denyTitle ?? DEFAULT_RESULT_TEXTS.denyTitle,
      denyText: texts.denyText ?? DEFAULT_RESULT_TEXTS.denyText,
      waitTitle: texts.waitTitle ?? DEFAULT_RESULT_TEXTS.waitTitle,
      waitText: texts.waitText ?? DEFAULT_RESULT_TEXTS.waitText,
    },
    elements: legacy ? legacyResultElements(raw as LegacyLayout) : (raw.elements ?? []).map((e) => ({ ...el(e as ElementSpec) })),
    createdAt: raw.createdAt ?? 0,
    updatedAt: raw.updatedAt ?? 0,
  };
}
