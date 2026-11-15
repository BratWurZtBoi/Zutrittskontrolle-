import { useEffect, useState } from 'react';
import { textColorOn } from '../domain/color';
import { useSettings } from '../hooks/useSettings';
import { setKeepScreenOn } from '../lib/device';
import { listenForScans, type PresentationScan } from '../lib/presentation';
import { AlertIcon, CheckIcon, CrossIcon, ExitIcon } from '../components/Icons';

const ICONS = { ok: CheckIcon, out: ExitIcon, deny: CrossIcon, warn: AlertIcon };

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/**
 * Gästeansicht für einen zweiten Bildschirm: zeigt groß, ob der Gast ein- oder
 * ausgebucht wurde. Empfängt die Ergebnisse vom Scanner/Dashboard im selben Browser.
 */
export function PresentationPage() {
  const settings = useSettings();
  const now = useClock();
  const [scan, setScan] = useState<PresentationScan | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    document.title = 'Zutrittskontrolle – Präsentation';
    void setKeepScreenOn(true);
    const stop = listenForScans(setScan);
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      stop();
      document.removeEventListener('fullscreenchange', onFs);
      void setKeepScreenOn(false);
    };
  }, []);

  useEffect(() => {
    if (!scan) return;
    const t = window.setTimeout(() => setScan(null), Math.max(2, scan.displaySec) * 1000);
    return () => window.clearTimeout(t);
  }, [scan]);

  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (scan) {
    const Icon = ICONS[scan.tone];
    return (
      <div className={`presentation presentation-result result-${scan.tone}`} role="alert">
        <div className="presentation-title">
          <Icon className="presentation-icon" />
          {scan.title}
        </div>
        {scan.photo && <img className="presentation-photo" src={scan.photo} alt="" />}
        {scan.name && <div className="presentation-name">{scan.name}</div>}
        {scan.groupName && (
          <span
            className="presentation-group"
            style={scan.groupColor ? { background: scan.groupColor, color: textColorOn(scan.groupColor) } : undefined}
          >
            {scan.groupName}
          </span>
        )}
        <div className="presentation-detail">{scan.detail}</div>
      </div>
    );
  }

  return (
    <div className="presentation presentation-idle">
      <div className="presentation-org">{settings.orgName}</div>
      <div className="presentation-welcome">Herzlich willkommen</div>
      <div className="presentation-hint">Bitte Karte mit QR-Code vor die Kamera halten</div>
      <div className="presentation-clock">{time}</div>
      <div className="presentation-date">{date}</div>
      {!isFullscreen && (
        <button
          type="button"
          className="btn presentation-fs"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
        >
          Vollbild (F11)
        </button>
      )}
    </div>
  );
}
