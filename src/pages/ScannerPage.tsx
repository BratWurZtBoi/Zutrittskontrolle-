import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LockIcon } from '../components/Icons';
import { ResultOverlay } from '../components/ScanResult';
import { ScannerControls } from '../components/ScannerControls';
import { ScannerInactiveNote, ScannerOnlyStage } from '../components/ScannerStatus';
import { TestScanPanel } from '../components/TestScanPanel';
import { useScannerInput } from '../hooks/useKeyboardScanner';
import { useKeepScreenOn, useScanProcessor } from '../hooks/useScanProcessor';
import { useLoadedSettings } from '../hooks/useSettings';
import { CameraScanner } from '../scanner/CameraScanner';
import { useSecurity } from '../security/useSecurity';

/** Kiosk-Scanner: Vollbild für Geräte am Eingang, frei zugänglich. */
export function ScannerPage() {
  const security = useSecurity();
  const { settings, result, clearResult, handleText, onCamera, onScanner } = useScanProcessor();
  // Kamera erst starten, wenn feststeht, dass sie gebraucht wird (sonst unnötige Kamera-Rückfrage)
  const scanInput = useLoadedSettings()?.scanInput;
  const cameraOn = scanInput !== undefined && scanInput !== 'scanner';
  const scannerOn = scanInput !== 'camera'; // schon während des Ladens – sonst gehen frühe Scans verloren
  const { inputReachable, seen } = useScannerInput(onScanner, { enabled: scannerOn, speed: settings.scannerSpeed });
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
        {cameraOn && (
          <>
            <CameraScanner camera={settings.camera} mirror={mirror} onCode={onCamera} onStarted={onStarted} />
            <div className="scanner-hint">
              {scannerOn && seen ? 'Karte vor die Kamera oder den Scanner halten' : 'Karte mit QR-Code vor die Kamera halten'}
            </div>
            {scannerOn && seen && !inputReachable && <ScannerInactiveNote className="scanner-inactive-overlay" />}
          </>
        )}
        {scanInput === 'scanner' && <ScannerOnlyStage reachable={inputReachable} />}
      </div>
      <ScannerControls settings={settings} cameraStarts={cameraStarts} showCamera={scanInput !== 'scanner'} />
      {settings.testMode && security.admin && <TestScanPanel onScan={(text) => void handleText(text, 'test')} />}
      {result && <ResultOverlay result={result} onClose={clearResult} />}
    </div>
  );
}
