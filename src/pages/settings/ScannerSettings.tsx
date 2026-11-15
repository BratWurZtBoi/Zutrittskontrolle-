import { CameraSelect } from '../../components/CameraSelect';
import { NumberField } from '../../components/NumberField';
import { saveSettings, type AppSettings } from '../../db/settings';
import type { ScanMode } from '../../domain/types';
import { useSettings } from '../../hooks/useSettings';
import { SettingsShell } from './SettingsShell';

export function ScannerSettings() {
  const settings = useSettings();
  const save = (patch: Partial<AppSettings>) => void saveSettings(patch);

  return (
    <SettingsShell title="Scanner">
      <section className="card form">
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
          Testmodus (Scans im Scanner simulieren – nur sichtbar, solange ein Admin angemeldet ist)
        </label>
      </section>
    </SettingsShell>
  );
}
