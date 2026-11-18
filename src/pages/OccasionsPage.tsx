import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { OccasionForm } from '../components/occasion/OccasionForm';
import { createOccasion, createSampleOccasion, listOccasions, newOccasionDefaults, type OccasionInput } from '../db/occasions';
import { formatIsoDate, toLocalDateString } from '../domain/dates';
import { useSettings } from '../hooks/useSettings';

/**
 * Veranstaltungen (einmalige Events): Liste. Einladungen gelten nur einmal; der Einlass
 * wird je Gerät gestartet und läuft getrennt von der normalen Zutrittskontrolle.
 */
export function OccasionsPage() {
  const occasions = useLiveQuery(listOccasions, []);
  const { activeOccasionId } = useSettings();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!occasions) return null;
  const today = toLocalDateString(new Date());

  const sample = async () => {
    setBusy(true);
    setError(null);
    try {
      navigate(`/veranstaltungen/${(await createSampleOccasion()).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Veranstaltungen</h1>
        <div className="button-row">
          <Link className="btn btn-primary" to="/veranstaltungen/neu">
            + Neue Veranstaltung
          </Link>
        </div>
      </header>
      <p className="muted">
        Für einmalige Events: Gästeliste anlegen, Einladungen mit QR-Code verteilen, am Veranstaltungstag den Einlass starten. Jeder
        Code gilt nur einmal. Die normale Zutrittskontrolle bleibt davon getrennt.
      </p>
      {error && <p className="form-error">{error}</p>}
      {occasions.length === 0 ? (
        <div className="empty">
          <p>Noch keine Veranstaltung angelegt.</p>
          <p className="muted">Zum Ausprobieren gibt es eine Beispielveranstaltung mit fiktiven Gästen.</p>
          <button type="button" className="btn" disabled={busy} onClick={() => void sample()}>
            Beispielveranstaltung anlegen
          </button>
        </div>
      ) : (
        <ul className="occasion-list">
          {occasions.map((o) => (
            <li key={o.id}>
              <Link to={`/veranstaltungen/${o.id}`} className="occasion-row">
                <span className="occasion-color" style={{ background: o.color }} />
                <span className="occasion-row-main">
                  <strong>{o.name}</strong>
                  <span className="muted">
                    {formatIsoDate(o.date)}
                    {o.date === today ? ' (heute)' : ''}
                    {o.location ? ` · ${o.location}` : ''}
                  </span>
                </span>
                <span className="occasion-row-stats">
                  {o.guests} Gäste · {o.admitted} eingelassen
                </span>
                {o.id === activeOccasionId && <span className="badge occasion-live">Einlass läuft</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Neue Veranstaltung anlegen. */
export function OccasionCreatePage() {
  const navigate = useNavigate();
  const [initial, setInitial] = useState<OccasionInput>();
  useEffect(() => {
    void newOccasionDefaults().then(setInitial);
  }, []);
  if (!initial) return null;
  return (
    <div className="page">
      <header className="page-header">
        <h1>Neue Veranstaltung</h1>
        <Link className="btn btn-ghost" to="/veranstaltungen">
          Zurück
        </Link>
      </header>
      <OccasionForm
        initial={initial}
        submitLabel="Anlegen"
        onSubmit={async (input) => navigate(`/veranstaltungen/${(await createOccasion(input)).id}`, { replace: true })}
        onCancel={() => navigate('/veranstaltungen')}
      />
    </div>
  );
}
