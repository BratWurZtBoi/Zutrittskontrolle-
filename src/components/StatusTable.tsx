import { useNavigate } from 'react-router';
import { formatShortDateTime } from '../domain/dates';
import { sortStatusRows, type StatusRow, type StatusSortKey } from '../domain/overview';
import { holderListName, holderUnitLine } from '../domain/texts';
import type { SortState } from '../hooks/useSort';
import { GroupBadge } from './GroupBadge';
import { GroupBarCell } from './GroupBar';
import { HolderPhoto } from './HolderPhoto';
import { SortableTh } from './SortableTh';

interface Props {
  rows: StatusRow[];
  sort: SortState<StatusSortKey>;
  /** Kompakt (Dashboard): eine Zeile pro Person, Gruppe als Farbbalken. */
  compact?: boolean;
  /** Nur kompakt: Statusspalte zeigen (sinnvoll, wenn auch Abwesende gelistet sind). */
  showStatus?: boolean;
  /** Zeile antippen öffnet die Karte (Standard; für Bediener abgeschaltet). */
  linkRows?: boolean;
  /** Nur kompakt: Schaltfläche „Einbuchen“/„Ausbuchen“ je Zeile (Karte vergessen). */
  onBook?: (row: StatusRow) => void;
  /** Nur kompakt: „Zurückgeben“ für Besucherkarten (Gruppen ohne Namensdruck). */
  onReturn?: (row: StatusRow) => void;
  limit?: number;
}

function nameText(row: StatusRow) {
  const { card } = row;
  if (card.holder) return <span className="cell-strong">{holderListName(card.holder)}</span>;
  if (card.hasHolder) return <span className="muted">🔒 Name gesperrt</span>;
  return <span className="muted">Karte ohne Person</span>;
}

/** Tabelle: wer ist anwesend, wer nicht – seit wann. Zeile antippen öffnet die Karte. */
export function StatusTable({ rows, sort, compact = false, showStatus = true, linkRows = true, onBook, onReturn, limit }: Props) {
  const navigate = useNavigate();
  const rowProps = (cardId: string) =>
    linkRows ? { className: 'clickable', onClick: () => navigate(`/karten/${cardId}`) } : {};
  const sorted = sortStatusRows(rows, sort.key, sort.dir);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const now = new Date();

  if (rows.length === 0) return <p className="muted empty-note">Keine passenden Personen.</p>;

  if (compact) {
    return (
      <div className="table-wrap">
        <table className="data-table compact one-line">
          <thead>
            <tr>
              <th aria-label="Gruppe" className="group-bar-cell" />
              <SortableTh label="Name" sortKey="name" sort={sort} />
              <SortableTh label="Raum" sortKey="room" sort={sort} className="col-optional" />
              <SortableTh label="Karte" sortKey="card" sort={sort} />
              {showStatus && <SortableTh label="Status" sortKey="status" sort={sort} />}
              <SortableTh label="Seit / zuletzt" sortKey="time" sort={sort} />
              {onBook && <th className="th-plain" aria-label="Buchen" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.card.id} {...rowProps(row.card.id)}>
                <GroupBarCell group={row.group} />
                <td>{nameText(row)}</td>
                <td className="muted cell-ellipsis col-optional">{row.card.holder?.room ?? ''}</td>
                <td>{row.card.number}</td>
                {showStatus && (
                  <td>
                    <span className={row.present ? 'status-dot present' : 'status-dot'} />
                    <span className="status-text">{row.present ? 'anwesend' : 'abwesend'}</span>
                  </td>
                )}
                <td>{row.lastBookingAt ? formatShortDateTime(row.lastBookingAt, now) : <span className="muted">–</span>}</td>
                {onBook && (
                  <td className="cell-action">
                    <button
                      type="button"
                      className="btn btn-small"
                      title={row.present ? 'Manuell ausbuchen' : 'Manuell einbuchen (z. B. Karte vergessen)'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBook(row);
                      }}
                    >
                      {row.present ? 'Ausbuchen' : 'Einbuchen'}
                    </button>
                    {onReturn && row.card.hasHolder && row.group && !row.group.printHolder && (
                      <button
                        type="button"
                        className="btn btn-small"
                        title="Ausbuchen und Personendaten entfernen – die Karte ist danach frei"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReturn(row);
                        }}
                      >
                        Zurückgeben
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {limit && sorted.length > limit && <p className="muted small table-note">… und {sorted.length - limit} weitere</p>}
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <SortableTh label="Status" sortKey="status" sort={sort} />
            <SortableTh label="Name" sortKey="name" sort={sort} />
            <SortableTh label="Raum" sortKey="room" sort={sort} />
            <SortableTh label="Karte" sortKey="card" sort={sort} />
            <SortableTh label="Gruppe" sortKey="group" sort={sort} />
            <SortableTh label="Seit / zuletzt" sortKey="time" sort={sort} />
          </tr>
        </thead>
        <tbody>
          {shown.map(({ card, group, present, lastBookingAt }) => (
            <tr key={card.id} {...rowProps(card.id)}>
              <td>
                <span className={present ? 'status-dot present' : 'status-dot'} />
                <span className="status-text">{present ? 'anwesend' : 'abwesend'}</span>
              </td>
              <td>
                <div className="name-cell">
                  <HolderPhoto holder={card.holder} fallback={group?.prefix} className="mini-photo" />
                  <div>
                    <div className="cell-strong">{card.holder ? holderListName(card.holder) : 'frei'}</div>
                    {holderUnitLine(card.holder) && <div className="muted small">{holderUnitLine(card.holder)}</div>}
                  </div>
                </div>
              </td>
              <td>{card.holder?.room ?? ''}</td>
              <td>{card.number}</td>
              <td>
                <GroupBadge group={group} />
              </td>
              <td>{lastBookingAt ? formatShortDateTime(lastBookingAt, now) : <span className="muted">–</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit && sorted.length > limit && <p className="muted small table-note">… und {sorted.length - limit} weitere</p>}
    </div>
  );
}
