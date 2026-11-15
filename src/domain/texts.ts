/** Deutsche Anzeigetexte für Entscheidungen und Status. */
import type { CardStatus } from './access';
import { formatIsoDate } from './dates';
import type { Card, CardHolder, Direction, ReasonCode } from './types';

export function reasonText(reason: ReasonCode, card?: Pick<Card, 'validFrom' | 'validUntil'>): string {
  switch (reason) {
    case 'OK':
      return 'Buchung erfasst';
    case 'INVALID_CODE':
      return 'Dieser QR-Code ist keine gültige Karte.';
    case 'UNKNOWN_CARD':
      return 'Karte unbekannt oder durch einen neuen QR-Code ersetzt.';
    case 'CARD_BLOCKED':
      return 'Diese Karte ist gesperrt.';
    case 'GROUP_DISABLED':
      return 'Zutritt für diese Gruppe ist derzeit gesperrt.';
    case 'NO_PERMISSION':
      return 'Keine Zutrittsberechtigung.';
    case 'UNASSIGNED':
      return 'Karte ist keiner Person zugeordnet.';
    case 'NOT_YET_VALID':
      return card?.validFrom
        ? `Berechtigung gilt erst ab ${formatIsoDate(card.validFrom)}.`
        : 'Berechtigung noch nicht gültig.';
    case 'EXPIRED':
      return card?.validUntil
        ? `Berechtigung abgelaufen am ${formatIsoDate(card.validUntil)}.`
        : 'Berechtigung abgelaufen.';
    case 'DUPLICATE':
      return 'Bereits erfasst.';
    case 'CONFIRMATION_REQUIRED':
      return 'Eintritt muss bestätigt werden – bitte am Empfang melden.';
    case 'REJECTED':
      return 'Vom Empfang abgewiesen.';
    case 'CONFIRMATION_TIMEOUT':
      return 'Nicht rechtzeitig bestätigt.';
  }
}

export function directionText(direction: Direction | undefined): string {
  if (direction === 'in') return 'Eingang';
  if (direction === 'out') return 'Ausgang';
  return '–';
}

export const STATUS_LABEL: Record<CardStatus, string> = {
  active: 'Zutritt erlaubt',
  blocked: 'Gesperrt',
  'group-disabled': 'Gruppe gesperrt',
  'no-permission': 'Kein Zutritt',
  unassigned: 'Nicht zugeordnet',
  'not-yet-valid': 'Noch nicht gültig',
  expired: 'Abgelaufen',
};

export function holderName(holder: CardHolder | undefined): string | undefined {
  return holder ? `${holder.firstName} ${holder.lastName}`.trim() : undefined;
}
