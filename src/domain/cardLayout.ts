/**
 * Gedruckte Karten (Scheckkarte 85,6 × 54 mm, A7, A6 oder eigene Größe; Vorder- und
 * optional Rückseite): frei gestaltbare Layouts aus positionierten Elementen – Text mit
 * Platzhaltern, QR-Code, Foto, Logo, Farbfläche. Positionen in % der Karte, Schrift in %
 * der Kartenhöhe – so passt sich ein Layout jeder Größe an.
 * Reine Funktionen ohne DOM/DB – gut testbar.
 */

import type { ResizeHandle, SnapGuides } from './editorGeometry';
import type { CardHolder } from './types';

export type { ResizeHandle, SnapGuides } from './editorGeometry';
export type CardOrientation = 'landscape' | 'portrait';
/** Kartengröße: Scheckkarte (ID-1), A7, A6 oder eigene Größe – Einladungen zusätzlich A5, A4, DIN lang. */
export type CardFormat = 'id1' | 'a7' | 'a6' | 'custom' | 'a5' | 'a4' | 'dl';
export type CardFace = 'front' | 'back';
/** Breite × Höhe der gedruckten Karte in mm. */
export interface CardSize {
  w: number;
  h: number;
}
export type CardElementType = 'text' | 'qr' | 'photo' | 'logo' | 'band';
/** Wann ein Element erscheint: immer, nur mit gedruckter Person, nur ohne (anonyme Karte). */
export type CardShowWhen = 'always' | 'holder' | 'anonymous';
export type TextAlign = 'left' | 'center' | 'right';
/** Farbe: eigene (#rrggbb), Gruppenfarbe oder Schwarz/Weiß passend zur Gruppenfarbe. */
export type CardColor = string | 'group' | 'on-group';

export interface CardElement {
  id: string;
  type: CardElementType;
  /** Textfeld: Text mit Platzhaltern wie {nachname}. */
  text?: string;
  /** Linke obere Ecke in % der Kartenbreite bzw. -höhe. */
  x: number;
  y: number;
  /** Breite in % der Kartenbreite. */
  w: number;
  /** Nur Farbfläche: Höhe in % der Kartenhöhe. */
  h?: number;
  /** Schriftgröße in % der Kartenhöhe. */
  size: number;
  align: TextAlign;
  bold: boolean;
  /** Text: Schriftfarbe; Farbfläche: Füllung. Fehlt = Schriftfarbe des Layouts bzw. Gruppenfarbe. */
  color?: CardColor;
  showWhen?: CardShowWhen;
  /** Textfeld ausblenden, wenn ein enthaltener Platzhalter leer ist (z. B. „gültig bis {gueltig_bis}“). */
  hideIfEmpty?: boolean;
}

export interface CardBackground {
  /** #rrggbb oder 'group' */
  color: CardColor;
  image?: string;
}

/** Eine Seite der Karte: Hintergrund und Elemente. */
export interface CardSide {
  background: CardBackground;
  elements: CardElement[];
}

export interface CardLayout {
  id: string;
  name: string;
  /** Mitgeliefert – nicht änderbar, nur kopierbar. */
  builtIn?: boolean;
  orientation: CardOrientation;
  /** Fehlt = Scheckkarte (Layouts bis Version 0.12). */
  format?: CardFormat;
  /** Nur bei format 'custom': Breite × Höhe in mm. */
  customSize?: CardSize;
  /** Vorderseite: Hintergrundfarbe (#rrggbb oder 'group') und optional ein Bild. */
  background: CardBackground;
  /** Standard-Schriftfarbe (beide Seiten). */
  textColor: string;
  /** Logo als Data-URL (für Logo-Elemente). */
  logo?: string;
  /** Vorderseite: Elemente. */
  elements: CardElement[];
  /** Rückseite (optional). */
  back?: CardSide;
  createdAt: number;
  updatedAt: number;
}

export const STANDARD_CARD_LAYOUT_ID = 'standard-karte';

/** Feste Formate (kurze × lange Seite in mm). */
export const CARD_FORMATS: { id: Exclude<CardFormat, 'custom'>; label: string; short: number; long: number }[] = [
  { id: 'id1', label: 'Scheckkarte', short: 54, long: 85.6 },
  { id: 'a7', label: 'A7', short: 74, long: 105 },
  { id: 'a6', label: 'A6', short: 105, long: 148 },
];
/** Formate für Einladungen (Veranstaltungen). */
export const INVITATION_FORMATS: { id: Exclude<CardFormat, 'custom'>; label: string; short: number; long: number }[] = [
  { id: 'a4', label: 'A4', short: 210, long: 297 },
  { id: 'a5', label: 'A5', short: 148, long: 210 },
  { id: 'a6', label: 'A6 / Postkarte', short: 105, long: 148 },
  { id: 'dl', label: 'DIN lang', short: 99, long: 210 },
];
const ALL_FORMATS = [...CARD_FORMATS, ...INVITATION_FORMATS.filter((f) => !CARD_FORMATS.some((c) => c.id === f.id))];
/** Eigene Größe: passt auf einen A4-Bogen mit Druckrand. */
export const CUSTOM_SIZE_LIMITS = { min: 30, maxW: 190, maxH: 277 };

const clampNum = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Größe der gedruckten Karte in mm. */
export function cardSize(layout: Pick<CardLayout, 'orientation' | 'format' | 'customSize'>): CardSize {
  if (layout.format === 'custom' && layout.customSize) {
    const { min, maxW, maxH } = CUSTOM_SIZE_LIMITS;
    return {
      w: Math.round(clampNum(layout.customSize.w, min, maxW) * 10) / 10,
      h: Math.round(clampNum(layout.customSize.h, min, maxH) * 10) / 10,
    };
  }
  const f = ALL_FORMATS.find((x) => x.id === layout.format) ?? CARD_FORMATS[0]!;
  return layout.orientation === 'portrait' ? { w: f.short, h: f.long } : { w: f.long, h: f.short };
}

/** „Scheckkarte hoch · 54 × 85,6 mm“ */
export function formatLabel(layout: Pick<CardLayout, 'orientation' | 'format' | 'customSize'>): string {
  const { w, h } = cardSize(layout);
  const dims = `${String(w).replace('.', ',')} × ${String(h).replace('.', ',')} mm`;
  if (layout.format === 'custom') return `Eigene Größe · ${dims}`;
  const f = ALL_FORMATS.find((x) => x.id === layout.format) ?? CARD_FORMATS[0]!;
  return `${f.label} ${layout.orientation === 'portrait' ? 'hoch' : 'quer'} · ${dims}`;
}

/** Elemente und Hintergrund einer Seite. */
export function sideOf(layout: CardLayout, face: CardFace): CardSide {
  if (face === 'back') return layout.back ?? { background: { color: '#ffffff' }, elements: [] };
  return { background: layout.background, elements: layout.elements };
}

/** Layout mit geänderter Seite. */
export function withSide(layout: CardLayout, face: CardFace, side: CardSide): CardLayout {
  return face === 'back' ? { ...layout, back: side } : { ...layout, background: side.background, elements: side.elements };
}
/** Kleinster QR-Code, der mit Webcam und Handy noch sicher erkannt wird. */
export const MIN_QR_MM = 18;

type Spec = Omit<CardElement, 'align' | 'bold'> & Partial<Pick<CardElement, 'align' | 'bold'>>;
const el = (spec: Spec): CardElement => ({ align: 'left', bold: false, ...spec });

// ---------------------------------------------------------------------------
// Vorlagen
// ---------------------------------------------------------------------------

export const CARD_TEMPLATES: { id: string; label: string; orientation: CardOrientation; elements: () => CardElement[] }[] = [
  {
    id: 'standard',
    label: 'Querformat (Standard)',
    orientation: 'landscape',
    elements: () => [
      el({ id: 'head', type: 'band', x: 0, y: 0, w: 100, h: 14.8, size: 0, color: 'group' }),
      el({ id: 'group', type: 'text', text: '{gruppe}', x: 3.5, y: 3.6, w: 45, size: 5.9, bold: true, color: 'on-group' }),
      el({ id: 'org', type: 'text', text: '{organisation}', x: 45, y: 4.4, w: 51.5, size: 4.3, bold: true, align: 'right', color: 'on-group' }),
      el({ id: 'photo', type: 'photo', x: 3.5, y: 21, w: 24.5, size: 0, showWhen: 'holder' }),
      el({ id: 'first', type: 'text', text: '{dienstgrad} {vorname}', x: 31, y: 23, w: 34, size: 5.9, showWhen: 'holder' }),
      el({ id: 'last', type: 'text', text: '{nachname}', x: 31, y: 31, w: 34, size: 7, bold: true, showWhen: 'holder' }),
      el({ id: 'company', type: 'text', text: '{einheit}', x: 31, y: 46, w: 34, size: 4.8, showWhen: 'holder', hideIfEmpty: true }),
      el({ id: 'number', type: 'text', text: 'Nr. {karte}', x: 31, y: 56, w: 34, size: 4.8, showWhen: 'holder' }),
      el({ id: 'valid', type: 'text', text: 'gültig bis {gueltig_bis}', x: 31, y: 65, w: 34, size: 4.8, showWhen: 'holder', hideIfEmpty: true }),
      el({ id: 'anon-number', type: 'text', text: '{karte}', x: 3.5, y: 34, w: 58, size: 16.7, bold: true, color: 'group', showWhen: 'anonymous' }),
      el({ id: 'anon-group', type: 'text', text: '{gruppe}', x: 3.5, y: 56, w: 58, size: 4.8, showWhen: 'anonymous' }),
      el({ id: 'qr', type: 'qr', x: 65.4, y: 22, w: 31.5, size: 0 }),
      el({ id: 'foot', type: 'band', x: 0, y: 95.4, w: 100, h: 4.6, size: 0, color: 'group' }),
    ],
  },
  {
    id: 'portrait',
    label: 'Hochformat (für Kartenhalter am Band)',
    orientation: 'portrait',
    elements: () => [
      el({ id: 'head', type: 'band', x: 0, y: 0, w: 100, h: 11, size: 0, color: 'group' }),
      el({ id: 'org', type: 'text', text: '{organisation}', x: 5, y: 3.4, w: 90, size: 3.4, bold: true, align: 'center', color: 'on-group' }),
      el({ id: 'photo', type: 'photo', x: 30, y: 14, w: 40, size: 0, showWhen: 'holder' }),
      el({ id: 'name', type: 'text', text: '{dienstgrad} {vorname} {nachname}', x: 5, y: 47, w: 90, size: 4.6, bold: true, align: 'center', showWhen: 'holder' }),
      el({ id: 'company', type: 'text', text: '{einheit}', x: 5, y: 53.5, w: 90, size: 3.2, align: 'center', showWhen: 'holder', hideIfEmpty: true }),
      el({ id: 'anon-number', type: 'text', text: '{karte}', x: 5, y: 24, w: 90, size: 11, bold: true, align: 'center', color: 'group', showWhen: 'anonymous' }),
      el({ id: 'anon-group', type: 'text', text: '{gruppe}', x: 5, y: 40, w: 90, size: 3.6, align: 'center', showWhen: 'anonymous' }),
      el({ id: 'qr', type: 'qr', x: 24, y: 59, w: 52, size: 0 }),
      el({ id: 'number', type: 'text', text: '{karte} · {gruppe}', x: 5, y: 92, w: 90, size: 2.8, align: 'center', bold: true }),
      el({ id: 'foot', type: 'band', x: 0, y: 97.5, w: 100, h: 2.5, size: 0, color: 'group' }),
    ],
  },
  {
    id: 'minimal',
    label: 'Schlicht (QR-Code und Nummer)',
    orientation: 'landscape',
    elements: () => [
      el({ id: 'side', type: 'band', x: 0, y: 0, w: 5, h: 100, size: 0, color: 'group' }),
      el({ id: 'number', type: 'text', text: '{karte}', x: 10, y: 30, w: 50, size: 15, bold: true }),
      el({ id: 'group', type: 'text', text: '{gruppe}', x: 10, y: 52, w: 50, size: 5.5, color: 'group', bold: true }),
      el({ id: 'qr', type: 'qr', x: 63, y: 18, w: 32, size: 0 }),
    ],
  },
];

/** Vorschlag für eine neue Rückseite: Hinweis bei Fund, Organisation, Kartennummer. */
export function defaultBackSide(): CardSide {
  return {
    background: { color: '#ffffff' },
    elements: [
      el({ id: 'back-head', type: 'band', x: 0, y: 0, w: 100, h: 8, size: 0, color: 'group' }),
      el({ id: 'back-org', type: 'text', text: '{organisation}', x: 6, y: 16, w: 88, size: 6, bold: true, align: 'center' }),
      el({
        id: 'back-note',
        type: 'text',
        text: 'Diese Karte ist persönlich und nicht übertragbar.\nBei Fund bitte zurückgeben.',
        x: 8,
        y: 38,
        w: 84,
        size: 4.2,
        align: 'center',
      }),
      el({ id: 'back-number', type: 'text', text: 'Karte {karte}', x: 6, y: 82, w: 88, size: 4, align: 'center', bold: true }),
    ],
  };
}

/** Bausteine für „Hinzufügen“: vorbereitete Elemente statt Platzhalter-Kürzel. */
export const CARD_PRESETS: { id: string; label: string; hint: string; make: (id: string, size: CardSize) => CardElement }[] = [
  {
    id: 'name',
    label: 'Name',
    hint: 'Dienstgrad, Vor- und Nachname',
    make: (id) =>
      el({ id, type: 'text', text: '{dienstgrad} {vorname} {nachname}', x: 5, y: 45, w: 90, size: 6, bold: true, align: 'center', showWhen: 'holder' }),
  },
  {
    id: 'rank',
    label: 'Dienstgrad',
    hint: 'verschwindet ohne Dienstgrad',
    make: (id) => el({ id, type: 'text', text: '{dienstgrad}', x: 5, y: 38, w: 90, size: 4.2, align: 'center', showWhen: 'holder', hideIfEmpty: true }),
  },
  {
    id: 'company',
    label: 'Einheit/Abteilung',
    hint: 'aus den Personendaten',
    make: (id) => el({ id, type: 'text', text: '{einheit}', x: 5, y: 55, w: 90, size: 4.2, align: 'center', showWhen: 'holder', hideIfEmpty: true }),
  },
  {
    id: 'position',
    label: 'Stellung/Posten',
    hint: 'z. B. Kompaniechef, S4',
    make: (id) => el({ id, type: 'text', text: '{posten}', x: 5, y: 61, w: 90, size: 4, align: 'center', showWhen: 'holder', hideIfEmpty: true }),
  },
  {
    id: 'room',
    label: 'Raum',
    hint: 'verschwindet ohne Raum',
    make: (id) => el({ id, type: 'text', text: 'Raum {raum}', x: 5, y: 67, w: 90, size: 4, align: 'center', showWhen: 'holder', hideIfEmpty: true }),
  },
  { id: 'number', label: 'Kartennummer', hint: 'z. B. B-004', make: (id) => el({ id, type: 'text', text: '{karte}', x: 5, y: 85, w: 40, size: 4.5, bold: true }) },
  { id: 'group', label: 'Gruppe', hint: 'z. B. Besucher', make: (id) => el({ id, type: 'text', text: '{gruppe}', x: 5, y: 5, w: 60, size: 5, bold: true, color: 'group' }) },
  {
    id: 'valid',
    label: 'Gültig bis',
    hint: 'verschwindet ohne Datum',
    make: (id) => el({ id, type: 'text', text: 'gültig bis {gueltig_bis}', x: 5, y: 75, w: 60, size: 4, hideIfEmpty: true }),
  },
  { id: 'org', label: 'Organisation', hint: 'Name aus den Einstellungen', make: (id) => el({ id, type: 'text', text: '{organisation}', x: 5, y: 5, w: 90, size: 4.5, bold: true }) },
  { id: 'text', label: 'Freier Text', hint: 'z. B. „Bitte sichtbar tragen“', make: (id) => el({ id, type: 'text', text: 'Text', x: 5, y: 65, w: 90, size: 4.5 }) },
  { id: 'qr', label: 'QR-Code', hint: `mindestens 18 mm`, make: (id, size) => newCardElement('qr', id, size) },
  { id: 'photo', label: 'Foto', hint: 'nur bei Gruppen mit Namensdruck', make: (id, size) => newCardElement('photo', id, size) },
  { id: 'logo', label: 'Logo', hint: 'Bild unter „Design“', make: (id, size) => newCardElement('logo', id, size) },
  { id: 'band', label: 'Farbfläche', hint: 'Streifen, Rahmen', make: (id, size) => newCardElement('band', id, size) },
];

export const STANDARD_CARD_LAYOUT: CardLayout = {
  id: STANDARD_CARD_LAYOUT_ID,
  name: 'Standard',
  builtIn: true,
  orientation: 'landscape',
  background: { color: '#ffffff' },
  textColor: '#0f172a',
  elements: CARD_TEMPLATES[0]!.elements(),
  createdAt: 0,
  updatedAt: 0,
};

export const CARD_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: '{dienstgrad}', label: 'Dienstgrad' },
  { key: '{vorname}', label: 'Vorname' },
  { key: '{nachname}', label: 'Nachname' },
  { key: '{name}', label: 'Vor- und Nachname' },
  { key: '{einheit}', label: 'Einheit/Abteilung' },
  { key: '{posten}', label: 'Stellung/Posten' },
  { key: '{raum}', label: 'Raum' },
  { key: '{karte}', label: 'Kartennummer' },
  { key: '{gruppe}', label: 'Gruppe' },
  { key: '{organisation}', label: 'Organisation' },
  { key: '{gueltig_ab}', label: 'gültig ab' },
  { key: '{gueltig_bis}', label: 'gültig bis' },
];


// ---------------------------------------------------------------------------
// Bearbeiten
// ---------------------------------------------------------------------------

const clamp = clampNum;
const round = (v: number) => Math.round(v * 10) / 10;

/** Kleinste Breite (in %) eines Elements – der QR-Code muss lesbar bleiben. */
export function minWidth(type: CardElementType, size: CardSize): number {
  return type === 'qr' ? Math.min(100, round((MIN_QR_MM / size.w) * 100 + 0.05)) : 3;
}

/** Höhe in % der Karte, soweit bekannt (Text und Logo hängen vom Inhalt ab). */
export function elementHeight(element: CardElement, size: CardSize): number | undefined {
  const ratio = size.w / size.h;
  if (element.type === 'band') return element.h ?? 6;
  if (element.type === 'qr') return element.w * ratio;
  if (element.type === 'photo') return element.w * ratio * (4 / 3);
  return undefined;
}

/** Element innerhalb der Karte halten (Position, Mindestgröße des QR-Codes). */
export function fitElement(element: CardElement, size: CardSize): CardElement {
  const w = round(clamp(element.w, minWidth(element.type, size), 100));
  const h = element.h === undefined ? undefined : round(clamp(element.h, 1, 100));
  const fitted = { ...element, w, h };
  const eh = Math.min(100, elementHeight(fitted, size) ?? 3);
  return { ...fitted, x: round(clamp(element.x, 0, 100 - w)), y: round(clamp(element.y, 0, 100 - eh)) };
}

export function moveCardElement(element: CardElement, x: number, y: number, size: CardSize): CardElement {
  return fitElement({ ...element, x, y }, size);
}


/**
 * Größe ändern: `dx`/`dy` = Bewegung seit Beginn des Ziehens in % der Karte. Die gegenüberliegende
 * Kante bleibt stehen. Text: Ecken skalieren Schrift und Breite, Seiten nur die Breite;
 * Farbfläche: Breite und Höhe frei; QR-Code/Foto/Logo: Seitenverhältnis bleibt.
 */
export function resizeCardElement(start: CardElement, handle: ResizeHandle, dx: number, dy: number, size: CardSize): CardElement {
  const east = handle.includes('e');
  const west = handle.includes('w');
  const north = handle.startsWith('n');
  const south = handle.startsWith('s');
  const rightEdge = start.x + start.w;
  let w = east ? start.w + dx : west ? start.w - dx : start.w;
  w = round(clamp(w, minWidth(start.type, size), east ? 100 - start.x : rightEdge));
  let next: CardElement = { ...start, w, x: west ? round(rightEdge - w) : start.x };
  if (start.type === 'text' && (north || south) && start.w > 0) {
    next.size = round(clamp(start.size * (w / start.w), 1, 40));
  }
  if (start.type === 'band') {
    const h0 = start.h ?? 6;
    let h = south ? h0 + dy : north ? h0 - dy : h0;
    h = round(clamp(h, 1, south ? 100 - start.y : start.y + h0));
    next = { ...next, h, y: north ? round(start.y + h0 - h) : start.y };
  } else if (north) {
    // Seitenverhältnis fest: untere Kante bleibt stehen
    const h0 = elementHeight(start, size);
    const h1 = elementHeight(next, size);
    if (h0 !== undefined && h1 !== undefined) next = { ...next, y: round(start.y + h0 - h1) };
  }
  return fitElement(next, size);
}


/**
 * Einrasten beim Verschieben: an der Kartenmitte und an Kanten/Mitten anderer Elemente
 * (Toleranz 1 mm). Liefert die neue Position und die anzuzeigenden Hilfslinien.
 */
export function snapCardElement(
  element: CardElement,
  x: number,
  y: number,
  others: CardElement[],
  size: CardSize,
): { x: number; y: number; guides: SnapGuides } {
  const tolX = (1 / size.w) * 100;
  const tolY = (1 / size.h) * 100;
  const eh = elementHeight(element, size);
  const linesX = [50];
  const linesY = [50];
  for (const o of others) {
    if (o.id === element.id) continue;
    linesX.push(o.x, o.x + o.w / 2, o.x + o.w);
    linesY.push(o.y);
    const oh = elementHeight(o, size);
    if (oh !== undefined) linesY.push(o.y + oh / 2, o.y + oh);
  }
  const best = (anchors: number[], lines: number[], tol: number) => {
    let found: { shift: number; line: number } | undefined;
    for (const a of anchors) {
      for (const l of lines) {
        const d = l - a;
        if (Math.abs(d) <= tol && (!found || Math.abs(d) < Math.abs(found.shift))) found = { shift: d, line: l };
      }
    }
    return found;
  };
  const sx = best([x, x + element.w / 2, x + element.w], linesX, tolX);
  const sy = best(eh === undefined ? [y] : [y, y + eh / 2, y + eh], linesY, tolY);
  const moved = fitElement({ ...element, x: x + (sx?.shift ?? 0), y: y + (sy?.shift ?? 0) }, size);
  return {
    x: moved.x,
    y: moved.y,
    guides: { x: sx ? [round(sx.line)] : [], y: sy ? [round(sy.line)] : [] },
  };
}

/** Neues Element an einer freien, gut sichtbaren Stelle. */
export function newCardElement(type: CardElementType, id: string, size: CardSize): CardElement {
  switch (type) {
    case 'text':
      return el({ id, type, text: 'Neuer Text', x: 5, y: 80, w: 60, size: 4.5 });
    case 'qr':
      return fitElement(el({ id, type, x: 60, y: 20, w: 35, size: 0 }), size);
    case 'photo':
      return fitElement(el({ id, type, x: 5, y: 20, w: size.h > size.w ? 40 : 24, size: 0, showWhen: 'holder' }), size);
    case 'logo':
      return el({ id, type, x: 5, y: 3, w: 25, size: 0 });
    case 'band':
      return el({ id, type, x: 0, y: 88, w: 100, h: 6, size: 0, color: 'group' });
  }
}

/** Platzhalter durch lesbare Namen ersetzen: „{vorname} {nachname}“ → „Vorname Nachname“. */
export function friendlyText(text: string): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => {
    const k = key.toLowerCase() === 'firma' ? 'einheit' : key.toLowerCase(); // {firma} = alter Name
    return CARD_PLACEHOLDERS.find((p) => p.key === `{${k}}`)?.label ?? m;
  });
}

/** Alle Elemente einer Seite an eine neue Kartengröße anpassen (QR-Mindestgröße, Ränder). */
export function fitSide(side: CardSide, size: CardSize): CardSide {
  return { ...side, elements: side.elements.map((e) => fitElement(e, size)) };
}

// ---------------------------------------------------------------------------
// Inhalte einer Karte
// ---------------------------------------------------------------------------

export interface CardData {
  number: string;
  groupName: string;
  groupColor: string;
  orgName: string;
  validFrom?: string;
  validUntil?: string;
  /** Nur, wenn Name/Foto gedruckt werden dürfen (Gruppenregel) und eine Person zugeordnet ist. */
  holder?: Pick<CardHolder, 'rank' | 'firstName' | 'lastName' | 'company' | 'position' | 'room' | 'photo'>;
}

const isoToDe = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

export function cardValues(data: CardData): Record<string, string> {
  const h = data.holder;
  return {
    dienstgrad: h?.rank ?? '',
    vorname: h?.firstName ?? '',
    nachname: h?.lastName ?? '',
    name: h ? `${h.firstName} ${h.lastName}`.trim() : '',
    einheit: h?.company ?? '',
    firma: h?.company ?? '', // alter Platzhalter (bis Version 0.16)
    posten: h?.position ?? '',
    raum: h?.room ?? '',
    karte: data.number,
    gruppe: data.groupName,
    organisation: data.orgName,
    gueltig_ab: isoToDe(data.validFrom),
    gueltig_bis: isoToDe(data.validUntil),
  };
}

/** Text eines Textfelds – oder null, wenn es ausgeblendet wird. */
export function cardText(element: CardElement, values: Record<string, string>): string | null {
  const template = element.text ?? '';
  let missing = false;
  const text = template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const k = key.toLowerCase();
    if (!(k in values)) return match;
    if (!values[k]) missing = true;
    return values[k] ?? '';
  });
  if (missing && element.hideIfEmpty) return null;
  // Trennzeichen am Anfang/Ende nur entfernen, wenn ein Platzhalter leer war („Max , “) –
  // sonst bleibt z. B. das Komma nach „{briefanrede},“ stehen.
  const collapsed = text.replace(/[ \t]{2,}/g, ' ');
  const cleaned = missing ? collapsed.replace(/^[\s·,]+|[\s·,]+$/g, '') : collapsed.trim();
  return cleaned || null;
}

export function isShownOnCard(element: CardElement, hasHolder: boolean): boolean {
  const when = element.showWhen ?? 'always';
  return when === 'always' || (when === 'holder' ? hasHolder : !hasHolder);
}

/** Farbe auflösen: 'group', 'on-group' oder eigene. */
export function resolveCardColor(color: CardColor | undefined, groupColor: string, onGroup: string, fallback: string): string {
  if (!color) return fallback;
  if (color === 'group') return groupColor;
  if (color === 'on-group') return onGroup;
  return color;
}

/** Welches Kartenlayout gilt? Gruppe vor Standard; gelöschte Layouts fallen zurück. */
export function pickCardLayout(layouts: CardLayout[], ids: { group?: string; fallback?: string }): CardLayout {
  const byId = new Map(layouts.map((l) => [l.id, l]));
  for (const id of [ids.group, ids.fallback]) {
    const found = id ? byId.get(id) : undefined;
    if (found) return found;
  }
  return byId.get(STANDARD_CARD_LAYOUT_ID) ?? STANDARD_CARD_LAYOUT;
}

export function copyCardLayout(source: CardLayout, id: string, name: string, now: number): CardLayout {
  return { ...structuredClone(source), id, name, builtIn: undefined, createdAt: now, updatedAt: now };
}

export function normalizeCardLayout(raw: Partial<CardLayout> & { id: string }): CardLayout {
  const format: CardFormat = raw.format === 'custom' || ALL_FORMATS.some((f) => f.id === raw.format) ? raw.format! : 'id1';
  const customSize =
    format === 'custom' && raw.customSize && Number.isFinite(raw.customSize.w) && Number.isFinite(raw.customSize.h)
      ? { w: raw.customSize.w, h: raw.customSize.h }
      : undefined;
  const orientation: CardOrientation = customSize ? (customSize.h >= customSize.w ? 'portrait' : 'landscape') : raw.orientation === 'portrait' ? 'portrait' : 'landscape';
  const base = { orientation, format: customSize ? format : format === 'custom' ? 'id1' : format, customSize };
  const size = cardSize(base);
  const fixElements = (list: unknown): CardElement[] | undefined =>
    Array.isArray(list) ? list.map((e) => fitElement(el(e as Spec), size)) : undefined;
  const back = raw.back && typeof raw.back === 'object'
    ? { background: { color: raw.back.background?.color || '#ffffff', image: raw.back.background?.image }, elements: fixElements(raw.back.elements) ?? [] }
    : undefined;
  return {
    ...STANDARD_CARD_LAYOUT,
    ...raw,
    ...base,
    builtIn: raw.id === STANDARD_CARD_LAYOUT_ID ? true : undefined,
    name: raw.name?.trim() || 'Kartenlayout',
    background: { color: raw.background?.color || '#ffffff', image: raw.background?.image },
    textColor: raw.textColor || '#0f172a',
    elements: fixElements(raw.elements) ?? STANDARD_CARD_LAYOUT.elements,
    back,
  };
}
