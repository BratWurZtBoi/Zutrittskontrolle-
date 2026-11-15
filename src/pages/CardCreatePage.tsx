import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { GroupBadge } from '../components/GroupBadge';
import { MAX_BATCH, createCards, suggestNumbers } from '../db/cards';
import { ValidationError } from '../db/db';
import { listGroups } from '../db/groups';
import type { Card } from '../domain/types';

export function CardCreatePage() {
  const [params] = useSearchParams();
  const groups = useLiveQuery(listGroups, []);
  const [groupId, setGroupId] = useState(params.get('gruppe') ?? '');
  const [count, setCount] = useState(1);
  const [number, setNumber] = useState('');
  const [preview, setPreview] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Card[] | null>(null);

  // erste Gruppe vorauswählen
  useEffect(() => {
    if (!groupId && groups?.[0]) setGroupId(groups[0].id);
  }, [groups, groupId]);

  // Vorschau der Kartennummern
  useEffect(() => {
    if (!groupId) return;
    const n = Math.min(Math.max(count, 1), MAX_BATCH);
    void suggestNumbers(groupId, n).then((nums) => {
      setPreview(nums);
      setNumber(nums[0] ?? '');
    });
  }, [groupId, count, created]);

  if (!groups) return null;
  const group = groups.find((g) => g.id === groupId);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const cards = await createCards({ groupId, count, number: count === 1 && number !== preview[0] ? number : undefined });
      setCreated(cards);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Erstellen fehlgeschlagen.');
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Karten erstellen</h1>
        <Link className="btn btn-ghost" to="/karten">
          Zurück
        </Link>
      </header>

      {created ? (
        <div className="card success-box">
          <h2>
            {created.length === 1 ? `Karte ${created[0]?.number} erstellt` : `${created.length} Karten erstellt`}
          </h2>
          {created.length > 1 && (
            <p className="muted">
              {created[0]?.number} bis {created[created.length - 1]?.number}
            </p>
          )}
          <div className="button-row">
            <Link className="btn btn-primary" to={`/druck?ids=${created.map((c) => c.id).join(',')}`}>
              Jetzt drucken
            </Link>
            {created.length === 1 && created[0] && (
              <Link className="btn" to={`/karten/${created[0].id}`}>
                Person zuweisen
              </Link>
            )}
            <button type="button" className="btn" onClick={() => setCreated(null)}>
              Weitere Karten erstellen
            </button>
            <Link className="btn btn-ghost" to={`/karten?gruppe=${groupId}`}>
              Zur Kartenliste
            </Link>
          </div>
        </div>
      ) : (
        <form className="card form" onSubmit={(e) => void onSubmit(e)}>
          <p className="muted">
            Karten werden zunächst ohne Personendaten erstellt. Personen können danach jederzeit zugewiesen und geändert
            werden.
          </p>
          <label>
            Gruppe
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.prefix})
                </option>
              ))}
            </select>
          </label>
          {group && (
            <p>
              <GroupBadge group={group} />{' '}
              <span className="muted">
                {group.printHolder ? 'Name und Foto werden auf die Karte gedruckt.' : 'Ohne Name und Foto auf der Karte.'}
              </span>
            </p>
          )}
          <div className="form-grid">
            <label>
              Anzahl
              <input
                type="number"
                min={1}
                max={MAX_BATCH}
                value={count}
                onChange={(e) => setCount(Math.min(MAX_BATCH, Math.max(1, Math.round(e.target.valueAsNumber || 1))))}
              />
            </label>
            {count === 1 && (
              <label>
                Kartennummer
                <input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={20} required />
              </label>
            )}
          </div>
          {count > 1 && preview.length > 0 && (
            <p>
              Es werden die Karten <strong>{preview[0]}</strong> bis <strong>{preview[preview.length - 1]}</strong> erstellt.
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={!groupId}>
            {count === 1 ? 'Karte erstellen' : `${count} Karten erstellen`}
          </button>
        </form>
      )}
    </div>
  );
}
