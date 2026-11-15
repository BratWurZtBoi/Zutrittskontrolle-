/**
 * Gedruckte Karten (Scheckkartenformat 85,6 × 54 mm): frei gestaltbare Layouts aus
 * positionierten Elementen – Text mit Platzhaltern, QR-Code, Foto, Logo, Farbfläche.
 * Reine Funktionen ohne DOM/DB – gut testbar.
 */

export type CardOrientation = 'landscape' | 'portrait';
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

export interface CardLayout {
  id: string;
  name: string;
  /** Mitgeliefert – nicht änderbar, nur kopierbar. */
  builtIn?: boolean;
  orientation: CardOrientation;
  /** Hintergrundfarbe (#rrggbb oder 'group') und optional ein Bild. */
  background: { color: CardColor; image?: string };
  /** Standard-Schriftfarbe. */
  textColor: string;
  /** Logo als Data-URL (für Logo-Elemente). */
  logo?: string;
  elements: CardElement[];
  createdAt: number;
  updatedAt: number;
}

export const STANDARD_CARD_LAYOUT_ID = 'standard-karte';
export const CARD_MM: Record<CardOrientation, { w: number; h: number }> = {
  landscape: { w: 85.6, h: 54 },
  portrait: { w: 54, h: 85.6 },
};
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
      el({ id: 'first', type: 'text', text: '{vorname}', x: 31, y: 23, w: 34, size: 5.9, showWhen: 'holder' }),
      el({ id: 'last', type: 'text', text: '{nachname}', x: 31, y: 31, w: 34, size: 7, bold: true, showWhen: 'holder' }),
      el({ id: 'company', type: 'text', text: '{firma}', x: 31, y: 46, w: 34, size: 4.8, showWhen: 'holder', hideIfEmpty: true }),
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
      el({ id: 'name', type: 'text', text: '{vorname} {nachname}', x: 5, y: 47, w: 90, size: 4.6, bold: true, align: 'center', showWhen: 'holder' }),
      el({ id: 'company', type: 'text', text: '{firma}', x: 5, y: 53.5, w: 90, size: 3.2, align: 'center', showWhen: 'holder', hideIfEmpty: true }),
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
  { key: '{vorname}', label: 'Vorname' },
  { key: '{nachname}', label: 'Nachname' },
  { key: '{name}', label: 'Vor- und Nachname' },
  { key: '{firma}', label: 'Firma / Abteilung' },
  { key: '{karte}', label: 'Kartennummer' },
  { key: '{gruppe}', label: 'Gruppe' },
  { key: '{organisation}', label: 'Organisation' },
  { key: '{gueltig_ab}', label: 'gültig ab' },
  { key: '{gueltig_bis}', label: 'gültig bis' },
];

export const CARD_ELEMENT_TYPES: { type: CardElementType; label: string }[] = [
  { type: 'text', label: 'Textfeld' },
  { type: 'qr', label: 'QR-Code' },
  { type: 'photo', label: 'Foto' },
  { type: 'logo', label: 'Logo' },
  { type: 'band', label: 'Farbfläche' },
];

// ---------------------------------------------------------------------------
// Bearbeiten
// ---------------------------------------------------------------------------

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 10) / 10;

/** Kleinste Breite (in %) eines Elements – der QR-Code muss lesbar bleiben. */
export function minWidth(type: CardElementType, orientation: CardOrientation): number {
  return type === 'qr' ? round((MIN_QR_MM / CARD_MM[orientation].w) * 100 + 0.05) : 3;
}

/** Element innerhalb der Karte halten (Position, Mindestgröße des QR-Codes). */
export function fitElement(element: CardElement, orientation: CardOrientation): CardElement {
  const w = round(clamp(element.w, minWidth(element.type, orientation), 100));
  const h = element.h === undefined ? undefined : round(clamp(element.h, 1, 100));
  return { ...element, w, h, x: round(clamp(element.x, 0, 100 - w)), y: round(clamp(element.y, 0, 100 - (h ?? 3))) };
}

export function moveCardElement(element: CardElement, x: number, y: number, orientation: CardOrientation): CardElement {
  return fitElement({ ...element, x, y }, orientation);
}

/** Neues Element an einer freien, gut sichtbaren Stelle. */
export function newCardElement(type: CardElementType, id: string, orientation: CardOrientation): CardElement {
  switch (type) {
    case 'text':
      return el({ id, type, text: 'Neuer Text', x: 5, y: 80, w: 60, size: 4.5 });
    case 'qr':
      return fitElement(el({ id, type, x: 60, y: 20, w: 35, size: 0 }), orientation);
    case 'photo':
      return el({ id, type, x: 5, y: 20, w: orientation === 'portrait' ? 40 : 24, size: 0, showWhen: 'holder' });
    case 'logo':
      return el({ id, type, x: 5, y: 3, w: 25, size: 0 });
    case 'band':
      return el({ id, type, x: 0, y: 88, w: 100, h: 6, size: 0, color: 'group' });
  }
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
  holder?: { firstName: string; lastName: string; company?: string; photo?: string };
}

const isoToDe = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

export function cardValues(data: CardData): Record<string, string> {
  const h = data.holder;
  return {
    vorname: h?.firstName ?? '',
    nachname: h?.lastName ?? '',
    name: h ? `${h.firstName} ${h.lastName}`.trim() : '',
    firma: h?.company ?? '',
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
  const cleaned = text.replace(/[ \t]{2,}/g, ' ').replace(/^[\s·,]+|[\s·,]+$/g, '');
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
  const orientation: CardOrientation = raw.orientation === 'portrait' ? 'portrait' : 'landscape';
  return {
    ...STANDARD_CARD_LAYOUT,
    ...raw,
    builtIn: raw.id === STANDARD_CARD_LAYOUT_ID ? true : undefined,
    name: raw.name?.trim() || 'Kartenlayout',
    orientation,
    background: { color: raw.background?.color || '#ffffff', image: raw.background?.image },
    textColor: raw.textColor || '#0f172a',
    elements: Array.isArray(raw.elements) ? raw.elements.map((e) => fitElement(el(e as Spec), orientation)) : STANDARD_CARD_LAYOUT.elements,
  };
}
