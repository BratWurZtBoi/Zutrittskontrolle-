import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { saveSettings, type AppSettings } from '../db/settings';
import type { ScanMode } from '../domain/types';
import { CameraSelect } from './CameraSelect';

const MODES: { value: ScanMode; label: string }[] = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'in', label: 'Nur Eingang' },
  { value: 'out', label: 'Nur Ausgang' },
];

/** Modus (Auto/Eingang/Ausgang), Kameraauswahl und Anwesenheitszähler. */
export function ScannerControls({ settings, cameraStarts, showCamera = true }: { settings: AppSettings; cameraStarts: number; showCamera?: boolean }) {
  const presentCount = useLiveQuery(() => db.presence.where('status').equals('in').count(), [], 0);
  return (
    <div className="scanner-bar no-print">
      <div className="segmented" role="radiogroup" aria-label="Scan-Modus">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={settings.scanMode === m.value}
            className={settings.scanMode === m.value ? 'active' : ''}
            onClick={() => void saveSettings({ scanMode: m.value })}
          >
            {m.label}
          </button>
        ))}
      </div>
      {showCamera && (
        <CameraSelect
          value={settings.camera}
          onChange={(camera) => void saveSettings({ camera })}
          refreshKey={cameraStarts}
          className="camera-select"
        />
      )}
      <span className="present-count">
        Anwesend: <strong>{presentCount}</strong>
      </span>
    </div>
  );
}
