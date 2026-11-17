import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { rangeBounds, summarizeEvents, type DayStats } from '../domain/overview';
import { watchPresentation } from '../lib/presentation';
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

/** Ist gerade ein Präsentationsfenster geöffnet? */
export function usePresentationConnected(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => watchPresentation(setConnected), []);
  return connected;
}
