import { useEffect, useState } from 'react';
import { isStoragePersisted, requestPersistentStorage } from '../../pwa';
import { SettingsShell } from './SettingsShell';

export function DeviceSettings() {
  const [persisted, setPersisted] = useState<boolean | undefined>();
  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <SettingsShell title="Gerät & App">
      <section className="card form">
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
      <section className="card form">
        <h2>Hinweise für den Windows-Rechner</h2>
        <ul className="info-list">
          <li>
            In Edge/Chrome darf <strong>„Browserdaten beim Schließen löschen“</strong> nicht aktiv sein – sonst sind alle Daten
            weg. Dasselbe gilt für Aufräumprogramme.
          </li>
          <li>Windows-Konto mit Passwort, Geräteverschlüsselung (BitLocker); beim Verlassen des Platzes Win+L drücken.</li>
          <li>App installieren und in den App-Einstellungen von Edge/Chrome „Beim Anmelden starten“ wählen.</li>
        </ul>
      </section>
    </SettingsShell>
  );
}
