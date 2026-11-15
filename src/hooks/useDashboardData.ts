import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { listRecentEvents } from '../db/scans';
import { rangeBounds, summarizeEvents, type DayStats } from '../domain/overview';
import type { AccessEvent } from '../domain/types';
import { watchPresentation } from '../lib/presentation';
import { useSecureLiveQuery } from './useSecureLiveQuery';
import { useToday } from './useToday';

export interface DashboardStats extends DayStats {
  /** Gruppen-ID je anwesender Karte (für die Aufteilung nach Gruppen). */
  presentGroupIds: string[];
}

/** Kennzahlen für die Statusleiste – ohne Entschlüsseln (keine Personendaten nötig). */
export function useDashboardStats(): DashboardStats | undefined {
  const today = useToday();
  return useLiveQuery(async () => {
    const presence = await db.presence.where('status').equals('in').toArray();
    const cards = await db.cards.bulkGet(presence.map((p) => p.cardId));
    const { from, to } = rangeBounds({ range: 'today' }, new Date(`${today}T12:00:00`));
    const events = await db.events.where('timestamp').between(from, to, true, false).toArray();
    return {
      ...summarizeEvents(events),
      presentGroupIds: cards.flatMap((c) => (c ? [c.groupId] : [])),
    };
  }, [today]);
}

/** Die letzten Scans (ohne automatische Buchungen) für die Seitenleiste. */
export function useRecentScans(count = 5): AccessEvent[] {
  return useSecureLiveQuery(
    async () => (await listRecentEvents(count * 3)).filter((e) => e.source !== 'system').slice(0, count),
    [count],
    [],
  );
}

/** Ist gerade ein Präsentationsfenster geöffnet? */
export function usePresentationConnected(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => watchPresentation(setConnected), []);
  return connected;
}
