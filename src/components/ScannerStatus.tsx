import { AlertIcon, ScanIcon } from './Icons';

/** Kiosk ohne Kamera: großer Hinweis „Karte vor den Scanner halten“. */
export function ScannerOnlyStage({ reachable }: { reachable: boolean }) {
  return (
    <div className={reachable ? 'scanner-only' : 'scanner-only scanner-only-inactive'} role="status">
      {reachable ? <ScanIcon className="scanner-only-icon" /> : <AlertIcon className="scanner-only-icon" />}
      <strong>{reachable ? 'Karte vor den Scanner halten' : 'Bitte einmal hier tippen'}</strong>
      <span>{reachable ? 'USB-Scanner bereit' : 'Das Fenster ist nicht aktiv – Scans kommen sonst nicht an.'}</span>
    </div>
  );
}

/** Warnung, wenn Eingaben des USB-Scanners gerade nicht ankommen (anderes Fenster aktiv). */
export function ScannerInactiveNote({ className = '' }: { className?: string }) {
  return (
    <p className={`scanner-inactive-note ${className}`} role="alert">
      <AlertIcon />
      <span>Fenster nicht aktiv – Scans vom USB-Scanner kommen nicht an. Zum Scannen einmal hier klicken.</span>
    </p>
  );
}
