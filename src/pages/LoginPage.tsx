import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { PasswordInput } from '../components/PasswordInput';
import { login } from '../security/session';
import { useSecurity } from '../security/useSecurity';

/** Anmeldung mit dem Admin-Passwort (entsperrt zugleich die Personendaten). */
export function LoginPage() {
  const security = useSecurity();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = params.get('ziel') || '/karten';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (security.vault === 'loading') return null;
  if (security.vault === 'setup') return <Navigate to={`/einrichtung?ziel=${encodeURIComponent(target)}`} replace />;
  if (security.admin) return <Navigate to={target} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page auth-page">
      <form className="card form auth-card" onSubmit={(e) => void onSubmit(e)}>
        <h1>Anmelden</h1>
        <p className="muted">
          {security.vault === 'locked'
            ? 'Die Daten sind gesperrt. Mit dem Admin-Passwort werden sie entsperrt und die Verwaltung geöffnet.'
            : 'Für die Verwaltung bitte das Admin-Passwort eingeben.'}
        </p>
        <label htmlFor="pw-login">Admin-Passwort</label>
        <PasswordInput id="pw-login" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !password}>
          {busy ? 'Prüfe …' : 'Anmelden'}
        </button>
        <p>
          <Link to="/">Zurück zum Scanner</Link>
        </p>
      </form>
    </div>
  );
}
