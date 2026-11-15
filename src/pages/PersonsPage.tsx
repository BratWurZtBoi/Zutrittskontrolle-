import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PersonPhoto } from '../components/PersonPhoto';
import { StatusBadge } from '../components/StatusBadge';
import { db } from '../db/db';
import { MAX_PERSONS, listPersons } from '../db/persons';
import { seedTestPersons } from '../db/seed';

export function PersonsPage() {
  const persons = useLiveQuery(listPersons, []);
  const presentIds = useLiveQuery(
    async () => new Set((await db.presence.where('status').equals('in').toArray()).map((p) => p.personId)),
    [],
    new Set<string>(),
  );
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!persons || !q) return persons ?? [];
    return persons.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.personnelNo}`.toLowerCase().includes(q),
    );
  }, [persons, query]);

  if (!persons) return null;

  const seed = async () => {
    setBusy(true);
    try {
      await seedTestPersons();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          Personen <span className="muted">({persons.length}/{MAX_PERSONS})</span>
        </h1>
        <div className="button-row">
          <Link className="btn btn-primary" to="/personen/neu">
            + Neue Person
          </Link>
          {persons.length > 0 && (
            <Link className="btn" to="/ausweise">
              Ausweise drucken
            </Link>
          )}
        </div>
      </header>

      {persons.length === 0 ? (
        <div className="empty">
          <p>Noch keine Personen angelegt.</p>
          <p className="muted">Für den Test können 12 fiktive Personen mit Platzhalter-Fotos erzeugt werden.</p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void seed()}>
            Testpersonen anlegen
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            className="search"
            placeholder="Suchen nach Name oder ID …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="person-list">
            {filtered.map((p) => (
              <li key={p.id}>
                <Link to={`/personen/${p.id}`} className="person-row">
                  <PersonPhoto person={p} className="thumb" />
                  <div className="person-row-main">
                    <div className="person-row-name">
                      {p.lastName}, {p.firstName}
                    </div>
                    <div className="muted">ID {p.personnelNo}</div>
                  </div>
                  <div className="person-row-badges">
                    <StatusBadge person={p} />
                    {presentIds.has(p.id) && <span className="badge badge-present">anwesend</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {filtered.length === 0 && <p className="muted">Keine Treffer.</p>}
        </>
      )}
    </div>
  );
}
