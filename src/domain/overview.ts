/**
 * Reine Funktionen für Übersicht und Dashboard: Statuszeilen, Filtern, Sortieren.
 * Ohne Datenbank – gut testbar.
 */
import { addDays, toLocalDateString } from './dates';
import type { AccessEvent, Card, Direction, Group, PresenceRecord } from './types';

export type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Anwesenheitsstatus je Karte
// ---------------------------------------------------------------------------

export interface StatusRow {
  card: Card;
  group: Group | undefined;
  present: boolean;
  /** Zeitpunkt der letzten erfolgreichen Buchung (undefined = noch nie gebucht). */
  lastBookingAt?: number;
  lastDirection?: Direction;
}

export function buildStatusRows(
  cards: { card: Card; group: Group | undefined }[],
  presence: PresenceRecord[],
): StatusRow[] {
  const byCard = new Map(presence.map((p) => [p.cardId, p]));
  return cards.map(({ card, group }) => {
    const p = byCard.get(card.id);
    return { card, group, present: p?.status === 'in', lastBookingAt: p?.lastBookingAt, lastDirection: p?.status };
  });
}

export interface StatusFilter {
  query: string;
  groupId: string;
  status: 'all' | 'present' | 'absent';
  /** Auch Karten ohne zugeordnete Person anzeigen. */
  includeFree: boolean;
}

export const DEFAULT_STATUS_FILTER: StatusFilter = { query: '', groupId: '', status: 'all', includeFree: false };

function holderText(card: Card): string {
  const h = card.holder;
  return `${card.number} ${h?.firstName ?? ''} ${h?.lastName ?? ''} ${h?.company ?? ''}`.toLowerCase();
}

export function filterStatusRows(rows: StatusRow[], f: StatusFilter): StatusRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (!f.includeFree && !r.card.hasHolder && !r.present) return false;
    if (f.groupId && r.card.groupId !== f.groupId) return false;
    if (f.status === 'present' && !r.present) return false;
    if (f.status === 'absent' && r.present) return false;
    return !q || holderText(r.card).includes(q);
  });
}

export type StatusSortKey = 'status' | 'name' | 'card' | 'group' | 'time';

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

function displayName(card: Card): string {
  return card.holder ? `${card.holder.lastName} ${card.holder.firstName}` : '';
}

export function sortStatusRows(rows: StatusRow[], key: StatusSortKey, dir: SortDir): StatusRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a: StatusRow, b: StatusRow): number => {
    switch (key) {
      case 'status':
        return Number(b.present) - Number(a.present);
      case 'name':
        // Karten ohne Namen immer ans Ende
        if (!a.card.holder !== !b.card.holder) return a.card.holder ? -1 : 1;
        return collator.compare(displayName(a.card), displayName(b.card));
      case 'card':
        return collator.compare(a.card.number, b.card.number);
      case 'group':
        return collator.compare(a.group?.name ?? '', b.group?.name ?? '');
      case 'time':
        return (a.lastBookingAt ?? 0) - (b.lastBookingAt ?? 0);
    }
  };
  // stabile Sortierung mit Kartennummer als Zweitschlüssel
  return [...rows].sort((a, b) => sign * cmp(a, b) || collator.compare(a.card.number, b.card.number));
}

// ---------------------------------------------------------------------------
// Aktionen (Protokoll)
// ---------------------------------------------------------------------------

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';

export interface EventFilter {
  query: string;
  groupId: string;
  direction: 'all' | Direction;
  outcome: 'all' | 'granted' | 'denied';
  range: RangePreset;
  /** Nur bei range = 'custom': YYYY-MM-DD (inklusive). */
  from?: string;
  to?: string;
}

export const DEFAULT_EVENT_FILTER: EventFilter = { query: '', groupId: '', direction: 'all', outcome: 'all', range: 'today' };

/** Zeitraum als [von, bis) in Millisekunden (lokale Tagesgrenzen). */
export function rangeBounds(f: Pick<EventFilter, 'range' | 'from' | 'to'>, now: Date): { from: number; to: number } {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(now);
  const tomorrow = startOf(addDays(now, 1));
  switch (f.range) {
    case 'today':
      return { from: today, to: tomorrow };
    case 'yesterday':
      return { from: startOf(addDays(now, -1)), to: today };
    case '7d':
      return { from: startOf(addDays(now, -6)), to: tomorrow };
    case '30d':
      return { from: startOf(addDays(now, -29)), to: tomorrow };
    case 'all':
      return { from: 0, to: Number.MAX_SAFE_INTEGER };
    case 'custom': {
      const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : 0;
      const to = f.to ? startOf(addDays(new Date(`${f.to}T00:00:00`), 1)) : Number.MAX_SAFE_INTEGER;
      return { from, to };
    }
  }
}

export function filterEvents(events: AccessEvent[], f: EventFilter, now: Date): AccessEvent[] {
  const { from, to } = rangeBounds(f, now);
  const q = f.query.trim().toLowerCase();
  return events.filter((e) => {
    if (e.timestamp < from || e.timestamp >= to) return false;
    if (f.groupId && e.groupId !== f.groupId) return false;
    if (f.direction !== 'all' && e.direction !== f.direction) return false;
    if (f.outcome !== 'all' && e.outcome !== f.outcome) return false;
    if (!q) return true;
    return `${e.cardNumber ?? ''} ${e.holderName ?? ''} ${e.groupName ?? ''}`.toLowerCase().includes(q);
  });
}

export type EventSortKey = 'time' | 'name' | 'card' | 'group' | 'direction' | 'outcome';

export function sortEvents(events: AccessEvent[], key: EventSortKey, dir: SortDir): AccessEvent[] {
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a: AccessEvent, b: AccessEvent): number => {
    switch (key) {
      case 'time':
        return a.timestamp - b.timestamp;
      case 'name':
        return collator.compare(a.holderName ?? '', b.holderName ?? '');
      case 'card':
        return collator.compare(a.cardNumber ?? '', b.cardNumber ?? '');
      case 'group':
        return collator.compare(a.groupName ?? '', b.groupName ?? '');
      case 'direction':
        return collator.compare(a.direction ?? '', b.direction ?? '');
      case 'outcome':
        return collator.compare(a.outcome, b.outcome);
    }
  };
  return [...events].sort((a, b) => sign * cmp(a, b) || b.timestamp - a.timestamp);
}

/** Kurzinfo zu einem Zeitraum für Überschriften. */
export function rangeLabel(f: Pick<EventFilter, 'range' | 'from' | 'to'>, now: Date): string {
  switch (f.range) {
    case 'today':
      return 'heute';
    case 'yesterday':
      return 'gestern';
    case '7d':
      return 'letzte 7 Tage';
    case '30d':
      return 'letzte 30 Tage';
    case 'all':
      return 'gesamter Zeitraum';
    case 'custom':
      return `${f.from ?? '…'} bis ${f.to ?? toLocalDateString(now)}`;
  }
}

// ---------------------------------------------------------------------------
// Kennzahlen für die Statusleiste im Dashboard
// ---------------------------------------------------------------------------

export interface DayStats {
  /** Erfolgreiche Buchungen (Ein- und Ausgang, auch automatische). */
  granted: number;
  denied: number;
}

export function summarizeEvents(events: Pick<AccessEvent, 'outcome'>[]): DayStats {
  let granted = 0;
  let denied = 0;
  for (const e of events) {
    if (e.outcome === 'granted') granted++;
    else denied++;
  }
  return { granted, denied };
}

/** Anzahl je Gruppe (z. B. Anwesende), in der Reihenfolge der Gruppen; Gruppen ohne Treffer entfallen. */
export function countPerGroup(groupIds: string[], groups: Group[]): { group: Group; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of groupIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return groups.filter((g) => counts.has(g.id)).map((group) => ({ group, count: counts.get(group.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Korrekturen
// ---------------------------------------------------------------------------

/** Kann diese Buchung grundsätzlich rückgängig gemacht werden? (echte Buchung, noch nicht korrigiert) */
export function isCorrectable(e: Pick<AccessEvent, 'outcome' | 'source' | 'reason' | 'correctedBy' | 'cardId'>): boolean {
  return e.outcome === 'granted' && e.source !== 'system' && e.reason !== 'CORRECTION' && !e.correctedBy && Boolean(e.cardId);
}

/**
 * Nummern der Buchungen, die rückgängig gemacht werden können: je Karte nur die
 * letzte erfolgreiche Buchung (sonst würde die Anwesenheit falsch).
 */
export function undoableSeqs(events: AccessEvent[]): Set<number> {
  const latest = new Map<string, AccessEvent>();
  for (const e of events) {
    if (e.outcome !== 'granted' || !e.cardId || e.seq === undefined) continue;
    const cur = latest.get(e.cardId);
    if (!cur || (cur.seq ?? 0) < e.seq) latest.set(e.cardId, e);
  }
  const result = new Set<number>();
  for (const e of latest.values()) if (isCorrectable(e) && e.seq !== undefined) result.add(e.seq);
  return result;
}
