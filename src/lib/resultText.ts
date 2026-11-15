/** Texte und Farbton für ein Scan-Ergebnis – gemeinsam für Scanner, Dashboard und Präsentation. */
import type { ScanOutcome } from '../db/scans';
import { formatTime } from '../domain/dates';
import { directionText, holderName, reasonText } from '../domain/texts';

export type ResultTone = 'ok' | 'out' | 'deny' | 'warn';

export interface ResultText {
  tone: ResultTone;
  title: string;
  detail: string;
}

export function describeOutcome(result: ScanOutcome): ResultText {
  const { decision, card } = result;
  if (decision.outcome === 'duplicate') {
    return {
      tone: 'warn',
      title: 'Bereits erfasst',
      detail: `${directionText(decision.direction)} wurde vor ${decision.secondsSinceLast ?? 0} s gebucht – Scan ignoriert.`,
    };
  }
  if (decision.outcome === 'denied') return { tone: 'deny', title: 'Kein Zutritt', detail: reasonText(decision.reason, card) };
  const detail = `${directionText(decision.direction)} gebucht · ${formatTime(result.at)} Uhr`;
  return decision.direction === 'out'
    ? { tone: 'out', title: 'Auf Wiedersehen', detail }
    : { tone: 'ok', title: 'Willkommen', detail };
}

/** Anzeigename: Name der Person, sonst Kartennummer. */
export function displayName(result: ScanOutcome): string | undefined {
  const { card } = result;
  if (!card) return undefined;
  return card.holder ? holderName(card.holder) : `Karte ${card.number}`;
}
