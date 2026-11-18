import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { saveSettings } from '../../db/settings';
import { loadOperatorPin } from '../../db/vault';
import { useSettings } from '../../hooks/useSettings';
import { pinProblem } from '../../security/crypto';
import { disableOperatorPin, setOperatorPin } from '../../security/session';
import { SettingsShell } from './SettingsShell';
import { InfoTip } from '../../components/InfoTip';

const OPERATOR_LOGOUT_OPTIONS = [
  { value: 0, label: 'nie (z. B. für eine ganze Schicht)' },
  { value: 30, label: 'nach 30 Minuten' },
  { value: 60, label: 'nach 1 Stunde' },
  { value: 120, label: 'nach 2 Stunden' },
  { value: 240, label: 'nach 4 Stunden' },
];

const CONFIRM_TIMEOUT_OPTIONS = [
  { value: 30, label: '30 Sekunden' },
  { value: 60, label: '1 Minute' },
  { value: 90, label: '90 Sekunden' },
  { value: 120, label: '2 Minuten' },
  { value: 300, label: '5 Minuten' },
];

/** Bediener-PIN (eingeschränkter Zugang für den Empfang) und Bestätigung von Eintritten. */
export function OperatorSettings() {
  const settings = useSettings();
  const hasPin = useLiveQuery(async () => Boolean(await loadOperatorPin()), [], false);
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const problem = pinProblem(pin);
    if (problem) return setMessage({ ok: false, text: problem });
    if (pin !== repeat) return setMessage({ ok: false, text: 'Die beiden PINs stimmen nicht überein.' });
    setBusy(true);
    try {
      await setOperatorPin(pin);
      setPin('');
      setRepeat('');
      setMessage({ ok: true, text: hasPin ? 'Bediener-PIN geändert.' : 'Bediener-Zugang eingerichtet.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Speichern fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    if (!window.confirm('Bediener-Zugang abschalten? Danach ist nur noch die Anmeldung mit dem Admin-Passwort möglich.')) return;
    await disableOperatorPin();
    setMessage({ ok: true, text: 'Bediener-Zugang abgeschaltet.' });
  };

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 12);

  return (
    <SettingsShell title="Bediener & Bestätigung">
    <section className="card form">
      <p className="muted">
        Mit der <strong>Bediener-PIN</strong> kann am Empfang gearbeitet werden, ohne das Admin-Passwort weiterzugeben:
        Dashboard, Auswertung und Eintritte bestätigen. Karten, Gruppen, Export und Einstellungen bleiben dem Admin
        vorbehalten. Die PIN entschlüsselt keine Daten – nach einem Neustart muss der Admin die Daten einmal mit dem
        Admin-Passwort entsperren.
      </p>
      <p className={hasPin ? 'form-success' : 'muted'}>{hasPin ? '✓ Bediener-Zugang ist eingerichtet.' : 'Noch keine Bediener-PIN eingerichtet.'}</p>
      <div className="form-grid">
        <label>
          <span>
            Bediener automatisch abmelden <InfoTip hint="operatorLogout" />
          </span>
          <select value={settings.operatorAutoLogoutMin} onChange={(e) => void saveSettings({ operatorAutoLogoutMin: Number(e.target.value) })}>
            {OPERATOR_LOGOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Offene Bestätigung verfällt nach <InfoTip hint="confirmTimeout" />
          </span>
          <select value={settings.confirmTimeoutSec} onChange={(e) => void saveSettings({ confirmTimeoutSec: Number(e.target.value) })}>
            {CONFIRM_TIMEOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        Welche Gruppen bestätigt werden müssen, wird je Gruppe unter <Link to="/einstellungen/gruppen">Gruppen verwalten</Link>{' '}
        festgelegt.
      </p>
      <form className="subform" onSubmit={(e) => void onSave(e)}>
        <h3>{hasPin ? 'Bediener-PIN ändern' : 'Bediener-PIN festlegen'}</h3>
        <label htmlFor="op-pin1">Neue PIN (4–12 Ziffern, empfohlen: 6)</label>
        <input id="op-pin1" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
        <label htmlFor="op-pin2">PIN wiederholen</label>
        <input id="op-pin2" type="password" inputMode="numeric" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(digits(e.target.value))} />
        {message && <p className={message.ok ? 'form-success' : 'form-error'}>{message.text}</p>}
        <div className="button-row">
          <button type="submit" className="btn" disabled={busy || !pin}>
            {busy ? 'Wird gespeichert …' : 'PIN speichern'}
          </button>
          {hasPin && (
            <button type="button" className="btn btn-danger" onClick={() => void onDisable()}>
              Bediener-Zugang abschalten
            </button>
          )}
        </div>
      </form>
    </section>
    </SettingsShell>
  );
}
