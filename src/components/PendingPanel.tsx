import { useEffect, useState } from 'react';
import type { PendingAction } from '../db/scans';
import { holderName } from '../domain/texts';
import type { PendingEntry } from '../hooks/useScanProcessor';
import { GroupBadge } from './GroupBadge';
import { HolderPhoto } from './HolderPhoto';

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

interface Props {
  pending: PendingEntry[];
  onResolve: (id: string, action: PendingAction) => void;
}

/**
 * Anfrage „Eintritt bestätigen“ im Dashboard: großes Foto zum Vergleichen,
 * Einlassen (Enter) oder Abweisen (Esc). Weitere Anfragen warten darunter.
 */
export function PendingPanel({ pending, onResolve }: Props) {
  const now = useNow(1000);
  const first = pending[0];
  if (!first) return null;
  const { card, group } = first.outcome;
  const holder = card?.holder;
  const secondsLeft = Math.max(0, Math.ceil((first.expiresAt - now) / 1000));
  const rest = pending.slice(1);

  return (
    <section className="pending-panel" role="alertdialog" aria-label="Eintritt bestätigen" aria-live="assertive">
      <div className="pending-head">
        <span>Bestätigung erforderlich</span>
        <span className="pending-timer">noch {secondsLeft} s</span>
      </div>
      <div className="pending-who">
        <HolderPhoto holder={holder} fallback={group?.prefix ?? '?'} className="pending-photo" />
        <div className="pending-info">
          <div className="pending-name">{holder ? holderName(holder) : card ? `Karte ${card.number}` : 'Unbekannte Karte'}</div>
          <div>
            <GroupBadge group={group} /> {card && <span>Karte {card.number}</span>}
          </div>
          {holder?.company && <div className="muted">{holder.company}</div>}
          {holder?.note && <div className="pending-note">Notiz: {holder.note}</div>}
          <div className="muted">
            möchte <strong>eintreten</strong>
          </div>
        </div>
      </div>
      <div className="pending-actions">
        <button type="button" className="btn pending-accept" onClick={() => onResolve(first.id, 'accept')}>
          Einlassen
          <small>Taste Enter</small>
        </button>
        <button type="button" className="btn pending-reject" onClick={() => onResolve(first.id, 'reject')}>
          Abweisen
          <small>Taste Esc</small>
        </button>
      </div>
      {rest.length > 0 && (
        <p className="pending-more">
          Außerdem warten: {rest.map((p) => (p.outcome.card?.holder ? holderName(p.outcome.card.holder) : `Karte ${p.outcome.card?.number ?? '?'}`)).join(', ')}
        </p>
      )}
    </section>
  );
}

/** Tastaturkürzel für die erste Anfrage – nicht während der Eingabe in Such- oder Textfeldern. */
export function usePendingShortcuts(pending: PendingEntry[], onResolve: (id: string, action: PendingAction) => void): void {
  useEffect(() => {
    const first = pending[0];
    if (!first) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onResolve(first.id, 'accept');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onResolve(first.id, 'reject');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onResolve]);
}
