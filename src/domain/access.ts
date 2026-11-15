/**
 * Reine Entscheidungslogik für einen Scan – ohne Datenbank, gut testbar.
 */
import { toLocalDateString } from './dates';
import type { Direction, Outcome, Person, PresenceRecord, ReasonCode, ScanMode } from './types';

export interface AccessInput {
  /** Person zum gescannten Token, undefined = unbekannter Ausweis. */
  person: Pick<
    Person,
    'accessGranted' | 'cardBlocked' | 'validFrom' | 'validUntil'
  > | undefined;
  presence: Pick<PresenceRecord, 'status' | 'lastBookingAt'> | undefined;
  mode: ScanMode;
  now: Date;
  /** Doppelscan-Schutz: Mindestabstand zwischen zwei Buchungen derselben Person. */
  cooldownMs: number;
}

export interface Decision {
  outcome: Outcome;
  reason: ReasonCode;
  /** Gebuchte Richtung (bei Doppelscan: Richtung der letzten Buchung). */
  direction?: Direction;
  /** Bei Doppelscan: Sekunden seit der letzten Buchung. */
  secondsSinceLast?: number;
}

export function decideAccess(input: AccessInput): Decision {
  const { person, presence, mode, now, cooldownMs } = input;

  if (!person) return { outcome: 'denied', reason: 'UNKNOWN_CARD' };
  if (person.cardBlocked) return { outcome: 'denied', reason: 'CARD_BLOCKED' };

  if (presence) {
    const elapsed = now.getTime() - presence.lastBookingAt;
    if (elapsed >= 0 && elapsed < cooldownMs) {
      return {
        outcome: 'duplicate',
        reason: 'DUPLICATE',
        direction: presence.status,
        secondsSinceLast: Math.floor(elapsed / 1000),
      };
    }
  }

  const direction: Direction =
    mode === 'auto' ? (presence?.status === 'in' ? 'out' : 'in') : mode;

  // Ausbuchen ist immer möglich (Anwesenheit muss korrekt bleiben),
  // die Berechtigungsprüfung gilt nur für den Eintritt.
  if (direction === 'in') {
    if (!person.accessGranted) {
      return { outcome: 'denied', reason: 'NO_PERMISSION', direction };
    }
    const today = toLocalDateString(now);
    if (person.validFrom && today < person.validFrom) {
      return { outcome: 'denied', reason: 'NOT_YET_VALID', direction };
    }
    if (person.validUntil && today > person.validUntil) {
      return { outcome: 'denied', reason: 'EXPIRED', direction };
    }
  }

  return { outcome: 'granted', reason: 'OK', direction };
}

/** Status einer Person für Listenansichten (unabhängig von der Anwesenheit). */
export type PersonStatus = 'active' | 'blocked' | 'no-permission' | 'not-yet-valid' | 'expired';

export function personStatus(
  person: Pick<Person, 'accessGranted' | 'cardBlocked' | 'validFrom' | 'validUntil'>,
  now: Date,
): PersonStatus {
  if (person.cardBlocked) return 'blocked';
  if (!person.accessGranted) return 'no-permission';
  const today = toLocalDateString(now);
  if (person.validFrom && today < person.validFrom) return 'not-yet-valid';
  if (person.validUntil && today > person.validUntil) return 'expired';
  return 'active';
}
