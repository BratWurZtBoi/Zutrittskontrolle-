/** Texte und Farbton für ein Scan-Ergebnis – gemeinsam für Scanner, Dashboard und Präsentation. */
import type { ScanOutcome } from '../db/scans';
import { formatTime } from '../domain/dates';
import { guestName } from '../domain/occasion';
import { directionText, holderName, reasonText } from '../domain/texts';

export type ResultTone = 'ok' | 'out' | 'deny' | 'warn';

export interface ResultText {
  tone: ResultTone;
  title: string;
  detail: string;
}

/** 'staff' = Bediener (Dashboard), 'guest' = Gast (Kiosk-Scanner, Präsentation). */
export type Audience = 'staff' | 'guest';

/**
 * Bei verlorenen Karten erfährt der Gast nichts über den Grund oder die Person –
 * wer die Karte gefunden oder an sich genommen hat, soll nicht gewarnt werden.
 */
export function hideIdentityFor(audience: Audience, result: ScanOutcome): boolean {
  return audience === 'guest' && (result.decision.reason === 'CARD_LOST' || result.decision.reason === 'OLD_CARD');
}

export function describeOutcome(result: ScanOutcome, audience: Audience = 'staff'): ResultText {
  const { decision, card } = result;
  if (decision.outcome === 'duplicate') {
    return {
      tone: 'warn',
      title: 'Bereits erfasst',
      detail: `${directionText(decision.direction)} wurde vor ${decision.secondsSinceLast ?? 0} s gebucht – Scan ignoriert.`,
    };
  }
  if (decision.outcome === 'pending') {
    return { tone: 'warn', title: 'Bitte kurz warten', detail: 'Ihr Eintritt wird gleich bestätigt.' };
  }
  if (decision.outcome === 'denied') {
    if (result.occasion && decision.reason === 'ALREADY_ADMITTED') {
      const when = result.admittedAt ?? result.guest?.admittedAt;
      const what = result.card ? 'Dieser Ausweis' : 'Diese Einladung';
      return {
        tone: 'warn',
        title: 'Bereits eingelassen',
        detail: when ? `${what} wurde um ${formatTime(when)} Uhr für „${result.occasion.name}“ verwendet.` : reasonText(decision.reason),
      };
    }
    if (decision.reason === 'OTHER_OCCASION') {
      return {
        tone: 'deny',
        title: 'Falsche Veranstaltung',
        detail: result.otherOccasion ? `Diese Einladung gilt für „${result.otherOccasion.name}“.` : reasonText(decision.reason),
      };
    }
    if (hideIdentityFor(audience, result)) return { tone: 'deny', title: 'Kein Zutritt', detail: 'Bitte wenden Sie sich an den Empfang.' };
    if (decision.reason === 'CARD_LOST') return { tone: 'deny', title: 'Verlorene Karte!', detail: reasonText(decision.reason, card) };
    if (decision.reason === 'OLD_CARD') return { tone: 'deny', title: 'Alte Karte!', detail: reasonText(decision.reason, card) };
    return { tone: 'deny', title: 'Kein Zutritt', detail: reasonText(decision.reason, card) };
  }
  if (decision.reason === 'CORRECTION') {
    return {
      tone: 'warn',
      title: 'Korrigiert',
      detail: `Fehlbuchung rückgängig gemacht – jetzt ${decision.direction === 'in' ? 'anwesend' : 'abwesend'}.`,
    };
  }
  if (result.occasion) {
    const how = result.manual ? ' (von Hand)' : result.card ? ' mit Dienstausweis' : '';
    return { tone: 'ok', title: 'Willkommen', detail: `Einlass ${result.occasion.name}${how} · ${formatTime(result.at)} Uhr` };
  }
  const manual = result.event?.source === 'manual' ? ' (manuell)' : '';
  const detail = `${directionText(decision.direction)} gebucht${manual} · ${formatTime(result.at)} Uhr`;
  return decision.direction === 'out'
    ? { tone: 'out', title: 'Auf Wiedersehen', detail }
    : { tone: 'ok', title: 'Willkommen', detail };
}

/** Anzeigename: Name der Person, sonst Kartennummer. */
export function displayName(result: ScanOutcome, audience: Audience = 'staff'): string | undefined {
  const { card, guest } = result;
  if (guest) return guestName(guest.person) ?? `Gast Nr. ${guest.number}`;
  if (!card || hideIdentityFor(audience, result)) return undefined;
  return card.holder ? holderName(card.holder) : `Karte ${card.number}`;
}
