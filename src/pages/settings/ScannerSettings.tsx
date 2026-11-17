import { useState } from 'react';
import { NumberField } from '../../components/NumberField';
import { db } from '../../db/db';
import { saveSettings, type AppSettings, type ScanInput } from '../../db/settings';
import { parseCardPayload } from '../../domain/cardCode';
import { SCANNER_MAX_GAP_MS, type ScannerSpeed } from '../../domain/keyboardScan';
import { useKeyboardScanner, type KeyboardScan } from '../../hooks/useKeyboardScanner';
import { useSettings } from '../../hooks/useSettings';
import { SettingsShell } from './SettingsShell';

export function ScannerSettings() {
  const settings = useSettings();
  const save = (patch: Partial<AppSettings>) => void saveSettings(patch);

  return (
    <SettingsShell title="Scanner">
      <section className="card form">
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

      <section className="card form" aria-labelledby="kiosk-title">
        <h2 id="kiosk-title">Kiosk-Modus</h2>
        <label className="checkbox">
          <input type="checkbox" checked={settings.kioskMode} onChange={(e) => save({ kioskMode: e.target.checked })} />
          Kiosk-Modus für dieses Gerät: Vollbild-Scanner als Startseite – scannt auch ohne Anmeldung
        </label>
        <p className="muted small">
          Für ein Gerät am Eingang ohne Bediener (z. B. ein Tablet). Am Empfang arbeitet man im Dashboard; Scan-Modus und Kamera
          stellt man dort direkt ein. Ohne Kiosk-Modus öffnet die App das Dashboard bzw. die Anmeldung – für den Dauerbetrieb am
          Empfang am besten mit der Bediener-PIN anmelden.
        </p>
      </section>

      <section className="card form" aria-labelledby="usb-scanner-title">
        <h2 id="usb-scanner-title">USB-Scanner</h2>
        <p className="muted">
          QR-Code-Scanner, die wie eine Tastatur arbeiten (USB, „HID“ bzw. „Tastatur-Modus“), funktionieren ohne Treiber: im
          Dashboard und im Kiosk-Scanner einfach scannen – ohne vorher etwas anzuklicken.
        </p>
        <div className="form-grid">
          <label>
            Scannen mit
            <select value={settings.scanInput} onChange={(e) => save({ scanInput: e.target.value as ScanInput })}>
              <option value="both">Kamera und USB-Scanner</option>
              <option value="camera">Nur Kamera</option>
              <option value="scanner">Nur USB-Scanner (Kamera aus)</option>
            </select>
          </label>
          <label>
            Scanner-Tempo
            <select value={settings.scannerSpeed} onChange={(e) => save({ scannerSpeed: e.target.value as ScannerSpeed })}>
              <option value="fast">Normal (USB-Scanner)</option>
              <option value="slow">Langsam (Bluetooth- oder gedrosselte Scanner)</option>
            </select>
          </label>
        </div>
        <ScannerTest speed={settings.scannerSpeed} />
        <details className="scanner-setup">
          <summary>Scanner einrichten – worauf achten?</summary>
          <ul>
            <li>2D-Scanner (Imager) – reine Laserscanner lesen keine QR-Codes.</li>
            <li>
              Anschluss USB im <strong>Tastatur-Modus (HID)</strong>, Tastaturlayout <strong>Deutsch (QWERTZ)</strong>, nach jedem Code{' '}
              <strong>Enter</strong>. Umgestellt wird meist durch Scannen der Einstell-Codes aus der Anleitung des Scanners.
            </li>
            <li>
              Falsches Tastaturlayout (z. B. US) erkennt die App und korrigiert es – fremde Codes werden dann aber falsch gelesen.
            </li>
            <li>Ideal am Eingang: Tisch- bzw. Präsentationsscanner (Karte nur davorhalten).</li>
            <li>
              Scans kommen in dem Fenster an, das gerade aktiv ist. Hat jemand auf den Gästebildschirm geklickt, reicht dieser den
              Scan an das Dashboard weiter.
            </li>
          </ul>
        </details>
      </section>
    </SettingsShell>
  );
}

interface TestResult {
  scan: KeyboardScan;
  card?: { number: string; group?: string };
}

/** Für die Anzeige kürzen – bei Karten-Codes ist das Token der „Schlüssel“ der Karte und wird nicht gezeigt. */
function shortCode(scan: KeyboardScan): string {
  if (scan.payload) return `${scan.raw.slice(0, 6)}…`;
  return scan.raw.length > 48 ? `${scan.raw.slice(0, 48)}…` : scan.raw;
}

/** Testfeld: zeigt, was der Scanner liefert – ohne zu buchen. */
function ScannerTest({ speed }: { speed: ScannerSpeed }) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [count, setCount] = useState(0);
  const { windowActive } = useKeyboardScanner(
    (scan) => {
      setCount((n) => n + 1);
      void (async () => {
        const token = scan.payload ? parseCardPayload(scan.payload) : null;
        const card = token ? await db.cards.where('token').equals(token).first() : undefined;
        const group = card ? await db.groups.get(card.groupId) : undefined;
        setResult({ scan, card: card ? { number: card.number, group: group?.name } : undefined });
      })();
    },
    { enabled: true, speed },
  );

  const scan = result?.scan;
  const slowHint = scan && speed === 'fast' && scan.msPerChar > SCANNER_MAX_GAP_MS.fast * 0.75;

  return (
    <div className="scanner-test" aria-live="polite">
      <strong>Scanner testen</strong>
      {!scan ? (
        <p className="muted">
          {windowActive
            ? 'Eine Karte scannen, während diese Seite offen ist. Es wird nichts gebucht.'
            : 'Zum Testen zuerst einmal in dieses Fenster klicken.'}
        </p>
      ) : (
        <dl className="scanner-test-result" data-testid="scanner-test-result">
          <dt>Ergebnis</dt>
          <dd className={scan.payload ? (result?.card ? 'ok-text' : 'warn-text') : 'danger-text'}>
            {scan.payload
              ? result?.card
                ? `Karte ${result.card.number}${result.card.group ? ` (${result.card.group})` : ''} erkannt`
                : 'Karten-Code erkannt, aber diese Karte gibt es hier nicht (gelöscht oder ersetzt).'
              : 'Kein Karten-Code dieser Anwendung (fremder QR-Code oder Strichcode).'}
          </dd>
          {scan.layoutFixed && (
            <>
              <dt>Tastaturlayout</dt>
              <dd className="warn-text">
                Passt nicht zum Rechner (z. B. Scanner auf US-Tastatur) – wurde automatisch korrigiert. Besser den Scanner auf
                „Deutsch“ umstellen.
              </dd>
            </>
          )}
          <dt>Gelesen</dt>
          <dd>
            <code>{shortCode(scan)}</code> ({scan.raw.length} Zeichen)
          </dd>
          <dt>Tempo</dt>
          <dd>
            {scan.msPerChar} ms pro Zeichen
            {slowHint && ' – recht langsam: falls Scans manchmal nicht erkannt werden, „Scanner-Tempo: Langsam“ wählen.'}
          </dd>
          <dt>Abschluss</dt>
          <dd>{scan.terminator === 'Enter' ? 'Enter' : scan.terminator === 'Tab' ? 'Tab' : 'ohne (wird trotzdem erkannt)'}</dd>
          <dt>Scans</dt>
          <dd>{count}</dd>
        </dl>
      )}
    </div>
  );
}
