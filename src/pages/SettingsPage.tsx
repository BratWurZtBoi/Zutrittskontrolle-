import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PasswordInput } from '../components/PasswordInput';
import { requestExit } from '../security/exit';
import { changePassword } from '../security/session';
import { BackupSection } from '../components/BackupSection';
import { CameraSelect } from '../components/CameraSelect';
import { GroupBadge } from '../components/GroupBadge';
import { NumberField } from '../components/NumberField';
import { clearAllData, db } from '../db/db';
import { ensureDefaultGroups, listGroups } from '../db/groups';
import { clearEvents } from '../db/scans';
import { removeTestCards, seedTestCards } from '../db/seed';
import { saveSettings, type AppSettings } from '../db/settings';
import type { ScanMode } from '../domain/types';
import { useSettings } from '../hooks/useSettings';
import { isStoragePersisted, requestPersistentStorage } from '../pwa';

export function SettingsPage() {
  const settings = useSettings();
  const counts = useLiveQuery(
    async () => ({ cards: await db.cards.count(), events: await db.events.count() }),
    [],
    { cards: 0, events: 0 },
  );
  const groups = useLiveQuery(listGroups, [], []);
  const [persisted, setPersisted] = useState<boolean | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [orgName, setOrgName] = useState(settings.orgName);

  useEffect(() => setOrgName(settings.orgName), [settings.orgName]);
  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);

  const save = (patch: Partial<AppSettings>) => void saveSettings(patch);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  const run = async (confirmText: string | null, action: () => Promise<string>) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setMessage(await action());
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Einstellungen</h1>
      </header>

      <section className="card form">
        <h2>Allgemein</h2>
        <label>
          Name der Organisation (erscheint auf den Ausweisen)
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            onBlur={() => save({ orgName: orgName.trim() || 'Organisation' })}
          />
        </label>
      </section>

      <section className="card form">
        <h2>Gruppen</h2>
        <p className="button-row">
          {groups.map((g) => (
            <GroupBadge key={g.id} group={g} />
          ))}
        </p>
        <div className="button-row">
          <Link className="btn" to="/einstellungen/gruppen">
            Gruppen verwalten
          </Link>
        </div>
      </section>

      <section className="card form">
        <h2>Scanner</h2>
        <label>
          Modus
          <select value={settings.scanMode} onChange={(e) => save({ scanMode: e.target.value as ScanMode })}>
            <option value="auto">Automatisch (abwechselnd ein/aus)</option>
            <option value="in">Nur Eingang</option>
            <option value="out">Nur Ausgang</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            Doppelscan-Schutz (Sekunden)
            <NumberField value={settings.cooldownSec} min={0} max={3600} onChange={(cooldownSec) => save({ cooldownSec })} />
          </label>
          <label>
            Anzeigedauer Ergebnis (Sekunden)
            <NumberField
              value={settings.resultDisplaySec}
              min={1}
              max={30}
              onChange={(resultDisplaySec) => save({ resultDisplaySec })}
            />
          </label>
          <label>
            Kamera
            <CameraSelect value={settings.camera} onChange={(camera) => save({ camera })} />
          </label>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={settings.mirrorPreview} onChange={(e) => save({ mirrorPreview: e.target.checked })} />
          Kameravorschau spiegeln (Front- und Webcam)
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings.sound} onChange={(e) => save({ sound: e.target.checked })} />
          Signalton und Vibration
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings.testMode} onChange={(e) => save({ testMode: e.target.checked })} />
          Testmodus (Scans im Scanner simulieren – nur sichtbar, solange ein Admin angemeldet ist)
        </label>
      </section>

      <SecuritySection autoLogoutMin={settings.autoLogoutMin} retentionDays={settings.retentionDays} />

      <BackupSection lastBackupAt={settings.lastBackupAt} />

      <section className="card form">
        <h2>Daten</h2>
        <p className="muted">
          Alle Daten liegen ausschließlich auf diesem Gerät ({counts.cards} Karten, {counts.events} Protokolleinträge).
        </p>
        <div className="button-row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              void run(null, async () => {
                const n = await seedTestCards();
                return n ? `${n} Testkarten angelegt.` : 'Testkarten sind bereits vorhanden.';
              })
            }
          >
            Testkarten anlegen
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void run('Alle Testkarten und deren Buchungen löschen?', async () => `${await removeTestCards()} Testkarte(n) entfernt.`)
            }
          >
            Testkarten entfernen
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void run('Gesamtes Protokoll und Anwesenheit löschen?', async () => {
                await clearEvents();
                return 'Protokoll und Anwesenheit gelöscht.';
              })
            }
          >
            Protokoll leeren
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() =>
              void run('ALLE Daten auf diesem Gerät unwiderruflich löschen? (Das Admin-Passwort bleibt erhalten.)', async () => {
                await clearAllData();
                await ensureDefaultGroups();
                return 'Alle Daten gelöscht. Die Standardgruppen wurden neu angelegt.';
              })
            }
          >
            Alle Daten löschen
          </button>
        </div>
        {message && <p className="form-success">{message}</p>}
      </section>

      <section className="card form">
        <h2>Gerät &amp; App</h2>
        <ul className="info-list">
          <li>
            Version: {__APP_VERSION__} (Build {__BUILD_ID__})
          </li>
          <li>Als App installiert: {standalone ? 'ja' : 'nein – im Browsermenü „Zum Startbildschirm hinzufügen“ wählen'}</li>
          <li>
            Dauerhafter Speicher:{' '}
            {persisted === undefined ? 'unbekannt' : persisted ? 'ja' : 'nein'}
            {persisted === false && (
              <>
                {' '}
                <button type="button" className="btn btn-small" onClick={() => void requestPersistentStorage().then(setPersisted)}>
                  Anfordern
                </button>
              </>
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}

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

function SecuritySection({ autoLogoutMin, retentionDays }: { autoLogoutMin: number; retentionDays: number }) {
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
    <section className="card form">
      <h2>Sicherheit</h2>
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
  );
}
