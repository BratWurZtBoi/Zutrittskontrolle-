import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { listFreeCards } from '../db/cards';
import { assignUnassigned, deleteUnassigned, listUnassigned, type AssignUnassignedResult } from '../db/unassigned';
import { formatIsoDate } from '../domain/dates';
import { holderName, holderUnitLine } from '../domain/texts';
import { holderSearchText } from '../domain/overview';
import type { Group } from '../domain/types';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';

interface Done {
  result: AssignUnassignedResult;
  group: Group;
  requested: number;
}

/**
 * Reiter „Nicht zugeordnet“ (Karten-Seite): Personen aus dem Import ohne Gruppe.
 * Auswählen → Gruppe wählen → „Zuordnen“: jede Person bekommt eine freie Karte der
 * Gruppe, sonst eine neue.
 */
export function UnassignedList({ groups }: { groups: Group[] }) {
  const people = useSecureLiveQuery(listUnassigned, []);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const freeCount = useLiveQuery(async () => (groupId ? (await listFreeCards(groupId)).length : 0), [groupId], 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter((p) => {
      if (!q) return true;
      const h = p.holder;
      return `${holderSearchText(h)} ${p.groupHint ?? ''}`.toLowerCase().includes(q);
    });
  }, [people, query]);

  if (!people) return null;
  const locked = people.some((p) => !p.holder);

  // nur noch vorhandene Personen zählen (nach Zuordnen/Löschen)
  const ids = people.filter((p) => selected.has(p.id)).map((p) => p.id);
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const toggleAllVisible = () => {
    const next = new Set(selected);
    for (const p of filtered) {
      if (allVisibleSelected) next.delete(p.id);
      else next.add(p.id);
    }
    setSelected(next);
  };
  const group = groups.find((g) => g.id === groupId);
  const newCards = Math.max(0, ids.length - freeCount);

  const assign = async () => {
    if (!group || ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await assignUnassigned(ids, group.id);
      setDone({ result, group, requested: ids.length });
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zuordnen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length} Person(en) endgültig aus „Nicht zugeordnet“ löschen?`)) return;
    setBusy(true);
    try {
      await deleteUnassigned(ids);
      setSelected(new Set());
      setDone(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Nicht zugeordnete Personen">
      <p className="muted">
        Personen aus dem CSV-Import ohne (bekannte) Gruppe. Sie haben noch keine Karte. Auswählen, Gruppe wählen und
        „Zuordnen“ – jede Person bekommt eine freie Karte der Gruppe, sonst wird eine neue angelegt.
      </p>

      {done && (
        <div className="form-success" role="status">
          <p>
            {done.result.assigned.length} Person(en) der Gruppe „{done.group.name}“ zugeordnet:{' '}
            {done.result.assigned.map((a) => `${a.name} → ${a.number}`).join(', ')}
            {done.result.created > 0 && ` (${done.result.created} neue Karte(n))`}.
            {done.result.assigned.length < done.requested && ' Einige Karten waren inzwischen vergeben – bitte erneut zuordnen.'}
          </p>
          {done.result.assigned.length > 0 && (
            <Link className="btn btn-small" to={`/druck?ids=${done.result.assigned.map((a) => a.cardId).join(',')}`}>
              Diese Karten drucken
            </Link>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {people.length === 0 ? (
        <div className="empty">
          <p>Keine nicht zugeordneten Personen.</p>
          <p className="muted">
            Beim <Link to="/karten/import">CSV-Import</Link> landen Zeilen ohne oder mit unbekannter Gruppe hier.
          </p>
        </div>
      ) : locked ? (
        <p className="form-error">Die Daten sind gesperrt – Namen werden erst nach dem Entsperren angezeigt.</p>
      ) : (
        <>
          <div className="filter-bar">
            <input type="search" placeholder="Suchen: Name, Dienstgrad, Einheit …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Personen suchen" />
          </div>

          <div className="selection-bar unassigned-bar" role="toolbar" aria-label="Aktionen für ausgewählte Personen">
            <label className="checkbox-inline">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
              Alle angezeigten ({filtered.length})
            </label>
            <strong className="selection-count">{ids.length} ausgewählt</strong>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Gruppe für die Zuordnung">
              <option value="">Gruppe wählen …</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-small btn-primary" disabled={busy || !group || ids.length === 0} onClick={() => void assign()}>
              Zuordnen
            </button>
            <button type="button" className="btn btn-small btn-danger" disabled={busy || ids.length === 0} onClick={() => void remove()}>
              Löschen
            </button>
            {group && ids.length > 0 && (
              <span className="muted small unassigned-hint">
                {Math.min(ids.length, freeCount)} freie Karte(n) von „{group.name}“
                {newCards > 0 && `, ${newCards} neue Karte(n) werden angelegt`}
              </span>
            )}
          </div>

          <ul className="card-list">
            {filtered.map((p) => (
              <li key={p.id}>
                <div className={selected.has(p.id) ? 'card-row selectable selected' : 'card-row selectable'} onClick={() => toggle(p.id)}>
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${holderName(p.holder)} auswählen`}
                  />
                  <div className="card-row-main">
                    <div className="card-row-title">
                      <strong>{holderName(p.holder)}</strong>
                    </div>
                    {holderUnitLine(p.holder) && <div className="muted">{holderUnitLine(p.holder)}</div>}
                    {p.holder?.note && <div className="muted small">Notiz: {p.holder.note}</div>}
                  </div>
                  <div className="card-row-badges">
                    {p.groupHint && <span className="badge badge-test">Gruppe „{p.groupHint}“ unbekannt</span>}
                    {(p.validFrom || p.validUntil) && (
                      <span className="badge">
                        gültig {formatIsoDate(p.validFrom) || '…'} – {formatIsoDate(p.validUntil) || '…'}
                      </span>
                    )}
                    {!p.accessGranted && <span className="badge badge-no-permission">kein Zutritt</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {filtered.length === 0 && <p className="muted">Keine Treffer.</p>}
        </>
      )}
    </section>
  );
}
