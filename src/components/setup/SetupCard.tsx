import { Link } from 'react-router';
import { saveSettings } from '../../db/settings';
import type { SetupProgress } from '../../domain/gettingStarted';
import { useSetupStatus } from '../../hooks/useSetup';

/** Fortschrittsbalken „x von y“ (Pflichtschritte). */
export function SetupProgressBar({ progress }: { progress: SetupProgress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;
  return (
    <div
      className="setup-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
      aria-label={`${progress.done} von ${progress.total} Schritten erledigt`}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Dashboard (Admin): kompakte Karte mit dem nächsten offenen Schritt – verschwindet, wenn alles erledigt ist. */
export function SetupCard() {
  const status = useSetupStatus();
  if (!status || status.hidden || status.progress.complete) return null;
  const { progress } = status;
  const next = progress.next;
  return (
    <section className="setup-card" aria-label="Erste Schritte">
      <div className="setup-card-head">
        <strong>Erste Schritte</strong>
        <span className="muted small">
          {progress.done} von {progress.total} erledigt
        </span>
        <button
          type="button"
          className="setup-card-hide"
          aria-label="Erste Schritte ausblenden"
          title="Ausblenden – die Liste bleibt unter Hilfe → Erste Schritte erreichbar"
          onClick={() => void saveSettings({ setupHidden: true })}
        >
          ×
        </button>
      </div>
      <SetupProgressBar progress={progress} />
      {next && (
        <p className="setup-card-next">
          Als Nächstes: <strong>{next.title}</strong>
        </p>
      )}
      <div className="button-row">
        {next && (
          <Link className="btn btn-small btn-primary" to={next.to} title={next.linkLabel}>
            Weiter →
          </Link>
        )}
        <Link className="btn btn-small" to="/erste-schritte">
          Alle Schritte
        </Link>
      </div>
    </section>
  );
}
