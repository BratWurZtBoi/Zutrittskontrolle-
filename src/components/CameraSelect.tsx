import { useEffect, useState } from 'react';
import type { CameraChoice } from '../db/settings';
import { listCameras, type CameraDevice } from '../lib/camera';

interface Props {
  value: CameraChoice;
  onChange: (value: CameraChoice) => void;
  className?: string;
  /** Neu laden, sobald eine Kamera läuft (dann sind die Gerätenamen verfügbar). */
  refreshKey?: unknown;
}

/** Auswahl der Kamera: Front/Webcam, Rückkamera oder ein bestimmtes Gerät. */
export function CameraSelect({ value, onChange, className, refreshKey }: Props) {
  const [devices, setDevices] = useState<CameraDevice[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => void listCameras().then((d) => active && setDevices(d));
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', load);
    };
  }, [refreshKey]);

  const known = value === 'user' || value === 'environment' || devices.some((d) => `device:${d.deviceId}` === value);

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value as CameraChoice)}
      aria-label="Kamera auswählen"
    >
      <option value="user">Frontkamera / Webcam</option>
      <option value="environment">Rückkamera</option>
      {devices.length > 0 && (
        <optgroup label="Bestimmte Kamera">
          {devices.map((d) => (
            <option key={d.deviceId} value={`device:${d.deviceId}`}>
              {d.label}
            </option>
          ))}
        </optgroup>
      )}
      {!known && <option value={value}>Gespeicherte Kamera (nicht gefunden)</option>}
    </select>
  );
}
