import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { GroupBadge } from '../components/GroupBadge';
import { HolderPhoto } from '../components/HolderPhoto';
import { StatusBadge } from '../components/StatusBadge';
import { UnassignedList } from '../components/UnassignedList';
import { MAX_CARDS, deleteCards, listCards, returnCards, setCardsBlocked } from '../db/cards';
import { db } from '../db/db';
import { listGroups } from '../db/groups';
import { seedTestCards } from '../db/seed';
import { countUnassigned } from '../db/unassigned';
import { holderName } from '../domain/texts';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';

type Assignment = 'all' | 'assigned' | 'free' | 'lost';

export function CardListPage() {
  const cards = useSecureLiveQuery(listCards, []);
  const groups = useLiveQuery(listGroups, [], []);
  const presentIds = useLiveQuery(
    async () => new Set((await db.presence.where('status').equals('in').toArray()).map((p) => p.cardId)),
    [],
    new Set<string>(),
  );
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const groupFilter = params.get('gruppe') ?? '';
  // Reiter: Karten oder „Nicht zugeordnet“ (Personen aus dem Import ohne Gruppe)
  const view = params.get('ansicht') === 'nicht-zugeordnet' ? 'unassigned' : 'cards';
  const unassignedCount = useLiveQuery(countUnassigned, [], 0);
  const [assignment, setAssignment] = useState<Assignment>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cards ?? []).filter(({ card }) => {
      if (groupFilter && card.groupId !== groupFilter) return false;
      if (assignment === 'assigned' && !card.hasHolder) return false;
      if (assignment === 'free' && (card.hasHolder || card.lostAt)) return false;
      if (assignment === 'lost' && !card.lostAt) return false;
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

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const allVisibleSelected = filtered.length > 0 && filtered.every(({ card }) => selected.has(card.id));
  const toggleAllVisible = () => {
    const next = new Set(selected);
    for (const { card } of filtered) {
      if (allVisibleSelected) next.delete(card.id);
      else next.add(card.id);
    }
    setSelected(next);
  };
  const endSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const ids = [...selected];
  const selectedCards = cards.filter(({ card }) => selected.has(card.id));
  const withHolder = selectedCards.filter(({ card }) => card.hasHolder).length;

  const runBulk = async (confirmText: string, action: () => Promise<number>, done: (n: number) => string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const n = await action();
      setMessage(done(n));
      setSelected(new Set());
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
          <Link className="btn" to="/karten/import">
            CSV-Import
          </Link>
          {view === 'cards' && filtered.length > 0 && !selecting && (
            <Link className="btn" to={`/druck?ids=${printIds}`}>
              Drucken ({filtered.length})
            </Link>
          )}
          {view === 'cards' && cards.length > 0 && (
            <button type="button" className={selecting ? 'btn btn-primary' : 'btn'} onClick={() => (selecting ? endSelection() : setSelecting(true))}>
              {selecting ? 'Auswahl beenden' : 'Auswählen'}
            </button>
          )}
        </div>
      </header>

      {(unassignedCount > 0 || view === 'unassigned') && (
        <div className="tabs card-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'cards'}
            className={view === 'cards' ? 'tab active' : 'tab'}
            onClick={() => setParams({}, { replace: true })}
          >
            Karten <span className="count-pill">{cards.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'unassigned'}
            className={view === 'unassigned' ? 'tab active' : 'tab'}
            onClick={() => {
              endSelection();
              setParams({ ansicht: 'nicht-zugeordnet' }, { replace: true });
            }}
          >
            Nicht zugeordnet <span className={unassignedCount > 0 ? 'count-pill count-denied' : 'count-pill'}>{unassignedCount}</span>
          </button>
        </div>
      )}

      {message && view === 'cards' && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}

      {view === 'unassigned' ? (
        <UnassignedList groups={groups} />
      ) : cards.length === 0 ? (
        <div className="empty">
          <p>Noch keine Karten vorhanden.</p>
          <p className="muted">
            Zum Ausprobieren können fiktive Testkarten erzeugt werden: 9 Personalkarten und 5 Besucherkarten (davon 3 frei).
            Oder eine Personenliste per <Link to="/karten/import">CSV-Import</Link> einlesen.
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
              aria-label="Karten suchen"
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
              <option value="lost">Nur verlorene Karten</option>
            </select>
          </div>

          {selecting && (
            <div className="selection-bar" role="toolbar" aria-label="Aktionen für ausgewählte Karten">
              <label className="checkbox-inline">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                Alle angezeigten ({filtered.length})
              </label>
              <strong className="selection-count">{selected.size} ausgewählt</strong>
              <div className="button-row">
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy || withHolder === 0}
                  onClick={() =>
                    void runBulk(
                      `Personendaten von ${withHolder} Karte(n) entfernen? Anwesende werden ausgebucht, die Karten sind danach frei.`,
                      () => returnCards(ids),
                      (n) => `Personendaten von ${n} Karte(n) entfernt.`,
                    )
                  }
                >
                  Personendaten entfernen
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy || selected.size === 0}
                  onClick={() => void runBulk(`${selected.size} Karte(n) sperren?`, () => setCardsBlocked(ids, true), (n) => `${n} Karte(n) gesperrt.`)}
                >
                  Sperren
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy || selected.size === 0}
                  onClick={() => void runBulk(`${selected.size} Karte(n) entsperren?`, () => setCardsBlocked(ids, false), (n) => `${n} Karte(n) entsperrt.`)}
                >
                  Entsperren
                </button>
                <button type="button" className="btn btn-small" disabled={selected.size === 0} onClick={() => navigate(`/druck?ids=${ids.join(',')}`)}>
                  Drucken
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  disabled={busy || selected.size === 0}
                  onClick={() =>
                    void runBulk(
                      `${selected.size} Karte(n) endgültig löschen? Gedruckte Karten werden damit ungültig. Das Protokoll bleibt erhalten.`,
                      () => deleteCards(ids),
                      (n) => `${n} Karte(n) gelöscht.`,
                    )
                  }
                >
                  Löschen
                </button>
              </div>
            </div>
          )}

          <ul className="card-list">
            {filtered.map(({ card, group }) => {
              const content = (
                <>
                  {selecting && (
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={selected.has(card.id)}
                      onChange={() => toggle(card.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Karte ${card.number} auswählen`}
                    />
                  )}
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
                </>
              );
              return (
                <li key={card.id}>
                  {selecting ? (
                    <div
                      className={selected.has(card.id) ? 'card-row selectable selected' : 'card-row selectable'}
                      style={{ borderLeftColor: group?.color }}
                      onClick={() => toggle(card.id)}
                    >
                      {content}
                    </div>
                  ) : (
                    <Link to={`/karten/${card.id}`} className="card-row" style={{ borderLeftColor: group?.color }}>
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          {filtered.length === 0 && <p className="muted">Keine Treffer.</p>}
        </>
      )}
    </div>
  );
}
