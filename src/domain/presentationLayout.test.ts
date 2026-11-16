import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_LAYOUTS,
  STANDARD_IDLE,
  STANDARD_LAYOUT,
  buildLayoutResult,
  copyLayout,
  fillPlaceholders,
  idleFromLegacy,
  idleText,
  isLegacyLayout,
  moveElement,
  newElement,
  normalizeLayout,
  pickLayout,
  type LayoutElement,
  type PresentationLayout,
  type ResultInput,
  SCREEN_PRESETS,
  friendlyScreenText,
  resizeElement,
  snapElement,
} from './presentationLayout';

const text = (id: string, t: string, extra: Partial<LayoutElement> = {}): LayoutElement => ({
  ...newElement('text', id),
  text: t,
  ...extra,
});

const vip: PresentationLayout = {
  ...copyLayout(STANDARD_LAYOUT, 'vip', 'VIP', 1),
  texts: { ...STANDARD_LAYOUT.texts, inTitle: 'Hallo {vorname}!' },
  elements: [
    text('title', '{titel}', { withIcon: true }),
    text('welcome', 'Schön, dass Sie da sind, {name} von {firma}.', { showOn: ['in'] }),
    text('message', '{meldung}'),
    newElement('photo', 'photo'),
    newElement('group', 'group'),
  ],
};
const visitor = copyLayout(STANDARD_LAYOUT, 'visitor', 'Besucher', 1);
const party = { ...copyLayout(STANDARD_IDLE, 'party', 'Betriebsfest', 1) };

const input: ResultInput = {
  tone: 'ok',
  kind: 'in',
  fallbackTitle: 'Hinweis',
  fallbackText: '',
  person: { firstName: 'Erika', lastName: 'Musterfrau', company: 'Vertrieb', photo: 'data:image/jpeg;base64,AA', groupName: 'Besucher', groupColor: '#ea580c' },
  at: new Date(2026, 10, 15, 9, 5).getTime(),
  orgName: 'Musterfirma',
};

describe('Layout auswählen', () => {
  it('Scan-Anzeige: Karte vor Gruppe vor Standard', () => {
    const all = [...BUILT_IN_LAYOUTS, vip, visitor, party];
    expect(pickLayout(all, { card: 'vip', group: 'visitor' }).id).toBe('vip');
    expect(pickLayout(all, { group: 'visitor' }).id).toBe('visitor');
    expect(pickLayout(all, { fallback: 'visitor' }).id).toBe('visitor');
    expect(pickLayout(all, {}).id).toBe('standard');
  });

  it('Ruhebildschirm und Scan-Anzeige sind getrennt', () => {
    const all = [...BUILT_IN_LAYOUTS, vip, party];
    expect(pickLayout(all, { fallback: 'party' }, 'idle').id).toBe('party');
    expect(pickLayout(all, { fallback: 'party' }, 'result').id).toBe('standard'); // Ruhebildschirm passt nicht
    expect(pickLayout(all, { fallback: 'vip' }, 'idle').id).toBe('standard-idle');
  });

  it('gelöschte Layouts fallen auf die nächste Ebene zurück', () => {
    expect(pickLayout([STANDARD_LAYOUT, visitor], { card: 'geloescht', group: 'visitor' }).id).toBe('visitor');
    expect(pickLayout([], { card: 'x' }).id).toBe('standard');
    expect(pickLayout([], {}, 'idle').id).toBe('standard-idle');
  });
});

describe('Platzhalter', () => {
  it('ersetzt Platzhalter, unbekannte bleiben stehen', () => {
    expect(fillPlaceholders('Hallo {vorname} {Nachname}, {unbekannt}', { vorname: 'Erika', nachname: 'Musterfrau' })).toBe(
      'Hallo Erika Musterfrau, {unbekannt}',
    );
  });

  it('leere Werte hinterlassen keine Lücken, Zeilenumbrüche bleiben', () => {
    expect(fillPlaceholders('Willkommen, {vorname}!', { vorname: '' })).toBe('Willkommen!');
    expect(fillPlaceholders('{grund} Bitte wenden Sie sich an den Empfang.', { grund: '' })).toBe('Bitte wenden Sie sich an den Empfang.');
    expect(fillPlaceholders('Zeile 1\n{firma}', { firma: 'Vertrieb' })).toBe('Zeile 1\nVertrieb');
  });

  it('Ruhebildschirm: Organisation, Uhrzeit, Datum', () => {
    expect(idleText('Willkommen bei {organisation} – {datum}', 'Musterfirma', new Date(2026, 10, 15, 9, 5))).toBe(
      'Willkommen bei Musterfirma – 15.11.2026',
    );
  });
});

describe('Scan-Anzeige für den Gästebildschirm', () => {
  it('füllt die Textfelder mit {titel}, {meldung} und Personendaten', () => {
    const r = buildLayoutResult(vip, input);
    expect(r.texts).toEqual({
      title: 'Hallo Erika!',
      welcome: 'Schön, dass Sie da sind, Erika Musterfrau von Vertrieb.',
      message: 'Eingang gebucht · 09:05 Uhr',
    });
    expect(r).toMatchObject({ layoutId: 'vip', kind: 'in', photo: input.person?.photo, groupName: 'Besucher' });
  });

  it('Elemente nur bei den gewählten Ergebnissen', () => {
    const out = buildLayoutResult(vip, { ...input, kind: 'out', tone: 'out' });
    expect(out.texts.welcome).toBeUndefined();
    expect(out.texts.title).toBe('Auf Wiedersehen');
    // Hinweis „Bereits erfasst“ zählt als „Bitte warten / Hinweis“ und nutzt die Vorgabetexte
    const dup = buildLayoutResult(vip, { ...input, kind: 'duplicate', tone: 'warn', fallbackTitle: 'Bereits erfasst', fallbackText: 'Scan ignoriert.' });
    expect(dup).toMatchObject({ kind: 'wait', texts: { title: 'Bereits erfasst', message: 'Scan ignoriert.' } });
  });

  it('Datenschutz: nur Vorname bzw. kein Name (auch bei den Foto-Initialen)', () => {
    const noPhoto = { ...input, person: { ...input.person, photo: undefined } };
    const first = buildLayoutResult({ ...vip, nameFormat: 'first' }, noPhoto);
    expect(first.texts.welcome).toBe('Schön, dass Sie da sind, Erika von Vertrieb.');
    expect(first.initials).toBe('E');
    const none = buildLayoutResult({ ...vip, nameFormat: 'none' }, noPhoto);
    expect(none.texts.title).toBe('Hallo!');
    expect(none.initials).toBeUndefined();
    expect(buildLayoutResult(vip, noPhoto).initials).toBe('EM');
  });

  it('sendet Foto und Gruppe nur, wenn das Layout sie zeigt', () => {
    const textOnly = { ...vip, elements: vip.elements.filter((e) => e.type === 'text') };
    const r = buildLayoutResult(textOnly, input);
    expect(r.photo).toBeUndefined();
    expect(r.groupName).toBeUndefined();
  });

  it('ohne Person: Kartennummer als Name, ohne Foto', () => {
    const anon = { ...input, person: { groupName: 'Besucher' }, cardLabel: 'Karte B-001' };
    const r = buildLayoutResult(copyLayout(STANDARD_LAYOUT, 's', 'S', 1), anon);
    expect(r.texts.name).toBe('Karte B-001');
    expect(r.photo).toBeUndefined();
    expect(r.initials).toBeUndefined();
  });

  it('Ablehnung mit Grund, verborgener Grund ohne Lücke', () => {
    const deny = { ...input, tone: 'deny' as const, kind: 'deny' as const, person: undefined };
    expect(buildLayoutResult(visitor, { ...deny, reason: 'Diese Karte ist gesperrt.' }).texts.message).toBe(
      'Diese Karte ist gesperrt. Bitte wenden Sie sich an den Empfang.',
    );
    expect(buildLayoutResult(visitor, deny).texts.message).toBe('Bitte wenden Sie sich an den Empfang.');
  });
});

describe('Elemente bearbeiten', () => {
  it('Verschieben bleibt auf dem Bildschirm', () => {
    const e = newElement('text', 'a'); // Breite 80 %
    expect(moveElement(e, 70, 120)).toMatchObject({ x: 20, y: 97 });
    expect(moveElement(e, -5, -5)).toMatchObject({ x: 0, y: 0 });
    expect(moveElement(e, 12.345, 50)).toMatchObject({ x: 12.3, y: 50 });
  });

  it('Kopie ist kein mitgeliefertes Layout und tief kopiert', () => {
    const c = copyLayout(STANDARD_LAYOUT, 'neu', 'Mein Layout', 5);
    expect(c).toMatchObject({ id: 'neu', name: 'Mein Layout', builtIn: undefined, createdAt: 5, kind: 'result' });
    c.elements[0]!.x = 99;
    expect(STANDARD_LAYOUT.elements[0]!.x).not.toBe(99);
  });
});

describe('Layouts der Version 0.7 übernehmen', () => {
  const legacy = {
    id: 'alt',
    name: 'Empfang',
    arrangement: 'side' as const,
    show: { photo: true, group: false, company: true, clock: false, org: true },
    texts: { idleTitle: 'Willkommen bei uns', idleHint: 'Karte bitte scannen', inTitle: 'Hallo {vorname}!' },
    background: { kind: 'color' as const, color: '#7c3aed', color2: '#000000', dim: 0 },
    resultBackground: 'custom' as const,
  };

  it('wird zur Scan-Anzeige mit Elementen', () => {
    expect(isLegacyLayout(legacy)).toBe(true);
    const l = normalizeLayout(legacy as never);
    expect(l.kind).toBe('result');
    expect(l.elements.map((e) => e.id)).toEqual(['photo', 'title', 'name', 'message', 'company']); // ohne Gruppe, mit Firma
    expect(l.elements.find((e) => e.id === 'photo')?.x).toBeLessThan(20); // Foto links
    expect(l.texts.inTitle).toBe('Hallo {vorname}!');
    expect(l.resultBackground).toBe('custom');
    expect(isLegacyLayout(l)).toBe(false);
  });

  it('liefert den bisherigen Ruhebildschirm als eigenes Design', () => {
    const idle = idleFromLegacy(legacy as never, 'alt-ruhe', 9);
    expect(idle).toMatchObject({ id: 'alt-ruhe', kind: 'idle', name: 'Empfang (Ruhebildschirm)' });
    expect(idle.background.color).toBe('#7c3aed');
    const texts = idle.elements.filter((e) => e.type === 'text').map((e) => e.text);
    expect(texts).toEqual(['{organisation}', 'Willkommen bei uns', 'Karte bitte scannen']);
    expect(idle.elements.some((e) => e.type === 'clock')).toBe(false); // Uhr war ausgeschaltet
  });
});

describe('Editor: Bausteine, Anfasser, Einrasten', () => {
  it('Bausteine je Bildschirmart', () => {
    expect(SCREEN_PRESETS.idle.map((p) => p.id)).toContain('clock');
    expect(SCREEN_PRESETS.idle.map((p) => p.id)).not.toContain('photo'); // Ruhebildschirm ohne Personendaten
    const title = SCREEN_PRESETS.result.find((p) => p.id === 'title')!.make('t');
    expect(title).toMatchObject({ text: '{titel}', withIcon: true });
    expect(friendlyScreenText('Hallo {vorname}!')).toBe('Hallo Vorname!');
    expect(friendlyScreenText('{titel} – {meldung}')).toBe('Titel – Meldung');
  });

  it('Größe ändern: Ecke skaliert Text, Seite nur Breite, Foto behält die Unterkante', () => {
    const t = { ...newElement('text', 't'), x: 10, y: 10, w: 40, size: 5 };
    expect(resizeElement(t, 'se', 20, 0)).toMatchObject({ w: 60, size: 7.5 });
    expect(resizeElement(t, 'e', 20, 0)).toMatchObject({ w: 60, size: 5 });
    expect(resizeElement(t, 'w', 5, 0)).toMatchObject({ x: 15, w: 35 });
    const photo = { ...newElement('photo', 'p'), x: 40, y: 30, w: 12 };
    const bigger = resizeElement(photo, 'nw', -3, 0);
    expect(bigger.w).toBe(15);
    const bottom = (e: typeof photo) => e.y + e.w * (16 / 9) * (4 / 3);
    expect(bottom(bigger)).toBeCloseTo(bottom(photo), 0);
  });

  it('rastet an der Mitte ein', () => {
    const t = { ...newElement('text', 't'), w: 40 };
    const r = snapElement(t, 30.4, 20, []);
    expect(r).toMatchObject({ x: 30, guides: { x: [50], y: [] } });
    expect(snapElement(t, 20, 20, []).guides.x).toEqual([]);
  });
});
