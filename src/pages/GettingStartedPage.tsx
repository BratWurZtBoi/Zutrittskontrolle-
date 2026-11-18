import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { SetupProgressBar } from '../components/setup/SetupCard';
import { saveSettings } from '../db/settings';
import { toggleManualStep } from '../domain/gettingStarted';
import { useSetupStatus } from '../hooks/useSetup';

/** „Erste Schritte“: Checkliste für die Einrichtung (Admin). Erkanntes wird automatisch abgehakt. */
export function GettingStartedPage() {
  const status = useSetupStatus();
  // Häkchen sofort zeigen – die Liste aktualisiert sich erst nach dem Speichern
  const [pending, setPending] = useState<Record<string, boolean>>({});
  useEffect(() => setPending({}), [status]);
  if (!status) return null;
  const { states, progress, manualDone } = status;
  const hidden = pending.hidden ?? status.hidden;
  const toggle = (id: Parameters<typeof toggleManualStep>[1], done: boolean) => {
    setPending((p) => ({ ...p, [id]: done }));
    void saveSettings({ setupDone: toggleManualStep(manualDone, id, done) });
  };

  return (
    <div className="page setup-page">
      <header className="page-header">
        <h1>Erste Schritte</h1>
      </header>
      <p className="muted">
        Checkliste für die Einrichtung. Was die App erkennen kann, hakt sie selbst ab – den Rest von Hand. Zu jedem Schritt gibt es
        eine Anleitung.
      </p>
      <div className="setup-summary">
        <strong>
          {progress.complete ? '✓ Alles Wichtige ist eingerichtet.' : `${progress.done} von ${progress.total} Schritten erledigt`}
        </strong>
        <SetupProgressBar progress={progress} />
      </div>
      <ol className="setup-list">
        {states.map(({ step, done, detected }) => (
          <li key={step.id} className={done ? 'setup-step done' : 'setup-step'}>
            <label className="setup-check">
              <input
                type="checkbox"
                checked={detected || (pending[step.id] ?? done)}
                disabled={detected}
                onChange={(e) => toggle(step.id, e.target.checked)}
              />
              <span className="setup-step-title">
                {step.title}
                {step.optional && <span className="badge setup-optional">optional</span>}
              </span>
            </label>
            <p className="setup-step-desc">{step.description}</p>
            {step.detectHint && (
              <p className="muted small setup-step-detect">{detected ? '✓ automatisch erkannt' : `Wird automatisch abgehakt: ${step.detectHint}.`}</p>
            )}
            <div className="setup-step-links">
              <Link to={step.to}>{step.linkLabel} →</Link>
              <Link to={`/hilfe?thema=${step.helpTopic}`}>Anleitung</Link>
            </div>
          </li>
        ))}
      </ol>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!hidden}
          onChange={(e) => {
            setPending((p) => ({ ...p, hidden: !e.target.checked }));
            void saveSettings({ setupHidden: !e.target.checked });
          }}
        />
        Auf dem Dashboard anzeigen, solange noch etwas offen ist
      </label>
    </div>
  );
}
