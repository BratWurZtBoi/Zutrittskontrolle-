import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { PasswordInput } from '../components/PasswordInput';
import { loadOperatorPin } from '../db/vault';
import { isStaffPath } from '../lib/roles';
import { login, loginOperator } from '../security/session';
import { useSecurity } from '../security/useSecurity';

type LoginKind = 'admin' | 'operator';

/**
 * Anmeldung: Admin-Passwort (entsperrt zugleich die Personendaten) oder
 * Bediener-PIN (nur Dashboard und Übersicht, Daten müssen entsperrt sein).
 */
export function LoginPage() {
  const security = useSecurity();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get('ziel') || '';
  const hasPin = useLiveQuery(async () => Boolean(await loadOperatorPin()), [], undefined);
  const staffTarget = !requested || isStaffPath(requested);
  // Bediener-Anmeldung vorschlagen, wenn möglich und die Zielseite dafür freigegeben ist
  const operatorPossible = Boolean(hasPin) && security.vault === 'unlocked' && staffTarget && !security.operator;
  const [chosen, setChosen] = useState<LoginKind | null>(null);
  const kind: LoginKind = chosen ?? (operatorPossible ? 'operator' : 'admin');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (security.vault === 'loading' || hasPin === undefined) return null;
  if (security.vault === 'setup') return <Navigate to={`/einrichtung?ziel=${encodeURIComponent(requested || '/dashboard')}`} replace />;
  if (security.admin) return <Navigate to={requested || '/dashboard'} replace />;
  if (security.operator && staffTarget) return <Navigate to={requested || '/dashboard'} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (kind === 'admin') {
        await login(secret);
        navigate(requested || '/dashboard', { replace: true });
      } else {
        await loginOperator(secret);
        navigate(staffTarget && requested ? requested : '/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
      setSecret('');
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (k: LoginKind) => {
    setChosen(k);
    setSecret('');
    setError(null);
  };

  return (
    <div className="page auth-page">
      <form className="card form auth-card" onSubmit={(e) => void onSubmit(e)}>
        <h1>Anmelden</h1>
        {hasPin && !security.operator && (
          <div className="segmented segmented-light auth-switch" role="tablist" aria-label="Anmeldung als">
            <button type="button" role="tab" aria-selected={kind === 'admin'} className={kind === 'admin' ? 'active' : ''} onClick={() => switchTo('admin')}>
              Admin
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'operator'}
              className={kind === 'operator' ? 'active' : ''}
              onClick={() => switchTo('operator')}
            >
              Bediener
            </button>
          </div>
        )}

        {kind === 'admin' ? (
          <>
            <p className="muted">
              {security.operator
                ? 'Diese Seite ist nur für den Admin. Bitte das Admin-Passwort eingeben.'
                : security.vault === 'locked'
                  ? 'Die Daten sind gesperrt. Mit dem Admin-Passwort werden sie entsperrt und die Verwaltung geöffnet.'
                  : 'Für die Verwaltung bitte das Admin-Passwort eingeben.'}
            </p>
            <label htmlFor="pw-login">Admin-Passwort</label>
            <PasswordInput id="pw-login" value={secret} onChange={setSecret} autoComplete="current-password" autoFocus />
          </>
        ) : (
          <>
            <p className="muted">
              Bediener sehen Dashboard und Übersicht und können Eintritte bestätigen. Karten, Gruppen und Einstellungen
              bleiben dem Admin vorbehalten.
            </p>
            {security.vault !== 'unlocked' ? (
              <p className="hint">
                Die Daten sind gesperrt (z. B. nach einem Neustart). Der Admin muss sie zuerst einmal mit dem
                Admin-Passwort entsperren – danach ist die Bediener-Anmeldung möglich.
              </p>
            ) : !staffTarget ? (
              <p className="hint">Die gewünschte Seite ist nur für den Admin. Mit der PIN geht es zum Dashboard.</p>
            ) : null}
            <label htmlFor="pin-login">Bediener-PIN</label>
            <input
              id="pin-login"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value.replace(/\D/g, ''))}
              maxLength={12}
              autoFocus
            />
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !secret || (kind === 'operator' && security.vault !== 'unlocked')}>
          {busy ? 'Prüfe …' : 'Anmelden'}
        </button>
        <p>
          <Link to="/">Zurück zum Scanner</Link>
        </p>
      </form>
    </div>
  );
}
