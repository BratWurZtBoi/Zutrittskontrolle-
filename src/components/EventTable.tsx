import { formatShortDateTime } from '../domain/dates';
import { sortEvents, type EventSortKey } from '../domain/overview';
import { directionText, reasonText } from '../domain/texts';
import type { AccessEvent, Group } from '../domain/types';
import type { SortState } from '../hooks/useSort';
import { GroupBadge } from './GroupBadge';
import { GroupBarCell } from './GroupBar';
import { SortableTh } from './SortableTh';

interface Props {
  events: AccessEvent[];
  groups: Group[];
  sort: SortState<EventSortKey>;
  limit: number;
  onMore?: () => void;
  compact?: boolean;
  /** Nummern der Buchungen, die rückgängig gemacht werden können (nur mit onUndo). */
  undoable?: Set<number>;
  onUndo?: (seq: number) => void;
}

/** Tabelle der Aktionen (Zutrittsprotokoll), sortierbar. */
export function EventTable({ events, groups, sort, limit, onMore, compact = false, undoable, onUndo }: Props) {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const sorted = sortEvents(events, sort.key, sort.dir);
  const shown = sorted.slice(0, limit);
  const now = new Date();

  if (events.length === 0) return <p className="muted empty-note">Keine passenden Aktionen.</p>;

  return (
    <div className="table-wrap">
      <table className={compact ? 'data-table compact one-line events' : 'data-table events'}>
        <thead>
          <tr>
            {compact && <th aria-label="Gruppe" className="group-bar-cell" />}
            <SortableTh label="Zeit" sortKey="time" sort={sort} />
            <SortableTh label="Name" sortKey="name" sort={sort} />
            <SortableTh label="Karte" sortKey="card" sort={sort} />
            {!compact && <SortableTh label="Gruppe" sortKey="group" sort={sort} />}
            <SortableTh label="Richtung" sortKey="direction" sort={sort} />
            <SortableTh label="Ergebnis" sortKey="outcome" sort={sort} />
            {onUndo && <th className="th-plain" aria-label="Korrektur" />}
          </tr>
        </thead>
        <tbody>
          {shown.map((e) => {
            const group = e.groupId ? byId.get(e.groupId) : undefined;
            return (
              <tr key={e.seq} className={e.outcome === 'denied' ? 'row-denied' : ''}>
                {compact && <GroupBarCell group={group} fallbackName={e.groupName} />}
                <td>{formatShortDateTime(e.timestamp, now)}</td>
                <td>
                  {e.holderName ?? (e.holderLocked ? <span className="muted">🔒 gesperrt</span> : <span className="muted">–</span>)}
                  {e.source === 'test' && <span className="badge badge-test">Test</span>}
                  {e.source === 'system' && <span className="badge badge-test">automatisch</span>}
                  {e.source === 'manual' && e.reason !== 'CORRECTION' && <span className="badge badge-test">manuell</span>}
                  {e.confirmedBy && e.outcome === 'granted' && (
                    <span className="badge badge-confirmed" title={e.confirmedBy === 'admin' ? 'vom Admin bestätigt' : 'vom Bediener bestätigt'}>
                      bestätigt
                    </span>
                  )}
                </td>
                <td>{e.cardNumber ?? <span className="muted">unbekannt</span>}</td>
                {!compact && <td>{group ? <GroupBadge group={group} /> : (e.groupName ?? '–')}</td>}
                <td>{directionText(e.direction)}</td>
                <td className="result-cell">
                  {e.reason === 'CORRECTION'
                    ? '↺ Korrektur'
                    : e.outcome === 'granted'
                      ? e.correctedBy
                        ? <span className="muted strike">✓ erfasst – rückgängig gemacht</span>
                        : '✓ erfasst'
                      : `✕ ${reasonText(e.reason)}`}
                </td>
                {onUndo && (
                  <td className="cell-action">
                    {e.seq !== undefined && undoable?.has(e.seq) && (
                      <button type="button" className="btn btn-small" title="Fehlbuchung rückgängig machen" onClick={() => onUndo(e.seq!)}>
                        ↺ Rückgängig
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > limit && (
        <div className="table-note">
          <span className="muted small">
            {limit} von {sorted.length} angezeigt
          </span>
          {onMore && (
            <button type="button" className="btn btn-small" onClick={onMore}>
              Weitere anzeigen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
