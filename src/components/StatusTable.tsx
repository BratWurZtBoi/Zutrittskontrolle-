import { useNavigate } from 'react-router';
import { formatShortDateTime } from '../domain/dates';
import { sortStatusRows, type StatusRow, type StatusSortKey } from '../domain/overview';
import type { SortState } from '../hooks/useSort';
import { GroupBadge } from './GroupBadge';
import { HolderPhoto } from './HolderPhoto';
import { SortableTh } from './SortableTh';

interface Props {
  rows: StatusRow[];
  sort: SortState<StatusSortKey>;
  compact?: boolean;
  limit?: number;
}

/** Tabelle: wer ist anwesend, wer nicht – seit wann. Zeile antippen öffnet die Karte. */
export function StatusTable({ rows, sort, compact = false, limit }: Props) {
  const navigate = useNavigate();
  const sorted = sortStatusRows(rows, sort.key, sort.dir);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const now = new Date();

  if (rows.length === 0) return <p className="muted">Keine passenden Personen.</p>;

  return (
    <div className="table-wrap">
      <table className={compact ? 'data-table compact' : 'data-table'}>
        <thead>
          <tr>
            <SortableTh label="Status" sortKey="status" sort={sort} />
            <SortableTh label="Name" sortKey="name" sort={sort} />
            <SortableTh label="Karte" sortKey="card" sort={sort} />
            {!compact && <SortableTh label="Gruppe" sortKey="group" sort={sort} />}
            <SortableTh label="Seit / zuletzt" sortKey="time" sort={sort} />
          </tr>
        </thead>
        <tbody>
          {shown.map(({ card, group, present, lastBookingAt }) => (
            <tr key={card.id} className="clickable" onClick={() => navigate(`/karten/${card.id}`)}>
              <td>
                <span className={present ? 'status-dot present' : 'status-dot'} />
                <span className="status-text">{present ? 'anwesend' : 'abwesend'}</span>
              </td>
              <td>
                <div className="name-cell">
                  {!compact && <HolderPhoto holder={card.holder} fallback={group?.prefix} className="mini-photo" />}
                  <div>
                    <div className="cell-strong">{card.holder ? `${card.holder.lastName}, ${card.holder.firstName}` : 'frei'}</div>
                    {card.holder?.company && <div className="muted small">{card.holder.company}</div>}
                    {compact && <GroupBadge group={group} className="badge-small" />}
                  </div>
                </div>
              </td>
              <td>{card.number}</td>
              {!compact && (
                <td>
                  <GroupBadge group={group} />
                </td>
              )}
              <td>{lastBookingAt ? formatShortDateTime(lastBookingAt, now) : <span className="muted">–</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit && sorted.length > limit && <p className="muted small table-note">… und {sorted.length - limit} weitere</p>}
    </div>
  );
}
