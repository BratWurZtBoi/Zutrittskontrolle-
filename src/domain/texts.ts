/** Deutsche Anzeigetexte für Entscheidungen und Status. */
import { formatIsoDate } from './dates';
import type { PersonStatus } from './access';
import type { Direction, Person, ReasonCode } from './types';

export function reasonText(reason: ReasonCode, person?: Pick<Person, 'validFrom' | 'validUntil'>): string {
  switch (reason) {
    case 'OK':
      return 'Buchung erfasst';
    case 'INVALID_CODE':
      return 'Dieser QR-Code ist kein gültiger Ausweis.';
    case 'UNKNOWN_CARD':
      return 'Ausweis unbekannt oder durch einen neuen Ausweis ersetzt.';
    case 'CARD_BLOCKED':
      return 'Dieser Ausweis ist gesperrt.';
    case 'NO_PERMISSION':
      return 'Keine Zutrittsberechtigung.';
    case 'NOT_YET_VALID':
      return person?.validFrom
        ? `Berechtigung gilt erst ab ${formatIsoDate(person.validFrom)}.`
        : 'Berechtigung noch nicht gültig.';
    case 'EXPIRED':
      return person?.validUntil
        ? `Berechtigung abgelaufen am ${formatIsoDate(person.validUntil)}.`
        : 'Berechtigung abgelaufen.';
    case 'DUPLICATE':
      return 'Bereits erfasst.';
  }
}

export function directionText(direction: Direction | undefined): string {
  if (direction === 'in') return 'Eingang';
  if (direction === 'out') return 'Ausgang';
  return '–';
}

export const STATUS_LABEL: Record<PersonStatus, string> = {
  active: 'Zutritt erlaubt',
  blocked: 'Ausweis gesperrt',
  'no-permission': 'Kein Zutritt',
  'not-yet-valid': 'Noch nicht gültig',
  expired: 'Abgelaufen',
};
