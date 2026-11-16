import { useEffect, useState } from 'react';
import { getDesktop } from '../../lib/desktop';
import { isStoragePersisted, requestPersistentStorage } from '../../pwa';
import { SettingsShell } from './SettingsShell';

export function DeviceSettings() {
  const desktop = getDesktop();
  return <SettingsShell title="Gerät & App">{desktop ? <DesktopInfo /> : <BrowserInfo />}</SettingsShell>;
}

/** Web-App im Browser (Handy, Tablet, Computer). */
function BrowserInfo() {
  const [persisted, setPersisted] = useState<boolean | undefined>();
  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <>
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
        <h2>Hinweise für den Computer</h2>
        <ul className="info-list">
          <li>
            Es gibt die App auch als <strong>Programm für Windows und Linux</strong> (Dateien unter „Releases“ auf GitHub). Dort
            liegen die Daten in einem eigenen Programmordner – unabhängig vom Browser.
          </li>
          <li>
            In Edge/Chrome darf <strong>„Browserdaten beim Schließen löschen“</strong> nicht aktiv sein – sonst sind alle Daten
            weg. Dasselbe gilt für Aufräumprogramme.
          </li>
          <li>Windows-Konto mit Passwort, Geräteverschlüsselung (BitLocker); beim Verlassen des Platzes Win+L drücken.</li>
          <li>App installieren und in den App-Einstellungen von Edge/Chrome „Beim Anmelden starten“ wählen.</li>
        </ul>
      </section>
    </>
  );
}

/** Windows- bzw. Linux-Programm (Electron). */
function DesktopInfo() {
  const desktop = getDesktop();
  const linux = desktop?.platform === 'linux';
  const [info, setInfo] = useState<{ version: string; dataPath: string } | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);

  useEffect(() => {
    if (!desktop) return;
    void desktop.info().then(setInfo);
    void desktop.getAutostart().then(setAutostart);
  }, [desktop]);

  return (
    <>
      <section className="card form">
        <ul className="info-list">
          <li>
            <strong>{linux ? 'Linux-Programm' : 'Windows-Programm'}</strong>, Version {info?.version ?? __APP_VERSION__} (Build{' '}
            {__BUILD_ID__})
          </li>
          <li>
            Daten liegen in: <code className="path">{info?.dataPath ?? '…'}</code> – unabhängig vom Browser. Sie bleiben bei
            Updates und auch beim Deinstallieren erhalten.
          </li>
        </ul>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(autostart)}
            disabled={autostart === null}
            onChange={(e) => void desktop?.setAutostart(e.target.checked).then(setAutostart)}
          />
          {linux ? 'Beim Anmelden automatisch starten' : 'Beim Anmelden an Windows automatisch starten'}
        </label>
      </section>
      <section className="card form">
        <h2>Updates</h2>
        <ul className="info-list">
          {linux ? (
            <li>
              Neue Version: das neue Paket (<code>.deb</code>) herunterladen und per Doppelklick installieren – es ersetzt die
              bisherige Version.
            </li>
          ) : (
            <li>Neue Version: Installationsdatei herunterladen und einfach über die bisherige Version installieren.</li>
          )}
          <li>Vorher ein Backup erstellen (Einstellungen → Datensicherung) – zur Sicherheit.</li>
        </ul>
      </section>
      <section className="card form">
        <h2>Hinweise</h2>
        <ul className="info-list">
          {linux ? (
            <li>
              Benutzerkonto mit Passwort, Festplattenverschlüsselung (bei der Installation von Linux wählen); beim Verlassen des
              Platzes den Bildschirm sperren (meist Super+L).
            </li>
          ) : (
            <li>Windows-Konto mit Passwort, Geräteverschlüsselung (BitLocker); beim Verlassen des Platzes Win+L drücken.</li>
          )}
          <li>F11 schaltet das Fenster in den Vollbildmodus (z. B. für den Kiosk-Scanner).</li>
          <li>Zwei Bildschirme: in den Bildschirmeinstellungen „Erweitern“ wählen (nicht „Spiegeln“/„Duplizieren“).</li>
        </ul>
      </section>
    </>
  );
}
