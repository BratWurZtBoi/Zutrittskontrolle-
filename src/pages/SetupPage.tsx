import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { PasswordInput } from '../components/PasswordInput';
import { passwordProblem } from '../security/crypto';
import { setupPassword } from '../security/session';
import { useSecurity } from '../security/useSecurity';

/** Ersteinrichtung des Admin-Passworts. */
export function SetupPage() {
  const security = useSecurity();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = params.get('ziel') || '/dashboard';
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (security.vault === 'loading') return null;
  if (security.vault !== 'setup') return <Navigate to={`/anmelden?ziel=${encodeURIComponent(target)}`} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== repeat) return setError('Die beiden Passwörter stimmen nicht überein.');
    if (!understood) return setError('Bitte den Hinweis zum Passwortverlust bestätigen.');
    setBusy(true);
    try {
      await setupPassword(password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einrichtung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page auth-page">
      <form className="card form auth-card" onSubmit={(e) => void onSubmit(e)}>
        <h1>Admin-Passwort einrichten</h1>
        <ul className="info-list">
          <li>Das Passwort schützt die Verwaltung. Der Scanner bleibt ohne Passwort nutzbar.</li>
          <li>Namen, Fotos und Notizen werden damit verschlüsselt auf diesem Gerät gespeichert.</li>
          <li>Nach jedem Start der App muss es einmal eingegeben werden, damit der Scanner Namen und Fotos zeigt.</li>
        </ul>
        <label htmlFor="pw-new">
          Neues Passwort (mindestens 8 Zeichen)
        </label>
        <PasswordInput id="pw-new" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
        <label htmlFor="pw-repeat">Passwort wiederholen</label>
        <PasswordInput id="pw-repeat" value={repeat} onChange={setRepeat} autoComplete="new-password" />
        <p className="hint">
          <strong>Wichtig:</strong> Ohne Passwort lassen sich die verschlüsselten Daten nicht wiederherstellen – auch nicht
          vom Entwickler. Bitte sicher notieren und regelmäßig ein Backup erstellen.
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          Verstanden: Passwort vergessen = Daten verloren
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Wird eingerichtet …' : 'Passwort einrichten'}
        </button>
      </form>
    </div>
  );
}
