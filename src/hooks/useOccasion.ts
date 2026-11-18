import { useLiveQuery } from 'dexie-react-hooks';
import { listGuestRecords, listGuests, listOccasionLog, loadActiveOccasion } from '../db/occasions';
import { db } from '../db/db';
import type { Guest, GuestRecord, Occasion, OccasionLogEntry } from '../domain/occasion';
import { useSecureLiveQuery } from './useSecureLiveQuery';

/**
 * Veranstaltung, deren Einlass auf diesem Gerät läuft.
 * undefined = wird geladen, null = kein Einlass-Modus.
 */
export function useActiveOccasion(): Occasion | null | undefined {
  return useLiveQuery(async () => (await loadActiveOccasion()) ?? null, []);
}

export function useOccasion(id: string): Occasion | null | undefined {
  return useLiveQuery(async () => (await db.occasions.get(id)) ?? null, [id]);
}

/** Gäste mit Personendaten (entschlüsselt, sofern entsperrt). */
export function useGuests(occasionId: string | undefined): Guest[] | undefined {
  return useSecureLiveQuery(() => (occasionId ? listGuests(occasionId) : Promise.resolve([])), [occasionId]);
}

/** Nur Zahlen/Status (ohne Entschlüsseln) – für Kennzahlen. */
export function useGuestRecords(occasionId: string | undefined): GuestRecord[] | undefined {
  return useLiveQuery(() => (occasionId ? listGuestRecords(occasionId) : []), [occasionId]);
}

export function useOccasionLog(occasionId: string | undefined): OccasionLogEntry[] | undefined {
  return useSecureLiveQuery(() => (occasionId ? listOccasionLog(occasionId) : Promise.resolve([])), [occasionId]);
}
