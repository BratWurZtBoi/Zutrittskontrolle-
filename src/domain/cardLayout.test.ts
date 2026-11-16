import { describe, expect, it } from 'vitest';
import {
  CARD_PRESETS,
  CARD_TEMPLATES,
  STANDARD_CARD_LAYOUT,
  cardSize,
  cardText,
  defaultBackSide,
  formatLabel,
  friendlyText,
  resizeCardElement,
  sideOf,
  snapCardElement,
  withSide,
  cardValues,
  copyCardLayout,
  fitElement,
  isShownOnCard,
  minWidth,
  newCardElement,
  normalizeCardLayout,
  pickCardLayout,
  resolveCardColor,
  type CardData,
  type CardSize,
} from './cardLayout';

const QUER: CardSize = { w: 85.6, h: 54 };
const HOCH: CardSize = { w: 54, h: 85.6 };

const data: CardData = {
  number: 'M-001',
  groupName: 'Bestandspersonal',
  groupColor: '#2563eb',
  orgName: 'Musterfirma',
  validUntil: '2030-12-31',
  holder: { firstName: 'Max', lastName: 'Mustermann', company: 'Technik' },
};
const text = (t: string, extra = {}) => ({ ...newCardElement('text', 't', QUER), text: t, ...extra });

describe('Inhalte der Karte', () => {
  it('füllt Platzhalter', () => {
    const v = cardValues(data);
    expect(cardText(text('{vorname} {nachname}, {firma}'), v)).toBe('Max Mustermann, Technik');
    expect(cardText(text('Nr. {karte} · {gruppe}'), v)).toBe('Nr. M-001 · Bestandspersonal');
    expect(cardText(text('gültig bis {gueltig_bis}'), v)).toBe('gültig bis 31.12.2030');
  });

  it('„ausblenden, wenn leer“ – z. B. ohne Ablaufdatum', () => {
    const v = cardValues({ ...data, validUntil: undefined });
    expect(cardText(text('gültig bis {gueltig_bis}', { hideIfEmpty: true }), v)).toBeNull();
    expect(cardText(text('gültig bis {gueltig_bis}'), v)).toBe('gültig bis');
  });

  it('anonyme Karte (Besucher, ohne Namensdruck): keine Personendaten', () => {
    const v = cardValues({ ...data, holder: undefined });
    expect(cardText(text('{name}'), v)).toBeNull();
    expect(cardText(text('{karte}'), v)).toBe('M-001');
  });

  it('Elemente nur mit oder ohne Person', () => {
    expect(isShownOnCard(text('a', { showWhen: 'holder' }), true)).toBe(true);
    expect(isShownOnCard(text('a', { showWhen: 'holder' }), false)).toBe(false);
    expect(isShownOnCard(text('a', { showWhen: 'anonymous' }), false)).toBe(true);
    expect(isShownOnCard(text('a'), false)).toBe(true);
  });

  it('Farben: Gruppenfarbe, passend dazu oder eigene', () => {
    expect(resolveCardColor('group', '#2563eb', '#ffffff', '#000000')).toBe('#2563eb');
    expect(resolveCardColor('on-group', '#2563eb', '#ffffff', '#000000')).toBe('#ffffff');
    expect(resolveCardColor('#123456', '#2563eb', '#ffffff', '#000000')).toBe('#123456');
    expect(resolveCardColor(undefined, '#2563eb', '#ffffff', '#000000')).toBe('#000000');
  });
});

describe('Bearbeiten', () => {
  it('QR-Code bleibt mindestens 18 mm groß', () => {
    const qr = newCardElement('qr', 'q', QUER);
    expect(fitElement({ ...qr, w: 5 }, QUER).w).toBe(minWidth('qr', QUER));
    expect((minWidth('qr', QUER) / 100) * 85.6).toBeGreaterThanOrEqual(18);
    expect((minWidth('qr', HOCH) / 100) * 54).toBeGreaterThanOrEqual(18);
    const a6 = cardSize({ orientation: 'portrait', format: 'a6' });
    expect((minWidth('qr', a6) / 100) * a6.w).toBeGreaterThanOrEqual(18);
    expect(minWidth('qr', a6)).toBeLessThan(minWidth('qr', HOCH)); // größere Karte → kleinerer Anteil
  });

  it('Elemente bleiben auf der Karte', () => {
    const t = text('x'); // Breite 60 %
    expect(fitElement({ ...t, x: 80, y: 120 }, QUER)).toMatchObject({ x: 40, y: 97 });
    const band = newCardElement('band', 'b', QUER);
    expect(fitElement({ ...band, y: 99 }, QUER).y).toBe(94);
    // QR-Code ragt nicht unten heraus (Höhe aus dem Seitenverhältnis)
    const qr = newCardElement('qr', 'q', QUER);
    const fitted = fitElement({ ...qr, y: 90 }, QUER);
    expect(fitted.y + (fitted.w * 85.6) / 54).toBeLessThanOrEqual(100.1);
  });

  it('alle Vorlagen enthalten einen ausreichend großen QR-Code', () => {
    for (const t of CARD_TEMPLATES) {
      const qr = t.elements().find((e) => e.type === 'qr');
      expect(qr, t.id).toBeDefined();
      expect(qr!.w, t.id).toBeGreaterThanOrEqual(minWidth('qr', cardSize({ orientation: t.orientation })));
    }
  });
});

describe('Auswahl und Verwaltung', () => {
  it('Gruppe vor Standard, gelöschte fallen zurück', () => {
    const own = copyCardLayout(STANDARD_CARD_LAYOUT, 'hoch', 'Hoch', 1);
    expect(pickCardLayout([STANDARD_CARD_LAYOUT, own], { group: 'hoch' }).id).toBe('hoch');
    expect(pickCardLayout([STANDARD_CARD_LAYOUT, own], { group: 'weg', fallback: 'hoch' }).id).toBe('hoch');
    expect(pickCardLayout([], {}).id).toBe(STANDARD_CARD_LAYOUT.id);
  });

  it('Kopie ist tief kopiert, fehlende Felder werden ergänzt', () => {
    const c = copyCardLayout(STANDARD_CARD_LAYOUT, 'c', 'Kopie', 2);
    c.elements[0]!.x = 50;
    expect(STANDARD_CARD_LAYOUT.elements[0]!.x).toBe(0);
    const n = normalizeCardLayout({ id: 'x', name: ' Alt ', orientation: 'portrait' } as never);
    expect(n).toMatchObject({ name: 'Alt', orientation: 'portrait', textColor: '#0f172a' });
    expect(n.elements.length).toBeGreaterThan(0);
  });
});

describe('Formate und Rückseite', () => {
  it('liefert die Größe in mm je Format und Ausrichtung', () => {
    expect(cardSize({ orientation: 'landscape' })).toEqual(QUER); // ältere Layouts ohne Format
    expect(cardSize({ orientation: 'portrait', format: 'a7' })).toEqual({ w: 74, h: 105 });
    expect(cardSize({ orientation: 'landscape', format: 'a6' })).toEqual({ w: 148, h: 105 });
    expect(cardSize({ orientation: 'portrait', format: 'custom', customSize: { w: 60, h: 90 } })).toEqual({ w: 60, h: 90 });
    expect(cardSize({ orientation: 'portrait', format: 'custom', customSize: { w: 5, h: 999 } })).toEqual({ w: 30, h: 277 });
    expect(formatLabel({ orientation: 'portrait', format: 'a7' })).toBe('A7 hoch · 74 × 105 mm');
    expect(formatLabel({ orientation: 'landscape' })).toBe('Scheckkarte quer · 85,6 × 54 mm');
  });

  it('Vorder- und Rückseite getrennt bearbeiten', () => {
    const layout = copyCardLayout(STANDARD_CARD_LAYOUT, 'x', 'X', 1);
    expect(sideOf(layout, 'back').elements).toEqual([]);
    const withBack = withSide(layout, 'back', defaultBackSide());
    expect(withBack.back?.elements.some((e) => e.text?.includes('Bei Fund'))).toBe(true);
    expect(withBack.elements).toBe(layout.elements); // Vorderseite unverändert
    const front = withSide(withBack, 'front', { background: { color: 'group' }, elements: [] });
    expect(front.background.color).toBe('group');
    expect(front.back).toBe(withBack.back);
  });

  it('normalisiert Format, eigene Größe und Rückseite', () => {
    const n = normalizeCardLayout({ id: 'n', name: 'N', format: 'custom', customSize: { w: 100, h: 70 }, back: { background: {}, elements: [{ id: 'q', type: 'qr', x: 90, y: 0, w: 1, size: 0 }] } } as never);
    expect(n).toMatchObject({ format: 'custom', orientation: 'landscape', customSize: { w: 100, h: 70 } });
    expect(n.back?.background.color).toBe('#ffffff');
    expect(n.back!.elements[0]!.w).toBe(minWidth('qr', { w: 100, h: 70 }));
    expect(normalizeCardLayout({ id: 'o', name: 'O', format: 'custom' } as never).format).toBe('id1'); // ohne Maße
  });

  it('Bausteine erzeugen passende Elemente', () => {
    const name = CARD_PRESETS.find((p) => p.id === 'name')!.make('n', HOCH);
    expect(name).toMatchObject({ type: 'text', text: '{vorname} {nachname}', showWhen: 'holder' });
    expect(friendlyText(name.text!)).toBe('Vorname Nachname');
    expect(friendlyText('gültig bis {gueltig_bis}')).toBe('gültig bis gültig bis');
    const qr = CARD_PRESETS.find((p) => p.id === 'qr')!.make('q', HOCH);
    expect(qr.w).toBeGreaterThanOrEqual(minWidth('qr', HOCH));
  });
});

describe('Ziehen an den Anfassern und Einrasten', () => {
  it('Text: Ecke skaliert Schrift und Breite, Seite nur die Breite', () => {
    const t = { ...text('Name'), x: 10, y: 10, w: 40, size: 5 };
    const corner = resizeCardElement(t, 'se', 20, 5, QUER);
    expect(corner).toMatchObject({ x: 10, w: 60, size: 7.5 });
    const side = resizeCardElement(t, 'e', 20, 0, QUER);
    expect(side).toMatchObject({ w: 60, size: 5 });
    const left = resizeCardElement(t, 'w', -5, 0, QUER); // linke Kante nach links, rechte bleibt
    expect(left).toMatchObject({ x: 5, w: 45 });
  });

  it('QR-Code: bleibt quadratisch, nicht kleiner als 18 mm, untere Kante bleibt beim Ziehen oben', () => {
    const qr = { ...newCardElement('qr', 'q', QUER), x: 50, y: 30, w: 35 };
    expect(resizeCardElement(qr, 'se', -30, 0, QUER).w).toBe(minWidth('qr', QUER));
    const top = resizeCardElement(qr, 'nw', -5, 0, QUER);
    const bottom = (e: typeof qr) => e.y + (e.w * 85.6) / 54;
    expect(top.w).toBe(40);
    expect(bottom(top)).toBeCloseTo(bottom(qr), 0);
  });

  it('Farbfläche: Breite und Höhe frei', () => {
    const band = { ...newCardElement('band', 'b', QUER), x: 0, y: 50, w: 50, h: 10 };
    expect(resizeCardElement(band, 'se', 10, 5, QUER)).toMatchObject({ w: 60, h: 15, y: 50 });
    expect(resizeCardElement(band, 'nw', 0, -5, QUER)).toMatchObject({ h: 15, y: 45 });
  });

  it('rastet an der Kartenmitte und an anderen Elementen ein', () => {
    const t = { ...text('A'), w: 40 };
    const centered = snapCardElement(t, 30.5, 20, [], QUER); // Mitte bei 50,5 → 50
    expect(centered.x).toBe(30);
    expect(centered.guides.x).toEqual([50]);
    const other = { ...text('B'), id: 'o', x: 12, y: 70, w: 30 };
    const aligned = snapCardElement(t, 12.6, 40, [other], QUER);
    expect(aligned.x).toBe(12);
    expect(aligned.guides.x).toEqual([12]);
    const free = snapCardElement(t, 20, 40, [other], QUER);
    expect(free).toMatchObject({ x: 20, y: 40, guides: { x: [], y: [] } });
  });
});
