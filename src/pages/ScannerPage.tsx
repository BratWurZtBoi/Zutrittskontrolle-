import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LockIcon } from '../components/Icons';
import { ResultOverlay } from '../components/ScanResult';
import { ScannerControls } from '../components/ScannerControls';
import { TestScanPanel } from '../components/TestScanPanel';
import { useKeepScreenOn, useScanProcessor } from '../hooks/useScanProcessor';
import { CameraScanner } from '../scanner/CameraScanner';
import { useSecurity } from '../security/useSecurity';

/** Kiosk-Scanner: Vollbild für Geräte am Eingang, frei zugänglich. */
export function ScannerPage() {
  const security = useSecurity();
  const { settings, result, clearResult, handleText, onCamera } = useScanProcessor();
  const [cameraStarts, setCameraStarts] = useState(0);
  const onStarted = useCallback(() => setCameraStarts((n) => n + 1), []);
  useKeepScreenOn();

  // Ergebnis nach der eingestellten Zeit ausblenden
  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(clearResult, settings.resultDisplaySec * 1000);
    return () => window.clearTimeout(t);
  }, [result, settings.resultDisplaySec, clearResult]);

  const mirror = settings.mirrorPreview && settings.camera !== 'environment';

  return (
    <div className="scanner-page">
      {security.vault === 'locked' && (
        <div className="lock-banner no-print">
          <LockIcon />
          <span>Daten gesperrt – Namen und Fotos werden nicht angezeigt. Der Zutritt wird trotzdem geprüft.</span>
          <Link className="btn btn-small" to="/anmelden?ziel=%2F">
            Entsperren
          </Link>
        </div>
      )}
      {security.vault === 'setup' && (
        <div className="lock-banner no-print">
          <LockIcon />
          <span>Noch kein Admin-Passwort eingerichtet.</span>
          <Link className="btn btn-small" to="/einrichtung?ziel=%2F">
            Jetzt einrichten
          </Link>
        </div>
      )}
      <div className="scanner-stage">
        <CameraScanner camera={settings.camera} mirror={mirror} onCode={onCamera} onStarted={onStarted} />
        <div className="scanner-hint">Karte mit QR-Code vor die Kamera halten</div>
      </div>
      <ScannerControls settings={settings} cameraStarts={cameraStarts} />
      {settings.testMode && security.admin && <TestScanPanel onScan={(text) => void handleText(text, 'test')} />}
      {result && <ResultOverlay result={result} onClose={clearResult} />}
    </div>
  );
}
