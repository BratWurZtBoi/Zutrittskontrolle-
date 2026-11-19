import { describe, expect, it } from 'vitest';
import { parseAppCode } from './cardCode';
import { scannedCardPayload } from './keyboardScan';
import {
  findHolderMatches,
  admissionTimes,
  clampCompanions,
  companionsText,
  admissionTimeline,
  decideGuestEntry,
  filterGuests,
  guestListName,
  guestName,
  occasionStats,
  sortGuestsByName,
} from './occasion';

const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const now = new Date(2026, 11, 12, 18, 0);

describe('Einladungs-Code', () => {
  it('Ausweis und Einladung werden unterschieden', () => {
    expect(parseAppCode(`ZK1:${TOKEN}`)).toEqual({ kind: 'card', token: TOKEN });
    expect(parseAppCode(`ZE1:${TOKEN}`)).toEqual({ kind: 'guest', token: TOKEN });
    expect(parseAppCode('https://example.com')).toBeNull();
  });

  it('USB-Scanner mit falschem Tastaturlayout: auch Einladungen werden korrigiert', () => {
    // US-Scanner an deutschem Rechner: Z↔Y, „:“ → „Ö“
    const raw = `YE1Ö${TOKEN.replace(/[YZ]/g, (c) => (c === 'Y' ? 'Z' : 'Y'))}`;
    expect(scannedCardPayload(raw)).toEqual({ payload: `ZE1:${TOKEN}`, layoutFixed: true });
    expect(scannedCardPayload(`ze1:${TOKEN.toLowerCase()}`).payload).toBe(`ZE1:${TOKEN}`);
  });
});

describe('Einlass: nur einmal', () => {
  const guest = { occasionId: 'o1', cancelled: false, admittedAt: undefined as number | undefined };
  const decide = (g: typeof guest | undefined, occasionId = 'o1') => decideGuestEntry({ guest: g, occasionId, now, cooldownMs: 30_000 });

  it('erster Scan: Einlass', () => {
    expect(decide(guest)).toMatchObject({ outcome: 'granted', direction: 'in' });
  });

  it('erneut kurz danach: Doppelscan (keine Abweisung), später: bereits eingelassen', () => {
    expect(decide({ ...guest, admittedAt: now.getTime() - 5_000 })).toMatchObject({ outcome: 'duplicate', secondsSinceLast: 5 });
    expect(decide({ ...guest, admittedAt: now.getTime() - 10 * 60_000 })).toMatchObject({ outcome: 'denied', reason: 'ALREADY_ADMITTED' });
  });

  it('storniert, andere Veranstaltung, unbekannt', () => {
    expect(decide({ ...guest, cancelled: true })).toMatchObject({ outcome: 'denied', reason: 'GUEST_CANCELLED' });
    expect(decide(guest, 'o2')).toMatchObject({ outcome: 'denied', reason: 'OTHER_OCCASION' });
    expect(decide(undefined)).toMatchObject({ outcome: 'denied', reason: 'UNKNOWN_GUEST' });
  });
});

describe('Kennzahlen und Listen', () => {
  const t = (min: number) => new Date(2026, 11, 12, 18, min).getTime();
  const guests = [
    { number: 1, category: 'VIP', admittedAt: t(2), person: { rank: 'Oberst', firstName: 'Max', lastName: 'Mustermann', company: 'Stab' } },
    { number: 2, category: 'VIP', person: { firstName: 'Erika', lastName: 'Musterfrau', email: 'erika@example.com' } },
    { number: 3, category: 'Presse', admittedAt: t(20), person: { firstName: 'Felix', lastName: 'Gast' } },
    { number: 4, cancelled: true, person: { firstName: 'Tom', lastName: 'Absage' } },
    { number: 5 },
  ];

  it('Eingeladen, eingelassen, offen, Quote, je Kategorie', () => {
    const s = occasionStats(guests);
    expect(s).toMatchObject({ invited: 4, admitted: 2, open: 2, cancelled: 1, rate: 50 });
    expect(s.perCategory).toEqual([
      { category: 'VIP', invited: 2, admitted: 1 },
      { category: 'Ohne Kategorie', invited: 1, admitted: 0 },
      { category: 'Presse', invited: 1, admitted: 1 },
    ]);
  });

  it('Begleitpersonen: es zählen Personen, mehr als angemeldet zählt mit, Zeitverlauf gewichtet', () => {
    const gs = [
      { companions: 2, admittedAt: t(1), companionsAdmitted: 1 }, // erwartet 3, da 2
      { companions: 1 }, // erwartet 2
      { companions: 0, admittedAt: t(2), companionsAdmitted: 2 }, // mehr als angemeldet: erwartet 3, da 3
      { companions: 3, cancelled: true },
    ];
    expect(occasionStats(gs)).toMatchObject({ invited: 8, admitted: 5, open: 3, cancelled: 1, admittedGuests: 2, admittedCompanions: 3, rate: 63 });
    expect(admissionTimes(gs)).toHaveLength(5);
    expect([companionsText(0), companionsText(1), companionsText(4)]).toEqual(['', 'eine Begleitperson', '4 Begleitpersonen']);
    expect([clampCompanions('12'), clampCompanions(-1), clampCompanions('x'), clampCompanions(2.7)]).toEqual([9, 0, 0, 2]);
  });

  it('Namen mit Dienstgrad, ohne Personendaten die Nummer', () => {
    expect(guestListName(guests[0]!)).toBe('Oberst Mustermann, Max');
    expect(guestName(guests[0]!.person)).toBe('Oberst Max Mustermann');
    expect(guestListName(guests[4]!)).toBe('Gast Nr. 5');
  });

  it('Suche (auch E-Mail und Nummer), Status, Kategorie, Sortierung', () => {
    const f = { query: '', status: 'all' as const, category: '' };
    expect(filterGuests(guests, { ...f, query: 'erika@' }).map((g) => g.number)).toEqual([2]);
    expect(filterGuests(guests, { ...f, status: 'open' }).map((g) => g.number)).toEqual([2, 5]);
    expect(filterGuests(guests, { ...f, status: 'cancelled' }).map((g) => g.number)).toEqual([4]);
    expect(filterGuests(guests, { ...f, category: 'VIP' }).map((g) => g.number)).toEqual([1, 2]);
    expect(sortGuestsByName(guests).map((g) => g.number)).toEqual([4, 3, 2, 1, 5]);
  });

  it('Zeitverlauf in 15-Minuten-Schritten, lückenlos', () => {
    expect(admissionTimeline([t(2), t(5), t(40)]).map((b) => b.count)).toEqual([2, 0, 1]);
    expect(admissionTimeline([])).toEqual([]);
  });
});

describe('Gast hinzufügen: vorhandene Personen erkennen', () => {
  const card = (id: string, firstName: string, lastName: string) => ({ card: { id, number: id, blocked: false, holder: { firstName, lastName } } });
  const all = [card('M-001', 'Max', 'Mustermann'), card('M-002', 'Erika', 'Musterfrau'), card('M-003', 'Jürgen', 'Müller'), { card: { id: 'B-001', number: 'B-001', blocked: false } }];

  it('Nachname ab 2 Zeichen, Vorname schränkt ein, Umlaute egal, exakte Treffer zuerst', () => {
    expect(findHolderMatches(all, { firstName: '', lastName: 'M' })).toEqual([]);
    expect(findHolderMatches(all, { firstName: '', lastName: 'must' }).map((c) => c.card.id)).toEqual(['M-002', 'M-001']);
    expect(findHolderMatches(all, { firstName: 'Ma', lastName: 'Must' }).map((c) => c.card.id)).toEqual(['M-001']);
    expect(findHolderMatches(all, { firstName: 'jurgen', lastName: '' }).map((c) => c.card.id)).toEqual([]);
    expect(findHolderMatches(all, { firstName: 'juergen', lastName: '' }).map((c) => c.card.id)).toEqual(['M-003']);
    expect(findHolderMatches(all, { firstName: '', lastName: 'Mueller' }).map((c) => c.card.id)).toEqual(['M-003']);
    expect(findHolderMatches([card('X', 'Max', 'Musterfrauenhaus'), card('Y', 'Max', 'Musterfrau')], { firstName: '', lastName: 'Musterfrau' }).map((c) => c.card.id)).toEqual(['Y', 'X']);
  });
});
