/** Deutsche Anzeigetexte für Entscheidungen und Status. */
import type { CardStatus } from './access';
import { formatDate, formatIsoDate } from './dates';
import type { Card, CardHolder, Direction, ReasonCode } from './types';

export function reasonText(reason: ReasonCode, card?: Pick<Card, 'validFrom' | 'validUntil' | 'lostAt'>): string {
  switch (reason) {
    case 'OK':
      return 'Buchung erfasst';
    case 'INVALID_CODE':
      return 'Dieser QR-Code ist keine gültige Karte.';
    case 'UNKNOWN_CARD':
      return 'Karte unbekannt oder durch einen neuen QR-Code ersetzt.';
    case 'CARD_BLOCKED':
      return 'Diese Karte ist gesperrt.';
    case 'CARD_LOST':
      return card?.lostAt
        ? `Karte wurde am ${formatDate(card.lostAt)} als verloren gemeldet.`
        : 'Karte wurde als verloren gemeldet.';
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
    case 'CORRECTION':
      return 'Fehlbuchung rückgängig gemacht.';
    case 'ALREADY_ADMITTED':
      return 'Diese Einladung wurde bereits verwendet.';
    case 'GUEST_CANCELLED':
      return 'Diese Einladung wurde storniert.';
    case 'OTHER_OCCASION':
      return 'Diese Einladung gilt für eine andere Veranstaltung.';
    case 'UNKNOWN_GUEST':
      return 'Einladung unbekannt.';
    case 'CARDS_NOT_ADMITTED':
      return 'Dienstausweise gelten bei dieser Veranstaltung nicht – bitte die Einladung vorzeigen.';
    case 'ADMISSION_UNDONE':
      return 'Einlass zurückgenommen.';
  }
}

export function directionText(direction: Direction | undefined): string {
  if (direction === 'in') return 'Eingang';
  if (direction === 'out') return 'Ausgang';
  return '–';
}

export const STATUS_LABEL: Record<CardStatus, string> = {
  active: 'Zutritt erlaubt',
  lost: 'Verloren',
  blocked: 'Gesperrt',
  'group-disabled': 'Gruppe gesperrt',
  'no-permission': 'Kein Zutritt',
  unassigned: 'Nicht zugeordnet',
  'not-yet-valid': 'Noch nicht gültig',
  expired: 'Abgelaufen',
};

const joinWith = (sep: string, parts: (string | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(sep);

/** „Hptm Max Mustermann“ – mit Dienstgrad (Scan-Ergebnis, Protokoll). */
export function holderName(holder: CardHolder | undefined): string | undefined {
  return holder ? joinWith(' ', [holder.rank, holder.firstName, holder.lastName]) : undefined;
}

/** „Hptm Mustermann, Max“ – für Listen (sortiert wird nach dem Nachnamen). */
export function holderListName(holder: CardHolder): string {
  return joinWith(' ', [holder.rank, joinWith(', ', [holder.lastName, holder.firstName])]);
}

/** Wer ist es? Vor- und Nachname ohne Dienstgrad – eine Beförderung ist kein Personenwechsel. */
export function personKey(holder: CardHolder | undefined): string | undefined {
  return holder ? joinWith(' ', [holder.firstName, holder.lastName]).toLowerCase() : undefined;
}

/** „Einheit · Stellung/Posten“ (leer, wenn beides fehlt). */
export function holderUnitLine(holder: CardHolder | undefined): string {
  return holder ? joinWith(' · ', [holder.company, holder.position]) : '';
}
