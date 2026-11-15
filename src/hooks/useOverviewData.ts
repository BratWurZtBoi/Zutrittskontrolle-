import { useMemo } from 'react';
import { listCards } from '../db/cards';
import { listPresence, queryEvents } from '../db/scans';
import { buildStatusRows, filterEvents, rangeBounds, type EventFilter, type StatusRow } from '../domain/overview';
import type { AccessEvent } from '../domain/types';
import { useSecureLiveQuery } from './useSecureLiveQuery';
import { useToday } from './useToday';

/** Alle Karten mit Anwesenheitsstatus (aktualisiert sich live). */
export function useStatusRows(): StatusRow[] | undefined {
  return useSecureLiveQuery(async () => {
    // erst die Anwesenheit lesen, dann Karten (listCards entschlüsselt am Ende)
    const presence = await listPresence();
    const cards = await listCards();
    return buildStatusRows(cards, presence);
  }, []);
}

/** Alle Protokolleinträge im Zeitraum des Filters (per Index, entschlüsselt). */
export function useRangeEvents(range: Pick<EventFilter, 'range' | 'from' | 'to'>): AccessEvent[] | undefined {
  const today = useToday(); // „heute“ nach Mitternacht neu laden
  return useSecureLiveQuery(
    () => {
      const { from, to } = rangeBounds(range, new Date());
      return queryEvents(from, to);
    },
    [range.range, range.from, range.to, today],
  );
}

/** Protokolleinträge passend zum Filter (Zeitraum per Index, Rest im Speicher). */
export function useFilteredEvents(filter: EventFilter): { events: AccessEvent[]; loading: boolean } {
  const raw = useRangeEvents(filter);
  const events = useMemo(() => (raw ? filterEvents(raw, filter, new Date()) : []), [raw, filter]);
  return { events, loading: raw === undefined };
}
