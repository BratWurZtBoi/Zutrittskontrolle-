import { describe, expect, it } from 'vitest';
import {
  CARD_TEMPLATES,
  STANDARD_CARD_LAYOUT,
  cardText,
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
} from './cardLayout';

const data: CardData = {
  number: 'M-001',
  groupName: 'Bestandspersonal',
  groupColor: '#2563eb',
  orgName: 'Musterfirma',
  validUntil: '2030-12-31',
  holder: { firstName: 'Max', lastName: 'Mustermann', company: 'Technik' },
};
const text = (t: string, extra = {}) => ({ ...newCardElement('text', 't', 'landscape'), text: t, ...extra });

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
    const qr = newCardElement('qr', 'q', 'landscape');
    expect(fitElement({ ...qr, w: 5 }, 'landscape').w).toBe(minWidth('qr', 'landscape'));
    expect((minWidth('qr', 'landscape') / 100) * 85.6).toBeGreaterThanOrEqual(18);
    expect((minWidth('qr', 'portrait') / 100) * 54).toBeGreaterThanOrEqual(18);
  });

  it('Elemente bleiben auf der Karte', () => {
    const t = text('x'); // Breite 60 %
    expect(fitElement({ ...t, x: 80, y: 120 }, 'landscape')).toMatchObject({ x: 40, y: 97 });
    const band = newCardElement('band', 'b', 'landscape');
    expect(fitElement({ ...band, y: 99 }, 'landscape').y).toBe(94);
  });

  it('alle Vorlagen enthalten einen ausreichend großen QR-Code', () => {
    for (const t of CARD_TEMPLATES) {
      const qr = t.elements().find((e) => e.type === 'qr');
      expect(qr, t.id).toBeDefined();
      expect(qr!.w, t.id).toBeGreaterThanOrEqual(minWidth('qr', t.orientation));
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
