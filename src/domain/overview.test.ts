import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EVENT_FILTER,
  DEFAULT_STATUS_FILTER,
  buildStatusRows,
  countByGroupId,
  countPerGroup,
  filterEvents,
  holderFieldValues,
  holdersByCard,
  filterStatusRows,
  rangeBounds,
  sortEvents,
  sortStatusRows,
  splitTopGroups,
  summarizeEvents,
} from './overview';
import type { AccessEvent, Card, Group } from './types';

const staff = { id: 'g1', name: 'Bestandspersonal' } as Group;
const visitors = { id: 'g2', name: 'Besucher' } as Group;

function card(id: string, number: string, groupId: string, name?: [string, string], company?: string): Card {
  return {
    id,
    number,
    groupId,
    token: id,
    tokenIssuedAt: 0,
    blocked: false,
    accessGranted: true,
    createdAt: 0,
    updatedAt: 0,
    hasHolder: Boolean(name),
    holder: name ? { firstName: name[0], lastName: name[1], company } : undefined,
  };
}

const cards = [
  { card: card('a', 'M-001', 'g1', ['Max', 'Mustermann'], 'Technik'), group: staff },
  { card: card('b', 'M-002', 'g1', ['Erika', 'Musterfrau'], 'Vertrieb'), group: staff },
  { card: card('c', 'B-001', 'g2', ['Felix', 'Gast'], 'Beispiel GmbH'), group: visitors },
  { card: card('d', 'B-002', 'g2'), group: visitors },
];
const presence = [
  { cardId: 'a', status: 'in' as const, lastBookingAt: 3000 },
  { cardId: 'b', status: 'out' as const, lastBookingAt: 5000 },
];

describe('Statuszeilen', () => {
  const rows = buildStatusRows(cards, presence);

  it('verbindet Karten mit der Anwesenheit', () => {
    expect(rows.map((r) => [r.card.number, r.present, r.lastBookingAt])).toEqual([
      ['M-001', true, 3000],
      ['M-002', false, 5000],
      ['B-001', false, undefined],
      ['B-002', false, undefined],
    ]);
  });

  it('filtert nach Status, Gruppe, Suche und freien Karten', () => {
    const f = DEFAULT_STATUS_FILTER;
    expect(filterStatusRows(rows, f).map((r) => r.card.number)).toEqual(['M-001', 'M-002', 'B-001']);
    expect(filterStatusRows(rows, { ...f, includeFree: true }).length).toBe(4);
    expect(filterStatusRows(rows, { ...f, status: 'present' }).map((r) => r.card.number)).toEqual(['M-001']);
    expect(filterStatusRows(rows, { ...f, status: 'absent' }).map((r) => r.card.number)).toEqual(['M-002', 'B-001']);
    expect(filterStatusRows(rows, { ...f, groupId: 'g2' }).map((r) => r.card.number)).toEqual(['B-001']);
    expect(filterStatusRows(rows, { ...f, query: 'beispiel' }).map((r) => r.card.number)).toEqual(['B-001']);
    expect(filterStatusRows(rows, { ...f, query: 'm-002' }).map((r) => r.card.number)).toEqual(['M-002']);
  });

  it('sortiert nach Name (freie Karten ans Ende), Status und Zeit', () => {
    const all = filterStatusRows(rows, { ...DEFAULT_STATUS_FILTER, includeFree: true });
    expect(sortStatusRows(all, 'name', 'asc').map((r) => r.card.number)).toEqual(['B-001', 'M-002', 'M-001', 'B-002']);
    expect(sortStatusRows(all, 'status', 'asc')[0]?.card.number).toBe('M-001');
    expect(sortStatusRows(all, 'time', 'desc').map((r) => r.card.number).slice(0, 2)).toEqual(['M-002', 'M-001']);
    expect(sortStatusRows(all, 'card', 'asc').map((r) => r.card.number)).toEqual(['B-001', 'B-002', 'M-001', 'M-002']);
  });
});

describe('Aktionen', () => {
  const now = new Date(2026, 5, 15, 12, 0); // 15.06.2026 12:00
  const at = (day: number, hour: number) => new Date(2026, 5, day, hour).getTime();
  const ev = (timestamp: number, over: Partial<AccessEvent>): AccessEvent => ({
    timestamp,
    outcome: 'granted',
    reason: 'OK',
    source: 'camera',
    ...over,
  });
  const events = [
    ev(at(15, 8), { direction: 'in', cardNumber: 'M-001', holderName: 'Max Mustermann', groupId: 'g1', groupName: 'Bestandspersonal' }),
    ev(at(15, 9), { outcome: 'denied', reason: 'CARD_BLOCKED', direction: 'in', cardNumber: 'M-006', holderName: 'Paul Platzhalter', groupId: 'g1' }),
    ev(at(14, 17), { direction: 'out', cardNumber: 'B-001', holderName: 'Felix Gast', groupId: 'g2', groupName: 'Besucher' }),
    ev(at(1, 10), { direction: 'in', cardNumber: 'M-002', holderName: 'Erika Musterfrau', groupId: 'g1' }),
  ];

  it('berechnet Zeiträume mit lokalen Tagesgrenzen', () => {
    expect(rangeBounds({ range: 'today' }, now)).toEqual({ from: at(15, 0), to: at(16, 0) });
    expect(rangeBounds({ range: 'yesterday' }, now)).toEqual({ from: at(14, 0), to: at(15, 0) });
    expect(rangeBounds({ range: '7d' }, now).from).toBe(at(9, 0));
    expect(rangeBounds({ range: 'custom', from: '2026-06-01', to: '2026-06-01' }, now)).toEqual({ from: at(1, 0), to: at(2, 0) });
  });

  it('filtert nach Zeitraum, Ergebnis, Richtung, Gruppe und Suche', () => {
    const f = DEFAULT_EVENT_FILTER; // heute
    expect(filterEvents(events, f, now).map((e) => e.cardNumber)).toEqual(['M-001', 'M-006']);
    expect(filterEvents(events, { ...f, range: 'all' }, now).length).toBe(4);
    expect(filterEvents(events, { ...f, range: 'all', outcome: 'denied' }, now).map((e) => e.cardNumber)).toEqual(['M-006']);
    expect(filterEvents(events, { ...f, range: 'all', direction: 'out' }, now).map((e) => e.cardNumber)).toEqual(['B-001']);
    expect(filterEvents(events, { ...f, range: 'all', groupId: 'g2' }, now).length).toBe(1);
    expect(filterEvents(events, { ...f, range: 'all', query: 'muster' }, now).map((e) => e.cardNumber)).toEqual([
      'M-001',
      'M-002',
    ]);
  });

  it('sortiert nach Zeit und Name', () => {
    expect(sortEvents(events, 'time', 'desc').map((e) => e.cardNumber)).toEqual(['M-006', 'M-001', 'B-001', 'M-002']);
    expect(sortEvents(events, 'time', 'asc')[0]?.cardNumber).toBe('M-002');
    expect(sortEvents(events, 'name', 'asc').map((e) => e.holderName)).toEqual([
      'Erika Musterfrau',
      'Felix Gast',
      'Max Mustermann',
      'Paul Platzhalter',
    ]);
  });
});

describe('Kennzahlen', () => {
  it('zählt erfolgreiche und abgewiesene Aktionen', () => {
    expect(summarizeEvents([{ outcome: 'granted' }, { outcome: 'denied' }, { outcome: 'granted' }])).toEqual({ granted: 2, denied: 1 });
    expect(summarizeEvents([])).toEqual({ granted: 0, denied: 0 });
  });

  it('zählt je Gruppe in Gruppenreihenfolge und lässt leere Gruppen weg', () => {
    const third = { id: 'g3', name: 'Dienstleister' } as Group;
    expect(countPerGroup(['g2', 'g1', 'g2'], [staff, visitors, third])).toEqual([
      { group: staff, count: 1 },
      { group: visitors, count: 2 },
    ]);
  });

  it('Statusleiste: die größten Gruppen zuerst, der Rest gesammelt', () => {
    const list = [
      { id: 'a', count: 2 },
      { id: 'b', count: 9 },
      { id: 'c', count: 2 },
      { id: 'd', count: 5 },
      { id: 'e', count: 1 },
    ];
    const { shown, rest } = splitTopGroups(list, 3);
    expect(shown.map((g) => g.id)).toEqual(['b', 'd', 'a']); // Gleichstand a/c: Gruppenreihenfolge
    expect(rest.map((g) => g.id)).toEqual(['c', 'e']);
    expect(splitTopGroups(list.slice(0, 2), 3)).toEqual({ shown: [list[1], list[0]], rest: [] });
  });

  it('zählt je Gruppen-ID und überspringt fehlende', () => {
    expect([...countByGroupId(['g1', undefined, 'g2', 'g1'])]).toEqual([
      ['g1', 2],
      ['g2', 1],
    ]);
  });
});

describe('Dienstgrad, Einheit, Stellung/Posten, Raum', () => {
  const soldier = (id: string, number: string, holder: Partial<import('./types').CardHolder>) => ({
    card: { ...card(id, number, 'g1', ['Max', 'Muster']), holder: { firstName: 'Max', lastName: 'Muster', ...holder } },
    group: staff,
  });
  const people = [
    soldier('s1', 'M-101', { rank: 'Hptm', company: '1./Btl 1', position: 'Kompaniechef', room: '2.14' }),
    soldier('s2', 'M-102', { firstName: 'Anna', lastName: 'Beispiel', rank: 'OFw', company: 'Stab', position: 'S4', room: '1.03' }),
    soldier('s3', 'M-103', { firstName: 'Tom', lastName: 'Test', company: 'Stab', position: 'Admin' }),
  ];
  const rows = buildStatusRows(people, []);
  const f = { ...DEFAULT_STATUS_FILTER };

  it('Suche findet Dienstgrad, Einheit, Stellung/Posten und Raum', () => {
    const find = (query: string) => filterStatusRows(rows, { ...f, query }).map((r) => r.card.number);
    expect(find('hptm')).toEqual(['M-101']);
    expect(find('stab')).toEqual(['M-102', 'M-103']);
    expect(find('s4')).toEqual(['M-102']);
    expect(find('2.14')).toEqual(['M-101']);
  });

  it('Auswahlfilter nach genauem Wert, kombinierbar', () => {
    expect(filterStatusRows(rows, { ...f, unit: 'Stab' }).map((r) => r.card.number)).toEqual(['M-102', 'M-103']);
    expect(filterStatusRows(rows, { ...f, unit: 'Stab', position: 'Admin' }).map((r) => r.card.number)).toEqual(['M-103']);
    expect(filterStatusRows(rows, { ...f, room: '1.03' }).map((r) => r.card.number)).toEqual(['M-102']);
    expect(holderFieldValues(people.map((p) => p.card.holder), 'company')).toEqual(['1./Btl 1', 'Stab']);
    expect(holderFieldValues(people.map((p) => p.card.holder), 'rank')).toEqual(['Hptm', 'OFw']);
  });

  it('sortiert nach Raum, ohne Raum ans Ende', () => {
    expect(sortStatusRows(rows, 'room', 'asc').map((r) => r.card.number)).toEqual(['M-102', 'M-101', 'M-103']);
  });

  it('Protokoll: Suche/Filter über die aktuelle Person – nur wenn es noch dieselbe ist', () => {
    const ev = (cardId: string, holderName: string) =>
      ({ seq: 1, timestamp: Date.now(), cardId, cardNumber: 'M', holderName, outcome: 'granted', direction: 'in', source: 'camera' }) as AccessEvent;
    const events = [ev('s1', 'Hptm Max Muster'), ev('s2', 'OFw Anna Beispiel'), ev('s3', 'Frühere Person')];
    const holders = holdersByCard(rows);
    const base = { ...DEFAULT_EVENT_FILTER, range: 'all' as const };
    expect(filterEvents(events, { ...base, query: 'kompaniechef' }, new Date(), holders).map((e) => e.cardId)).toEqual(['s1']);
    expect(filterEvents(events, { ...base, unit: 'Stab' }, new Date(), holders).map((e) => e.cardId)).toEqual(['s2']); // s3: andere Person
    expect(filterEvents(events, { ...base, query: 'ofw' }, new Date()).map((e) => e.cardId)).toEqual(['s2']); // Dienstgrad steht im Protokoll
  });
});
