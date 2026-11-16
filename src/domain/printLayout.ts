/**
 * Seitenaufteilung für den Kartendruck – reine Berechnung in mm, ohne DOM.
 *
 * - A4-Bogen: Karten gleicher Größe im Raster, mittig auf der Seite (Hoch- oder Querformat,
 *   je nachdem, was mehr Karten fasst). Druckrand 8 mm, Abstand 4 mm (Platz für Schnittmarken).
 * - Beidseitig (Duplex): nach jeder Vorderseite eine Seite mit den Rückseiten – gespiegelt,
 *   damit jede Rückseite genau hinter ihrer Vorderseite liegt.
 * - Zum Falten: Rück- und Vorderseite nebeneinander (Rückseite links), in der Mitte falten.
 *   Karten ohne Rückseite werden dabei einzeln angeordnet.
 * - Kartendrucker: je Karte eine Seite in Kartengröße, bei Rückseite abwechselnd vorn/hinten.
 */
import type { CardFace, CardSize } from './cardLayout';

export type BackMode = 'none' | 'duplex' | 'fold';
/** Beidseitiger Druck: an der langen oder kurzen Papierkante wenden (Einstellung im Druckdialog). */
export type FlipEdge = 'long' | 'short';

export const A4 = { w: 210, h: 297 };
export const SHEET_MARGIN_MM = 8;
export const SHEET_GAP_MM = 4;

export interface PrintItem {
  key: string;
  size: CardSize;
  hasBack: boolean;
}

export interface PlacedCard {
  key: string;
  face: CardFace;
  /** Linke obere Ecke auf der Seite in mm. */
  x: number;
  y: number;
  size: CardSize;
  /** Rückseite fehlt – Platz bleibt frei (Duplex/Kartendrucker). */
  blank?: boolean;
}

export interface SheetPage {
  kind: 'sheet';
  orientation: 'portrait' | 'landscape';
  /** Seitengröße in mm. */
  width: number;
  height: number;
  side: 'front' | 'back' | 'fold';
  cards: PlacedCard[];
  /** Schnittkanten: ganze Karte bzw. beim Falten das Kartenpaar. */
  cuts: { x: number; y: number; w: number; h: number; foldX?: number }[];
}

export interface CardPrinterPage {
  kind: 'card';
  size: CardSize;
  card: PlacedCard;
}

/** Wie viele Einheiten passen auf eine Seite? */
function grid(unit: CardSize, page: { w: number; h: number }) {
  const usableW = page.w - 2 * SHEET_MARGIN_MM;
  const usableH = page.h - 2 * SHEET_MARGIN_MM;
  const cols = Math.max(0, Math.floor((usableW + SHEET_GAP_MM) / (unit.w + SHEET_GAP_MM)));
  const rows = Math.max(0, Math.floor((usableH + SHEET_GAP_MM) / (unit.h + SHEET_GAP_MM)));
  return { cols, rows, count: cols * rows };
}

/** Beste Seitenausrichtung für eine Kartengröße (mehr Karten je Seite; bei Gleichstand hoch). */
export function sheetGrid(size: CardSize, backMode: BackMode) {
  const unit = backMode === 'fold' ? { w: size.w * 2, h: size.h } : size;
  const portrait = grid(unit, A4);
  const landscape = grid(unit, { w: A4.h, h: A4.w });
  return landscape.count > portrait.count
    ? { ...landscape, unit, orientation: 'landscape' as const, page: { w: A4.h, h: A4.w } }
    : { ...portrait, unit, orientation: 'portrait' as const, page: A4 };
}

const sizeKey = (s: CardSize) => `${s.w}x${s.h}`;
/** Seiten-Gruppe: gleiche Größe und – beim Falten – mit bzw. ohne Rückseite. */
const groupKey = (item: PrintItem, backMode: BackMode) => `${sizeKey(item.size)}${backMode === 'fold' && item.hasBack ? ':paar' : ''}`;

/**
 * A4-Bögen. Karten unterschiedlicher Größe kommen auf getrennte Seiten (Reihenfolge der
 * ersten Karte je Größe bleibt erhalten). Liefert `oversize`, wenn eine Größe nicht auf A4 passt.
 */
export function layoutSheets(items: PrintItem[], backMode: BackMode, flip: FlipEdge = 'long'): { pages: SheetPage[]; oversize: string[] } {
  const groups = new Map<string, PrintItem[]>();
  for (const item of items) groups.set(groupKey(item, backMode), [...(groups.get(groupKey(item, backMode)) ?? []), item]);
  const pages: SheetPage[] = [];
  const oversize: string[] = [];
  for (const group of groups.values()) {
    const size = group[0]!.size;
    // Falten nur für Karten mit Rückseite; die übrigen einzeln wie beim einfachen Bogen
    const mode: BackMode = backMode === 'fold' && !group[0]!.hasBack ? 'none' : backMode;
    const g = sheetGrid(size, mode);
    if (g.count === 0) {
      oversize.push(...group.map((i) => i.key));
      continue;
    }
    const gridW = g.cols * g.unit.w + (g.cols - 1) * SHEET_GAP_MM;
    const gridH = g.rows * g.unit.h + (g.rows - 1) * SHEET_GAP_MM;
    const left = (g.page.w - gridW) / 2;
    const top = (g.page.h - gridH) / 2;
    const cell = (col: number, row: number) => ({ x: left + col * (g.unit.w + SHEET_GAP_MM), y: top + row * (g.unit.h + SHEET_GAP_MM) });
    // Duplex: Wendeachse senkrecht (Spalten spiegeln) bei Hochformat + lange Kante bzw. Querformat + kurze Kante
    const mirrorCols = (g.orientation === 'portrait') === (flip === 'long');
    const base = { kind: 'sheet' as const, orientation: g.orientation, width: g.page.w, height: g.page.h };

    for (let start = 0; start < group.length; start += g.count) {
      const chunk = group.slice(start, start + g.count);
      const front: SheetPage = { ...base, side: mode === 'fold' ? 'fold' : 'front', cards: [], cuts: [] };
      const back: SheetPage = { ...base, side: 'back', cards: [], cuts: [] };
      chunk.forEach((item, i) => {
        const col = i % g.cols;
        const row = Math.floor(i / g.cols);
        const { x, y } = cell(col, row);
        if (mode === 'fold') {
          front.cards.push({ key: item.key, face: 'back', x, y, size, blank: !item.hasBack });
          front.cards.push({ key: item.key, face: 'front', x: x + size.w, y, size });
          front.cuts.push({ x, y, w: size.w * 2, h: size.h, foldX: x + size.w });
          return;
        }
        front.cards.push({ key: item.key, face: 'front', x, y, size });
        front.cuts.push({ x, y, w: size.w, h: size.h });
        if (mode === 'duplex') {
          const mirrored = mirrorCols ? cell(g.cols - 1 - col, row) : cell(col, g.rows - 1 - row);
          back.cards.push({ key: item.key, face: 'back', ...mirrored, size, blank: !item.hasBack });
        }
      });
      pages.push(front);
      if (mode === 'duplex') pages.push(back);
    }
  }
  return { pages, oversize };
}

/** Kartendrucker: je Karte eine Seite in Kartengröße; mit Rückseite abwechselnd vorn/hinten. */
export function layoutCardPrinter(items: PrintItem[], withBack: boolean): CardPrinterPage[] {
  return items.flatMap((item) => {
    const front: CardPrinterPage = { kind: 'card', size: item.size, card: { key: item.key, face: 'front', x: 0, y: 0, size: item.size } };
    if (!withBack) return [front];
    return [front, { kind: 'card', size: item.size, card: { key: item.key, face: 'back', x: 0, y: 0, size: item.size, blank: !item.hasBack } }];
  });
}

/** Name der benannten CSS-Seite für eine Größe, z. B. „seite-85_6x54“. */
export function pageName(size: CardSize): string {
  return `seite-${sizeKey(size).replace(/\./g, '_')}`;
}
