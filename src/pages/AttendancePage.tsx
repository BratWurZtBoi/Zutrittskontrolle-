import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router';
import { PersonPhoto } from '../components/PersonPhoto';
import { listPresentPersons, listRecentEvents } from '../db/scans';
import { formatDateTime, formatTime } from '../domain/dates';
import { directionText, reasonText } from '../domain/texts';

type Filter = 'all' | 'granted' | 'denied';

export function AttendancePage() {
  const present = useLiveQuery(listPresentPersons, [], []);
  const events = useLiveQuery(() => listRecentEvents(200), [], []);
  const [filter, setFilter] = useState<Filter>('all');
  const shown = filter === 'all' ? events : events.filter((e) => e.outcome === filter);

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
          {present.map(({ person, since }) => (
            <li key={person.id}>
              <Link to={`/personen/${person.id}`} className="present-item">
                <PersonPhoto person={person} className="thumb" />
                <div>
                  <div className="person-row-name">
                    {person.firstName} {person.lastName}
                  </div>
                  <div className="muted">seit {formatTime(since)} Uhr</div>
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
                <th>Person</th>
                <th>Richtung</th>
                <th>Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.seq} className={e.outcome === 'denied' ? 'row-denied' : ''}>
                  <td>{formatDateTime(e.timestamp)}</td>
                  <td>
                    {e.personName ?? <span className="muted">unbekannt</span>}
                    {e.personnelNo && <span className="muted"> · {e.personnelNo}</span>}
                    {e.source === 'test' && <span className="badge badge-test">Test</span>}
                  </td>
                  <td>{directionText(e.direction)}</td>
                  <td>{e.outcome === 'granted' ? '✓ erfasst' : `✕ ${reasonText(e.reason)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Es werden die letzten 200 Einträge angezeigt.</p>
    </div>
  );
}
