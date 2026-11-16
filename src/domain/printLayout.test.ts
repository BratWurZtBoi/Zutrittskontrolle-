import { describe, expect, it } from 'vitest';
import { A4, SHEET_MARGIN_MM, layoutCardPrinter, layoutSheets, pageName, sheetGrid, type PrintItem } from './printLayout';

const QUER = { w: 85.6, h: 54 };
const HOCH = { w: 54, h: 85.6 };
const A7 = { w: 74, h: 105 };
const A6 = { w: 105, h: 148 };
const items = (n: number, size = QUER, hasBack = true): PrintItem[] => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, size, hasBack }));

describe('Raster auf A4', () => {
  it('wie viele Karten passen auf eine Seite', () => {
    expect(sheetGrid(QUER, 'none')).toMatchObject({ count: 9, orientation: 'landscape', cols: 3, rows: 3 });
    expect(sheetGrid(HOCH, 'none')).toMatchObject({ count: 9, orientation: 'portrait' });
    expect(sheetGrid(A7, 'none')).toMatchObject({ count: 4, orientation: 'portrait' });
    expect(sheetGrid(A6, 'none')).toMatchObject({ count: 2, orientation: 'landscape' });
    expect(sheetGrid(HOCH, 'fold')).toMatchObject({ count: 4, cols: 2, rows: 2, orientation: 'landscape' }); // Paare 108 × 85,6 mm
    expect(sheetGrid(A7, 'fold')).toMatchObject({ count: 2 });
  });

  it('alle Karten liegen innerhalb des Druckrands', () => {
    for (const size of [QUER, HOCH, A7, A6]) {
      const page = layoutSheets(items(9, size), 'none').pages[0]!;
      for (const c of page.cards) {
        expect(c.x).toBeGreaterThanOrEqual(SHEET_MARGIN_MM - 0.01);
        expect(c.y).toBeGreaterThanOrEqual(SHEET_MARGIN_MM - 0.01);
        expect(c.x + c.size.w).toBeLessThanOrEqual(page.width - SHEET_MARGIN_MM + 0.01);
        expect(c.y + c.size.h).toBeLessThanOrEqual(page.height - SHEET_MARGIN_MM + 0.01);
      }
    }
  });

  it('teilt auf Seiten auf und trennt verschiedene Größen', () => {
    const { pages } = layoutSheets([...items(10), ...items(2, A7).map((i) => ({ ...i, key: `a7-${i.key}` }))], 'none');
    expect(pages.map((p) => p.cards.length)).toEqual([9, 1, 2]);
    expect(pages[2]!.cards[0]!.size).toEqual(A7);
  });
});

describe('Rückseiten', () => {
  it('Duplex, lange Kante (Hochformat): Rückseiten spiegelverkehrt in den Spalten', () => {
    const { pages } = layoutSheets(items(3, HOCH), 'duplex', 'long');
    expect(pages[0]!.orientation).toBe('portrait');
    expect(pages.map((p) => p.side)).toEqual(['front', 'back']);
    const [front, back] = pages;
    const pos = (page: typeof front, key: string, face: string) => page!.cards.find((c) => c.key === key && c.face === face)!;
    // k0 vorn links oben → hinten rechts oben (dort, wo vorn k2 liegt), gleiche Zeile
    expect(pos(back, 'k0', 'back').x).toBeCloseTo(pos(front, 'k2', 'front').x);
    expect(pos(back, 'k0', 'back').y).toBeCloseTo(pos(front, 'k0', 'front').y);
    expect(pos(back, 'k1', 'back').x).toBeCloseTo(pos(front, 'k1', 'front').x); // Mitte bleibt Mitte
    // Spiegelachse ist die Seitenmitte
    expect(pos(back, 'k0', 'back').x + HOCH.w).toBeCloseTo(A4.w - pos(front, 'k0', 'front').x);
  });

  it('Duplex, kurze Kante (Hochformat): Zeilen gespiegelt', () => {
    const { pages } = layoutSheets(items(1, HOCH), 'duplex', 'short');
    const front = pages[0]!.cards[0]!;
    const back = pages[1]!.cards[0]!;
    expect(back.x).toBeCloseTo(front.x);
    expect(back.y + HOCH.h).toBeCloseTo(A4.h - front.y);
    // Querformat-Seite (Scheckkarte quer): lange Kante = waagerechte Achse → Zeilen gespiegelt
    const quer = layoutSheets(items(1), 'duplex', 'long').pages;
    expect(quer[0]!.orientation).toBe('landscape');
    expect(quer[1]!.cards[0]!.y + QUER.h).toBeCloseTo(quer[0]!.height - quer[0]!.cards[0]!.y);
  });

  it('Duplex ohne Rückseite: Platz bleibt frei, Reihenfolge stimmt', () => {
    const { pages } = layoutSheets(items(2, QUER, false), 'duplex');
    expect(pages[1]!.cards.every((c) => c.blank)).toBe(true);
  });

  it('Zum Falten: Rückseite links, Vorderseite rechts, Falzlinie dazwischen', () => {
    const { pages } = layoutSheets(items(1, HOCH), 'fold');
    expect(pages).toHaveLength(1);
    const [back, front] = pages[0]!.cards;
    expect(back).toMatchObject({ face: 'back' });
    expect(front!.x).toBeCloseTo(back!.x + HOCH.w);
    expect(pages[0]!.cuts[0]).toMatchObject({ w: HOCH.w * 2, foldX: front!.x });
  });

  it('Zum Falten: Karten ohne Rückseite einzeln (keine halbleeren Paare)', () => {
    const { pages } = layoutSheets([...items(2, QUER, false), ...items(1, QUER, true).map((i) => ({ ...i, key: 'mit' }))], 'fold');
    expect(pages.map((p) => [p.side, p.cards.length])).toEqual([
      ['front', 2],
      ['fold', 2],
    ]);
  });

  it('meldet Größen, die nicht auf A4 passen', () => {
    const { pages, oversize } = layoutSheets(items(1, A6), 'fold'); // Paar 210 × 148 mm
    expect(pages.length + oversize.length).toBeGreaterThan(0);
    expect(oversize).toEqual(pages.length ? [] : ['k0']);
  });
});

describe('Kartendrucker', () => {
  it('je Karte eine Seite, mit Rückseite abwechselnd', () => {
    expect(layoutCardPrinter(items(2), false).map((p) => p.card.face)).toEqual(['front', 'front']);
    const duplex = layoutCardPrinter([...items(1), { key: 'ohne', size: QUER, hasBack: false }], true);
    expect(duplex.map((p) => `${p.card.key}:${p.card.face}${p.card.blank ? ':leer' : ''}`)).toEqual(['k0:front', 'k0:back', 'ohne:front', 'ohne:back:leer']);
    expect(pageName(QUER)).toBe('seite-85_6x54');
  });
});
