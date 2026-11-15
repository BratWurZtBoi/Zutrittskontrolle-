import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { PresentationView } from '../components/PresentationView';
import { listLayouts } from '../db/layouts';
import { BUILT_IN_LAYOUTS, pickLayout } from '../domain/presentationLayout';
import { useSettings } from '../hooks/useSettings';
import { setKeepScreenOn } from '../lib/device';
import { announcePresentation, listenForScans, type PresentationScan } from '../lib/presentation';

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
 * ausgebucht wurde – im Layout der Gruppe bzw. Karte; dazwischen den aktiven Ruhebildschirm. Empfängt die Ergebnisse vom
 * Scanner/Dashboard im selben Browser. Liest selbst keine Personendaten aus der
 * Datenbank, nur Einstellungen und Layouts.
 */
export function PresentationPage() {
  const settings = useSettings();
  const layouts = useLiveQuery(listLayouts, [], BUILT_IN_LAYOUTS);
  const now = useClock();
  const [scan, setScan] = useState<PresentationScan | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    document.title = 'Zutrittskontrolle – Präsentation';
    void setKeepScreenOn(true);
    const stop = listenForScans(setScan);
    const stopAnnounce = announcePresentation();
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      stop();
      stopAnnounce();
      document.removeEventListener('fullscreenchange', onFs);
      void setKeepScreenOn(false);
    };
  }, []);

  useEffect(() => {
    if (!scan) return;
    const t = window.setTimeout(() => setScan(null), Math.max(2, scan.displaySec) * 1000);
    return () => window.clearTimeout(t);
  }, [scan]);

  // Ruhebildschirm und Scan-Anzeige sind getrennte Layouts
  const layout = scan ? pickLayout(layouts, { card: scan.layoutId }, 'result') : pickLayout(layouts, { fallback: settings.idleLayoutId }, 'idle');

  return (
    <>
      <PresentationView layout={layout} result={scan} orgName={settings.orgName} now={now} />
      {!scan && !isFullscreen && (
        <button
          type="button"
          className="btn presentation-fs"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
        >
          Vollbild (F11)
        </button>
      )}
    </>
  );
}
