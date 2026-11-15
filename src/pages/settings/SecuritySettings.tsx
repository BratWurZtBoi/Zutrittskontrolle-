import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { PasswordInput } from '../../components/PasswordInput';
import { saveSettings } from '../../db/settings';
import { useSettings } from '../../hooks/useSettings';
import { requestExit } from '../../security/exit';
import { changePassword } from '../../security/session';
import { SettingsShell } from './SettingsShell';

const AUTO_LOGOUT_OPTIONS = [
  { value: 5, label: 'nach 5 Minuten' },
  { value: 15, label: 'nach 15 Minuten' },
  { value: 30, label: 'nach 30 Minuten' },
  { value: 60, label: 'nach 1 Stunde' },
  { value: 0, label: 'nie' },
];

const RETENTION_OPTIONS = [
  { value: 30, label: '30 Tage' },
  { value: 90, label: '90 Tage' },
  { value: 180, label: '6 Monate' },
  { value: 365, label: '1 Jahr' },
  { value: 0, label: 'nie automatisch löschen' },
];

export function SecuritySettings() {
  const { autoLogoutMin, retentionDays } = useSettings();
  const navigate = useNavigate();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (newPw !== repeat) return setMessage({ ok: false, text: 'Die neuen Passwörter stimmen nicht überein.' });
    setBusy(true);
    try {
      await changePassword(oldPw, newPw);
      setOldPw('');
      setNewPw('');
      setRepeat('');
      setMessage({ ok: true, text: 'Passwort geändert.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Ändern fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsShell title="Sicherheit">
    <section className="card form">
      <p className="muted">
        Namen, Fotos und Notizen sind verschlüsselt gespeichert (AES-256). Nach jedem App-Start ist einmal das
        Admin-Passwort nötig, damit der Scanner Namen und Fotos anzeigt.
      </p>
      <div className="form-grid">
        <label>
          Admin automatisch abmelden
          <select value={autoLogoutMin} onChange={(e) => void saveSettings({ autoLogoutMin: Number(e.target.value) })}>
            {AUTO_LOGOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Protokoll automatisch löschen nach (Löschfrist)
          <select value={retentionDays} onChange={(e) => void saveSettings({ retentionDays: Number(e.target.value) })}>
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="button-row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            requestExit('lock');
            navigate('/');
          }}
        >
          Jetzt sperren
        </button>
        <span className="muted small">Sperrt die Verwaltung und blendet Namen/Fotos im Scanner aus.</span>
      </div>

      <form className="subform" onSubmit={(e) => void onChangePassword(e)}>
        <h3>Passwort ändern</h3>
        <label htmlFor="pw-old">Bisheriges Passwort</label>
        <PasswordInput id="pw-old" value={oldPw} onChange={setOldPw} autoComplete="current-password" />
        <label htmlFor="pw-new1">Neues Passwort (mindestens 8 Zeichen)</label>
        <PasswordInput id="pw-new1" value={newPw} onChange={setNewPw} autoComplete="new-password" />
        <label htmlFor="pw-new2">Neues Passwort wiederholen</label>
        <PasswordInput id="pw-new2" value={repeat} onChange={setRepeat} autoComplete="new-password" />
        {message && <p className={message.ok ? 'form-success' : 'form-error'}>{message.text}</p>}
        <button type="submit" className="btn" disabled={busy || !oldPw || !newPw}>
          {busy ? 'Wird geändert …' : 'Passwort ändern'}
        </button>
      </form>
    </section>
    </SettingsShell>
  );
}
