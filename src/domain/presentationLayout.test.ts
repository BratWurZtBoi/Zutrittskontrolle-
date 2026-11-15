import { describe, expect, it } from 'vitest';
import {
  STANDARD_LAYOUT,
  buildLayoutResult,
  copyLayout,
  fillPlaceholders,
  idleTexts,
  normalizeLayout,
  pickLayout,
  type PresentationLayout,
  type ResultInput,
} from './presentationLayout';

const vip: PresentationLayout = {
  ...copyLayout(STANDARD_LAYOUT, 'vip', 'VIP', 1),
  texts: { ...STANDARD_LAYOUT.texts, inTitle: 'Hallo {vorname}!', inText: 'Schön, dass Sie da sind, {name} von {firma}.' },
};
const visitor = copyLayout(STANDARD_LAYOUT, 'visitor', 'Besucher', 1);

const input: ResultInput = {
  tone: 'ok',
  kind: 'in',
  fallbackTitle: 'Willkommen',
  fallbackText: '',
  person: { firstName: 'Erika', lastName: 'Musterfrau', company: 'Vertrieb', photo: 'data:image/jpeg;base64,AA', groupName: 'Besucher', groupColor: '#ea580c' },
  at: new Date(2026, 10, 15, 9, 5).getTime(),
  orgName: 'Musterfirma',
};

describe('Layout auswählen', () => {
  it('Karte vor Gruppe vor Standard', () => {
    const all = [STANDARD_LAYOUT, vip, visitor];
    expect(pickLayout(all, { card: 'vip', group: 'visitor' }).id).toBe('vip');
    expect(pickLayout(all, { group: 'visitor' }).id).toBe('visitor');
    expect(pickLayout(all, { fallback: 'visitor' }).id).toBe('visitor');
    expect(pickLayout(all, {}).id).toBe('standard');
  });

  it('gelöschte Layouts fallen auf die nächste Ebene zurück', () => {
    expect(pickLayout([STANDARD_LAYOUT, visitor], { card: 'geloescht', group: 'visitor' }).id).toBe('visitor');
    expect(pickLayout([], { card: 'x' }).id).toBe('standard');
  });
});

describe('Platzhalter', () => {
  it('ersetzt Platzhalter, unbekannte bleiben stehen', () => {
    expect(fillPlaceholders('Hallo {vorname} {Nachname}, {unbekannt}', { vorname: 'Erika', nachname: 'Musterfrau' })).toBe(
      'Hallo Erika Musterfrau, {unbekannt}',
    );
  });

  it('leere Werte hinterlassen keine Lücken', () => {
    expect(fillPlaceholders('Willkommen, {vorname}!', { vorname: '' })).toBe('Willkommen!');
    expect(fillPlaceholders('{grund} Bitte wenden Sie sich an den Empfang.', { grund: '' })).toBe('Bitte wenden Sie sich an den Empfang.');
    expect(fillPlaceholders('Hallo {name} von {firma}.', { name: 'Max', firma: '' })).toBe('Hallo Max von.');
  });
});

describe('Ergebnis für den Gästebildschirm', () => {
  it('füllt die Texte des Layouts', () => {
    const r = buildLayoutResult(vip, input);
    expect(r).toMatchObject({ layoutId: 'vip', title: 'Hallo Erika!', text: 'Schön, dass Sie da sind, Erika Musterfrau von Vertrieb.', name: 'Erika Musterfrau' });
    expect(buildLayoutResult(STANDARD_LAYOUT, input).text).toBe('Eingang gebucht · 09:05 Uhr');
  });

  it('Datenschutz: nur Vorname bzw. kein Name', () => {
    const first = buildLayoutResult({ ...vip, nameFormat: 'first' }, input);
    expect(first.name).toBe('Erika');
    expect(first.text).toBe('Schön, dass Sie da sind, Erika von Vertrieb.');
    const none = buildLayoutResult({ ...vip, nameFormat: 'none' }, input);
    expect(none.name).toBeUndefined();
    expect(none.title).toBe('Hallo!');
  });

  it('sendet nur, was das Layout anzeigt', () => {
    const r = buildLayoutResult({ ...visitor, show: { ...visitor.show, photo: false, group: false } }, input);
    expect(r.photo).toBeUndefined();
    expect(r.groupName).toBeUndefined();
    expect(buildLayoutResult(visitor, input).photo).toBe(input.person?.photo);
    // nur Text: weder Foto noch Gruppe
    const minimal = buildLayoutResult({ ...visitor, arrangement: 'minimal' }, input);
    expect(minimal.photo).toBeUndefined();
    expect(minimal.groupName).toBeUndefined();
  });

  it('ohne Person: Kartennummer, außer Namen sind ausgeblendet', () => {
    const anon = { ...input, person: { groupName: 'Besucher' }, cardLabel: 'Karte B-001' };
    expect(buildLayoutResult(visitor, anon).name).toBe('Karte B-001');
    expect(buildLayoutResult({ ...visitor, nameFormat: 'none' }, anon).name).toBeUndefined();
  });

  it('Ablehnung mit Grund, verborgener Grund ohne Lücke', () => {
    const deny = { ...input, tone: 'deny' as const, kind: 'deny' as const, person: undefined };
    expect(buildLayoutResult(visitor, { ...deny, reason: 'Diese Karte ist gesperrt.' }).text).toBe(
      'Diese Karte ist gesperrt. Bitte wenden Sie sich an den Empfang.',
    );
    expect(buildLayoutResult(visitor, deny).text).toBe('Bitte wenden Sie sich an den Empfang.');
  });

  it('Ruhebildschirm', () => {
    const l = { ...visitor, texts: { ...visitor.texts, idleTitle: 'Willkommen bei {organisation}' } };
    expect(idleTexts(l, 'Musterfirma', new Date()).title).toBe('Willkommen bei Musterfirma');
  });
});

describe('Layouts verwalten', () => {
  it('Kopie ist kein Standardlayout mehr', () => {
    const c = copyLayout(STANDARD_LAYOUT, 'neu', 'Mein Layout', 5);
    expect(c).toMatchObject({ id: 'neu', name: 'Mein Layout', builtIn: undefined, createdAt: 5 });
    c.texts.inTitle = 'geändert';
    expect(STANDARD_LAYOUT.texts.inTitle).toBe('Willkommen'); // tiefe Kopie
  });

  it('ergänzt fehlende Felder', () => {
    const l = normalizeLayout({ id: 'alt', name: ' Alt ', texts: { inTitle: 'Hi' } as never });
    expect(l.name).toBe('Alt');
    expect(l.texts.inTitle).toBe('Hi');
    expect(l.texts.outTitle).toBe('Auf Wiedersehen');
    expect(l.show.photo).toBe(true);
  });
});
