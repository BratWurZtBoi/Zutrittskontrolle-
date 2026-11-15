import { useMemo } from 'react';
import { listCards } from '../db/cards';
import { listPresence, queryEvents } from '../db/scans';
import { buildStatusRows, filterEvents, rangeBounds, type EventFilter, type StatusRow } from '../domain/overview';
import type { AccessEvent } from '../domain/types';
import { useSecureLiveQuery } from './useSecureLiveQuery';

/** Alle Karten mit Anwesenheitsstatus (aktualisiert sich live). */
export function useStatusRows(): StatusRow[] | undefined {
  return useSecureLiveQuery(async () => {
    // erst die Anwesenheit lesen, dann Karten (listCards entschlüsselt am Ende)
    const presence = await listPresence();
    const cards = await listCards();
    return buildStatusRows(cards, presence);
  }, []);
}

/** Protokolleinträge passend zum Filter (Zeitraum per Index, Rest im Speicher). */
export function useFilteredEvents(filter: EventFilter): { events: AccessEvent[]; loading: boolean } {
  const raw = useSecureLiveQuery(
    () => {
      const { from, to } = rangeBounds(filter, new Date());
      return queryEvents(from, to);
    },
    [filter.range, filter.from, filter.to],
  );
  const events = useMemo(() => (raw ? filterEvents(raw, filter, new Date()) : []), [raw, filter]);
  return { events, loading: raw === undefined };
}
