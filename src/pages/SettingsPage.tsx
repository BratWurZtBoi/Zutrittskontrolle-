import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CameraSelect } from '../components/CameraSelect';
import { GroupBadge } from '../components/GroupBadge';
import { clearAllData, db } from '../db/db';
import { ensureDefaultGroups, listGroups } from '../db/groups';
import { clearEvents } from '../db/scans';
import { removeTestCards, seedTestCards } from '../db/seed';
import { saveSettings, type AppSettings } from '../db/settings';
import type { ScanMode } from '../domain/types';
import { useSettings } from '../hooks/useSettings';
import { isStoragePersisted, requestPersistentStorage } from '../pwa';

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

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
            <input
              type="number"
              min={0}
              max={3600}
              value={settings.cooldownSec}
              onChange={(e) => save({ cooldownSec: clamp(e.target.valueAsNumber, 0, 3600) })}
            />
          </label>
          <label>
            Anzeigedauer Ergebnis (Sekunden)
            <input
              type="number"
              min={1}
              max={30}
              value={settings.resultDisplaySec}
              onChange={(e) => save({ resultDisplaySec: clamp(e.target.valueAsNumber, 1, 30) })}
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
          Testmodus (Scans im Scanner simulieren)
        </label>
      </section>

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
              void run('ALLE Daten auf diesem Gerät unwiderruflich löschen?', async () => {
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
        <p className="muted">Geplant für die nächsten Schritte: PIN-geschützter Adminbereich und verschlüsselte Backups.</p>
      </section>
    </div>
  );
}
