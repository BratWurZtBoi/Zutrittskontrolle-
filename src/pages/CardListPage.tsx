import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { GroupBadge } from '../components/GroupBadge';
import { HolderPhoto } from '../components/HolderPhoto';
import { StatusBadge } from '../components/StatusBadge';
import { MAX_CARDS, listCards } from '../db/cards';
import { db } from '../db/db';
import { listGroups } from '../db/groups';
import { seedTestCards } from '../db/seed';
import { holderName } from '../domain/texts';

type Assignment = 'all' | 'assigned' | 'free';

export function CardListPage() {
  const cards = useLiveQuery(listCards, []);
  const groups = useLiveQuery(listGroups, [], []);
  const presentIds = useLiveQuery(
    async () => new Set((await db.presence.where('status').equals('in').toArray()).map((p) => p.cardId)),
    [],
    new Set<string>(),
  );
  const [params, setParams] = useSearchParams();
  const groupFilter = params.get('gruppe') ?? '';
  const [assignment, setAssignment] = useState<Assignment>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cards ?? []).filter(({ card }) => {
      if (groupFilter && card.groupId !== groupFilter) return false;
      if (assignment === 'assigned' && !card.holder) return false;
      if (assignment === 'free' && card.holder) return false;
      if (!q) return true;
      const h = card.holder;
      return `${card.number} ${h?.firstName ?? ''} ${h?.lastName ?? ''} ${h?.company ?? ''}`.toLowerCase().includes(q);
    });
  }, [cards, groupFilter, assignment, query]);

  if (!cards) return null;

  const seed = async () => {
    setBusy(true);
    try {
      await seedTestCards();
    } finally {
      setBusy(false);
    }
  };

  const printIds = filtered.map(({ card }) => card.id).join(',');

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          Karten <span className="muted">({cards.length}/{MAX_CARDS})</span>
        </h1>
        <div className="button-row">
          <Link className="btn btn-primary" to={`/karten/neu${groupFilter ? `?gruppe=${groupFilter}` : ''}`}>
            + Karten erstellen
          </Link>
          {filtered.length > 0 && (
            <Link className="btn" to={`/druck?ids=${printIds}`}>
              Drucken ({filtered.length})
            </Link>
          )}
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="empty">
          <p>Noch keine Karten vorhanden.</p>
          <p className="muted">
            Zum Ausprobieren können fiktive Testkarten erzeugt werden: 9 Personalkarten und 5 Besucherkarten (davon 3 frei).
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void seed()}>
            Testkarten anlegen
          </button>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <input
              type="search"
              placeholder="Suchen: Nummer, Name, Firma …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              value={groupFilter}
              onChange={(e) => setParams(e.target.value ? { gruppe: e.target.value } : {}, { replace: true })}
              aria-label="Gruppe"
            >
              <option value="">Alle Gruppen</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select value={assignment} onChange={(e) => setAssignment(e.target.value as Assignment)} aria-label="Zuordnung">
              <option value="all">Zugeordnet und frei</option>
              <option value="assigned">Nur zugeordnet</option>
              <option value="free">Nur freie Karten</option>
            </select>
          </div>
          <ul className="card-list">
            {filtered.map(({ card, group }) => (
              <li key={card.id}>
                <Link to={`/karten/${card.id}`} className="card-row" style={{ borderLeftColor: group?.color }}>
                  <HolderPhoto holder={card.holder} fallback={group?.prefix} className="thumb" />
                  <div className="card-row-main">
                    <div className="card-row-title">
                      <strong>{card.number}</strong> {card.holder ? holderName(card.holder) : <span className="muted">frei</span>}
                    </div>
                    {card.holder?.company && <div className="muted">{card.holder.company}</div>}
                  </div>
                  <div className="card-row-badges">
                    <GroupBadge group={group} />
                    <StatusBadge card={card} group={group} />
                    {presentIds.has(card.id) && <span className="badge badge-present">anwesend</span>}
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
