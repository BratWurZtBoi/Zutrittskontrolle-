import { useLiveQuery } from 'dexie-react-hooks';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';
import { useState } from 'react';
import { Link } from 'react-router';
import { GroupBadge } from '../components/GroupBadge';
import { HolderPhoto } from '../components/HolderPhoto';
import { listGroups } from '../db/groups';
import { listPresentCards, listRecentEvents } from '../db/scans';
import { formatDateTime, formatTime } from '../domain/dates';
import { directionText, holderName, reasonText } from '../domain/texts';

type Filter = 'all' | 'granted' | 'denied';

export function AttendancePage() {
  const present = useSecureLiveQuery(listPresentCards, [], []);
  const events = useSecureLiveQuery(() => listRecentEvents(200), [], []);
  const groups = useLiveQuery(listGroups, [], []);
  const [filter, setFilter] = useState<Filter>('all');
  const shown = filter === 'all' ? events : events.filter((e) => e.outcome === filter);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          Anwesend <span className="muted">({present.length})</span>
        </h1>
      </header>
      {present.length === 0 ? (
        <p className="muted">Derzeit ist niemand eingebucht.</p>
      ) : (
        <ul className="present-grid">
          {present.map(({ card, group, since }) => (
            <li key={card.id}>
              <Link to={`/karten/${card.id}`} className="present-item" style={{ borderLeftColor: group?.color }}>
                <HolderPhoto holder={card.holder} fallback={group?.prefix} className="thumb" />
                <div>
                  <div className="card-row-title">{card.holder ? holderName(card.holder) : `Karte ${card.number}`}</div>
                  <div className="muted">
                    {card.number} · seit {formatTime(since)} Uhr
                  </div>
                  <GroupBadge group={group} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <header className="page-header">
        <h2>Zutrittshistorie</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter">
          <option value="all">Alle Buchungen</option>
          <option value="granted">Nur erfolgreiche</option>
          <option value="denied">Nur abgewiesene</option>
        </select>
      </header>
      {shown.length === 0 ? (
        <p className="muted">Noch keine Einträge.</p>
      ) : (
        <div className="table-wrap">
          <table className="events">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Karte / Person</th>
                <th>Gruppe</th>
                <th>Richtung</th>
                <th>Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const group = e.groupId ? groupById.get(e.groupId) : undefined;
                return (
                  <tr key={e.seq} className={e.outcome === 'denied' ? 'row-denied' : ''}>
                    <td>{formatDateTime(e.timestamp)}</td>
                    <td>
                      {e.cardNumber ? <strong>{e.cardNumber}</strong> : <span className="muted">unbekannt</span>}
                      {e.holderName && <span> {e.holderName}</span>}
                      {e.source === 'test' && <span className="badge badge-test">Test</span>}
                      {e.source === 'system' && <span className="badge badge-test">automatisch</span>}
                    </td>
                    <td>{group ? <GroupBadge group={group} /> : (e.groupName ?? '–')}</td>
                    <td>{directionText(e.direction)}</td>
                    <td>{e.outcome === 'granted' ? '✓ erfasst' : `✕ ${reasonText(e.reason)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Es werden die letzten 200 Einträge angezeigt. Eine ausführliche Übersicht mit Filtern folgt.</p>
    </div>
  );
}
