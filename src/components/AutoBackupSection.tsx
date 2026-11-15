import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import {
  autoBackupPermission,
  configureAutoBackup,
  directoryPickerAvailable,
  disableAutoBackup,
  loadAutoBackup,
  pickBackupDirectory,
  runAutoBackup,
  type AutoBackupRun,
  type BackupDirHandle,
} from '../db/autoBackup';
import { formatDateTime } from '../domain/dates';
import { passwordProblem } from '../security/crypto';
import { PasswordInput } from './PasswordInput';

const INTERVALS = [
  { value: 24, label: 'täglich' },
  { value: 12, label: 'alle 12 Stunden' },
  { value: 4, label: 'alle 4 Stunden' },
  { value: 1, label: 'stündlich' },
];
const KEEP = [7, 14, 30];

const RUN_TEXT: Record<AutoBackupRun, string> = {
  done: 'Sicherung gespeichert.',
  'not-due': 'Noch nicht fällig.',
  disabled: 'Automatische Sicherung ist aus.',
  locked: 'Die Daten sind gesperrt.',
  'no-permission': 'Kein Zugriff auf den Ordner – bitte erlauben.',
  busy: 'Eine Sicherung läuft gerade.',
  error: 'Die Sicherung ist fehlgeschlagen (siehe unten).',
};

/** Automatische, verschlüsselte Sicherung in einen Ordner (z. B. USB-Stick) – Chrome/Edge am Computer. */
export function AutoBackupSection() {
  const config = useLiveQuery(loadAutoBackup, [], undefined);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (config) void autoBackupPermission().then(setPermission);
  }, [config]);

  if (!directoryPickerAvailable()) {
    return (
      <div className="subform">
        <h3>Automatische Sicherung</h3>
        <p className="muted">
          Automatische Sicherungen in einen Ordner (z. B. USB-Stick) sind in Chrome oder Edge am Computer möglich – etwa am
          Windows-Rechner.
        </p>
      </div>
    );
  }

  const runNow = async () => {
    setBusy(true);
    setMessage(null);
    const r = await runAutoBackup(__APP_VERSION__, { force: true, interactive: true });
    setMessage({ ok: r === 'done', text: RUN_TEXT[r] });
    setBusy(false);
  };

  if (!config) return <AutoBackupSetup onDone={(text) => setMessage({ ok: true, text })} message={message} />;

  const interval = INTERVALS.find((i) => i.value === config.intervalHours)?.label ?? `alle ${config.intervalHours} Stunden`;
  return (
    <div className="subform">
      <h3>Automatische Sicherung</h3>
      <p>
        <strong>Eingeschaltet:</strong> {interval} in den Ordner „{config.dirName}“, die letzten {config.keep} Sicherungen bleiben
        erhalten. Läuft, solange die App geöffnet und entsperrt ist.
      </p>
      <p className={config.lastRunAt ? 'muted' : 'hint'}>
        Letzte automatische Sicherung: {config.lastRunAt ? `${formatDateTime(config.lastRunAt)} (${config.lastFile})` : 'noch keine'}
      </p>
      {config.lastError && <p className="form-error">Problem: {config.lastError}</p>}
      {permission && permission !== 'granted' && (
        <p className="hint">Der Browser fragt nach einem Neustart ggf. erneut nach dem Ordnerzugriff – „Jetzt sichern“ erlaubt ihn wieder.</p>
      )}
      <div className="button-row">
        <button type="button" className="btn" disabled={busy} onClick={() => void runNow()}>
          {busy ? 'Sichert …' : permission && permission !== 'granted' ? 'Zugriff erlauben und jetzt sichern' : 'Jetzt sichern'}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm('Automatische Sicherung ausschalten? Bereits gespeicherte Dateien bleiben im Ordner.')) void disableAutoBackup();
          }}
        >
          Ausschalten
        </button>
      </div>
      {message && <p className={message.ok ? 'form-success' : 'form-error'}>{message.text}</p>}
    </div>
  );
}

function AutoBackupSetup({ onDone, message }: { onDone: (text: string) => void; message: { ok: boolean; text: string } | null }) {
  const [dir, setDir] = useState<BackupDirHandle | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [intervalHours, setIntervalHours] = useState(24);
  const [keep, setKeep] = useState(14);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    setError(null);
    try {
      setDir(await pickBackupDirectory());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // abgebrochen
      setError(err instanceof Error ? err.message : 'Ordner konnte nicht gewählt werden.');
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!dir) return setError('Bitte zuerst einen Ordner wählen.');
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== repeat) return setError('Die beiden Passwörter stimmen nicht überein.');
    setBusy(true);
    try {
      await configureAutoBackup({ dir, password, intervalHours, keep });
      const r = await runAutoBackup(__APP_VERSION__, { force: true, interactive: true });
      onDone(r === 'done' ? 'Automatische Sicherung eingeschaltet – erste Sicherung gespeichert.' : `Eingeschaltet. ${RUN_TEXT[r]}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einrichten fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="subform" onSubmit={(e) => void onSubmit(e)}>
      <h3>Automatische Sicherung</h3>
      <p className="muted">
        Die App speichert regelmäßig ein verschlüsseltes Backup in einen Ordner Ihrer Wahl – z. B. auf einem USB-Stick oder
        Netzlaufwerk. So gehen bei einem Defekt des Rechners keine Daten verloren.
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => void choose()}>
          {dir ? 'Anderen Ordner wählen' : 'Ordner wählen …'}
        </button>
        {dir && <span>Ordner: „{dir.name}“</span>}
      </div>
      <label htmlFor="ab-pw1">Passwort für die automatischen Sicherungen (mindestens 8 Zeichen)</label>
      <PasswordInput id="ab-pw1" value={password} onChange={setPassword} autoComplete="new-password" />
      <label htmlFor="ab-pw2">Passwort für die automatischen Sicherungen wiederholen</label>
      <PasswordInput id="ab-pw2" value={repeat} onChange={setRepeat} autoComplete="new-password" />
      <p className="muted small">
        Wird zum Einspielen gebraucht – bitte sicher notieren. Es wird verschlüsselt auf diesem Gerät gespeichert, damit die
        Sicherung ohne Eingabe laufen kann.
      </p>
      <div className="form-grid">
        <label>
          Wie oft
          <select value={intervalHours} onChange={(e) => setIntervalHours(Number(e.target.value))}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Aufbewahren
          <select value={keep} onChange={(e) => setKeep(Number(e.target.value))}>
            {KEEP.map((k) => (
              <option key={k} value={k}>
                die letzten {k} Sicherungen
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      {message && <p className={message.ok ? 'form-success' : 'form-error'}>{message.text}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || !dir || !password}>
        {busy ? 'Wird eingerichtet …' : 'Automatische Sicherung einschalten'}
      </button>
    </form>
  );
}
