import { useEffect, useState } from 'react';
import type { ScanOutcome } from '../db/scans';
import { formatTime } from '../domain/dates';
import { isCorrectable } from '../domain/overview';
import { companionsText, guestName } from '../domain/occasion';
import { holderName, holderUnitLine } from '../domain/texts';
import { describeOutcome, hideIdentityFor, type Audience } from '../lib/resultText';
import { GroupBadge } from './GroupBadge';
import { OccasionBadge } from './OccasionBadge';
import { HolderPhoto } from './HolderPhoto';
import { AlertIcon, CheckIcon, CrossIcon, ExitIcon, LockIcon } from './Icons';

const ICONS = { ok: CheckIcon, out: ExitIcon, deny: CrossIcon, warn: AlertIcon };

function describe(result: ScanOutcome, audience: Audience) {
  const text = describeOutcome(result, audience);
  return { ...text, Icon: ICONS[text.tone] };
}

function ResultContent({ result, audience }: { result: ScanOutcome; audience: Audience }) {
  const { title, Icon, detail } = describe(result, audience);
  if (hideIdentityFor(audience, result)) {
    return (
      <>
        <div className="result-head">
          <Icon className="result-icon" />
          <span className="result-title">{title}</span>
        </div>
        <div className="result-detail">{detail}</div>
      </>
    );
  }
  const { card, group, guest, occasion } = result;
  if (guest) {
    const person = guest.person;
    return (
      <>
        <div className="result-head">
          <Icon className="result-icon" />
          <span className="result-title">{title}</span>
        </div>
        <div className="result-name">
          {guestName(person) ?? `Gast Nr. ${guest.number}`}
          {result.decision.outcome === 'granted' && (guest.companionsAdmitted ?? 0) > 0 && (
            <span className="result-companions"> + {companionsText(guest.companionsAdmitted)}</span>
          )}
        </div>
        {guest.hasPerson && !person && (
          <div className="result-locked">
            <LockIcon /> Name gesperrt
          </div>
        )}
        <div className="result-id">
          {occasion && <OccasionBadge name={guest.category || occasion.name} color={occasion.color} />} Einladung Nr. {guest.number}
          {person?.company ? ` · ${person.company}` : ''}
        </div>
        <div className="result-detail">{detail}</div>
      </>
    );
  }
  const holder = card?.holder;
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
          {holderUnitLine(holder) ? ` · ${holderUnitLine(holder)}` : ''}
        </div>
      )}
      <div className="result-detail">{detail}</div>
    </>
  );
}

/** Vollbild-Anzeige im Kiosk-Scanner (für Gäste sichtbar). */
export function ResultOverlay({ result, onClose }: { result: ScanOutcome; onClose: () => void }) {
  return (
    <div className={`result-overlay result-${describe(result, 'guest').tone}`} role="alert" onClick={onClose}>
      <ResultContent result={result} audience="guest" />
      <div className="result-dismiss">Tippen zum Schließen</div>
    </div>
  );
}

/**
 * Ergebnis als Feld im Dashboard: einige Sekunden farbig hervorgehoben,
 * danach als „Letzter Scan“ neutral weiter sichtbar. Optional mit „Rückgängig“.
 */
export function ResultPanel({
  result,
  highlightSec,
  onUndo,
  undoError,
}: {
  result: ScanOutcome | null;
  highlightSec: number;
  /** Fehlbuchung rückgängig machen (nur bei echten Buchungen angeboten). */
  onUndo?: (seq: number) => void;
  undoError?: string | null;
}) {
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
    <div
      className={`result-panel result-${describe(result, 'staff').tone} ${fresh ? 'fresh' : 'stale'} ${result.decision.reason === 'CARD_LOST' || result.decision.reason === 'OLD_CARD' ? 'result-lost' : ''}`}
      role="status"
      aria-live="polite"
    >
      {!fresh && <div className="result-stale-label">Letzter Scan · {formatTime(result.at)} Uhr</div>}
      <ResultContent result={result} audience="staff" />
      {onUndo && result.event?.seq !== undefined && isCorrectable(result.event) && (
        <div className="result-actions">
          <button type="button" className="btn btn-small result-undo" onClick={() => onUndo(result.event!.seq!)}>
            ↺ Rückgängig ({result.decision.direction === 'out' ? 'doch anwesend' : 'doch nicht eingetreten'})
          </button>
        </div>
      )}
      {undoError && <p className="result-undo-error">{undoError}</p>}
    </div>
  );
}
