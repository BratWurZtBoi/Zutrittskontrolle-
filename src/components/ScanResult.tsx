import { useEffect, useState } from 'react';
import type { ScanOutcome } from '../db/scans';
import { formatTime } from '../domain/dates';
import { directionText, holderName, reasonText } from '../domain/texts';
import { GroupBadge } from './GroupBadge';
import { HolderPhoto } from './HolderPhoto';
import { AlertIcon, CheckIcon, CrossIcon, ExitIcon, LockIcon } from './Icons';

function describe(result: ScanOutcome) {
  const { decision, card } = result;
  if (decision.outcome === 'duplicate') {
    return {
      tone: 'warn',
      title: 'Bereits erfasst',
      Icon: AlertIcon,
      detail: `${directionText(decision.direction)} wurde vor ${decision.secondsSinceLast ?? 0} s gebucht – Scan ignoriert.`,
    };
  }
  if (decision.outcome === 'denied') {
    return { tone: 'deny', title: 'Kein Zutritt', Icon: CrossIcon, detail: reasonText(decision.reason, card) };
  }
  const detail = `${directionText(decision.direction)} gebucht · ${formatTime(result.at)} Uhr`;
  return decision.direction === 'out'
    ? { tone: 'out', title: 'Auf Wiedersehen', Icon: ExitIcon, detail }
    : { tone: 'ok', title: 'Willkommen', Icon: CheckIcon, detail };
}

function ResultContent({ result }: { result: ScanOutcome }) {
  const { card, group } = result;
  const holder = card?.holder;
  const { title, Icon, detail } = describe(result);
  return (
    <>
      <div className="result-head">
        <Icon className="result-icon" />
        <span className="result-title">{title}</span>
      </div>
      {card && <HolderPhoto holder={holder} fallback={group?.prefix ?? '?'} className="result-photo" />}
      {card && <div className="result-name">{holder ? holderName(holder) : `Karte ${card.number}`}</div>}
      {card && card.hasHolder && !holder && (
        <div className="result-locked">
          <LockIcon /> Name gesperrt
        </div>
      )}
      {card && (
        <div className="result-id">
          <GroupBadge group={group} className="result-group" /> {holder ? `Karte ${card.number}` : ''}
          {holder?.company ? ` · ${holder.company}` : ''}
        </div>
      )}
      <div className="result-detail">{detail}</div>
    </>
  );
}

/** Vollbild-Anzeige im Kiosk-Scanner. */
export function ResultOverlay({ result, onClose }: { result: ScanOutcome; onClose: () => void }) {
  return (
    <div className={`result-overlay result-${describe(result).tone}`} role="alert" onClick={onClose}>
      <ResultContent result={result} />
      <div className="result-dismiss">Tippen zum Schließen</div>
    </div>
  );
}

/**
 * Ergebnis als Feld im Dashboard: einige Sekunden farbig hervorgehoben,
 * danach als „Letzter Scan“ neutral weiter sichtbar.
 */
export function ResultPanel({ result, highlightSec }: { result: ScanOutcome | null; highlightSec: number }) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!result) return;
    setFresh(true);
    const t = window.setTimeout(() => setFresh(false), highlightSec * 1000);
    return () => window.clearTimeout(t);
  }, [result, highlightSec]);

  if (!result) {
    return (
      <div className="result-panel result-idle" aria-live="polite">
        Bereit – Karte vor die Kamera halten
      </div>
    );
  }
  return (
    <div className={`result-panel result-${describe(result).tone} ${fresh ? 'fresh' : 'stale'}`} role="status" aria-live="polite">
      {!fresh && <div className="result-stale-label">Letzter Scan · {formatTime(result.at)} Uhr</div>}
      <ResultContent result={result} />
    </div>
  );
}
