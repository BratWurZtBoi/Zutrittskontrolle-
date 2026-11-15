/**
 * Reine Entscheidungslogik für einen Scan – ohne Datenbank, gut testbar.
 */
import { toLocalDateString } from './dates';
import type { Card, Direction, Group, Outcome, PresenceRecord, ReasonCode, ScanMode } from './types';

export type CardRules = Pick<Card, 'accessGranted' | 'blocked' | 'validFrom' | 'validUntil'> & {
  hasHolder: boolean;
};
export type GroupRules = Pick<Group, 'accessGranted' | 'allowUnassigned'> & Partial<Pick<Group, 'requireConfirmation'>>;

/**
 * Wie mit Gruppen umgehen, deren Eintritt bestätigt werden muss:
 * - 'operator': jemand kann bestätigen (Dashboard) → Ergebnis „wartet auf Bestätigung“
 * - 'none': niemand kann bestätigen (Kiosk-Scanner) → abweisen mit Hinweis
 * - 'confirmed': wurde gerade bestätigt → normal buchen
 */
export type ConfirmationContext = 'operator' | 'none' | 'confirmed';

export interface AccessInput {
  /** Karte zum gescannten Token, undefined = unbekannter Ausweis. */
  card: CardRules | undefined;
  group: GroupRules | undefined;
  presence: Pick<PresenceRecord, 'status' | 'lastBookingAt' | 'bySystem'> | undefined;
  mode: ScanMode;
  now: Date;
  /** Doppelscan-Schutz: Mindestabstand zwischen zwei Buchungen derselben Karte. */
  cooldownMs: number;
  /** Standard: 'none'. Wirkt nur bei Gruppen mit Bestätigungspflicht. */
  confirmation?: ConfirmationContext;
}

export interface Decision {
  outcome: Outcome;
  reason: ReasonCode;
  /** Gebuchte Richtung (bei Doppelscan: Richtung der letzten Buchung). */
  direction?: Direction;
  /** Bei Doppelscan: Sekunden seit der letzten Buchung. */
  secondsSinceLast?: number;
}

/** Gründe, aus denen ein Eintritt nicht erlaubt ist (null = erlaubt). */
export function entryBlocker(card: CardRules, group: GroupRules | undefined, now: Date): ReasonCode | null {
  if (group && !group.accessGranted) return 'GROUP_DISABLED';
  if (!card.accessGranted) return 'NO_PERMISSION';
  if (!card.hasHolder && !group?.allowUnassigned) return 'UNASSIGNED';
  const today = toLocalDateString(now);
  if (card.validFrom && today < card.validFrom) return 'NOT_YET_VALID';
  if (card.validUntil && today > card.validUntil) return 'EXPIRED';
  return null;
}

export function decideAccess(input: AccessInput): Decision {
  const { card, group, presence, mode, now, cooldownMs, confirmation = 'none' } = input;

  if (!card) return { outcome: 'denied', reason: 'UNKNOWN_CARD' };
  if (card.blocked) return { outcome: 'denied', reason: 'CARD_BLOCKED' };

  // Doppelscan-Schutz nur gegenüber echten Scans, nicht nach automatischen Buchungen
  if (presence && !presence.bySystem) {
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

  const direction: Direction = mode === 'auto' ? (presence?.status === 'in' ? 'out' : 'in') : mode;

  // Ausbuchen ist immer möglich (Anwesenheit muss korrekt bleiben),
  // die Berechtigungsprüfung gilt nur für den Eintritt.
  if (direction === 'in') {
    const blocker = entryBlocker(card, group, now);
    if (blocker) return { outcome: 'denied', reason: blocker, direction };
    // Bestätigungspflicht erst nach allen anderen Prüfungen: Abgewiesene Karten
    // landen gar nicht erst beim Bediener.
    if (group?.requireConfirmation && confirmation !== 'confirmed') {
      return confirmation === 'operator'
        ? { outcome: 'pending', reason: 'CONFIRMATION_REQUIRED', direction }
        : { outcome: 'denied', reason: 'CONFIRMATION_REQUIRED', direction };
    }
  }

  return { outcome: 'granted', reason: 'OK', direction };
}

/** Status einer Karte für Listenansichten (unabhängig von der Anwesenheit). */
export type CardStatus = 'active' | 'blocked' | 'group-disabled' | 'no-permission' | 'unassigned' | 'not-yet-valid' | 'expired';

export function cardStatus(card: CardRules, group: GroupRules | undefined, now: Date): CardStatus {
  if (card.blocked) return 'blocked';
  switch (entryBlocker(card, group, now)) {
    case 'GROUP_DISABLED':
      return 'group-disabled';
    case 'NO_PERMISSION':
      return 'no-permission';
    case 'UNASSIGNED':
      return 'unassigned';
    case 'NOT_YET_VALID':
      return 'not-yet-valid';
    case 'EXPIRED':
      return 'expired';
    default:
      return 'active';
  }
}

export function toCardRules(card: Card): CardRules {
  return { ...card, hasHolder: Boolean(card.holder) };
}
