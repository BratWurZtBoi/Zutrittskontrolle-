import { useEffect, useRef, useState } from 'react';
import type { CameraChoice } from '../db/settings';
import { useSettings } from '../hooks/useSettings';
import { describeCameraError, openCamera, stopStream } from '../lib/camera';
import { captureToDataUrl, fileToDataUrl } from '../lib/image';
import { CameraSelect } from './CameraSelect';

interface Props {
  value?: string;
  onChange: (value: string | undefined) => void;
}

/** Foto per Kamera (Smartphone, Tablet, Webcam) aufnehmen oder als Datei wählen. */
export function PhotoCapture({ value, onChange }: Props) {
  const settings = useSettings();
  const [cameraOn, setCameraOn] = useState(false);
  const [camera, setCamera] = useState<CameraChoice | null>(null);
  const [started, setStarted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeCamera = camera ?? settings.camera;

  useEffect(() => {
    if (!cameraOn) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    openCamera({ camera: activeCamera, width: 1280, height: 960 })
      .then((s) => {
        if (cancelled) return stopStream(s);
        stream = s;
        setStarted((n) => n + 1);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch((err: unknown) => !cancelled && setError(describeCameraError(err)));
    return () => {
      cancelled = true;
      stopStream(stream);
    };
  }, [cameraOn, activeCamera]);

  const capture = () => {
    if (!videoRef.current) return;
    try {
      onChange(captureToDataUrl(videoRef.current));
      setCameraOn(false);
    } catch {
      setError('Foto konnte nicht aufgenommen werden.');
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await fileToDataUrl(file));
    } catch {
      setError('Die Bilddatei konnte nicht gelesen werden.');
    }
  };

  return (
    <div className="photo-capture">
      {cameraOn ? (
        <div className="photo-camera">
          <video ref={videoRef} className={activeCamera === 'environment' ? '' : 'mirrored'} playsInline muted autoPlay />
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={capture}>
              Auslösen
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCameraOn(false)}>
              Abbrechen
            </button>
          </div>
          <CameraSelect value={activeCamera} onChange={setCamera} refreshKey={started} className="camera-select" />
        </div>
      ) : (
        <div className="photo-preview">
          {value ? <img src={value} alt="Foto" /> : <div className="photo-empty">Kein Foto</div>}
          <div className="button-row">
            <button type="button" className="btn" onClick={() => setCameraOn(true)}>
              Foto aufnehmen
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Bild wählen
            </button>
            {value && (
              <button type="button" className="btn btn-ghost" onClick={() => onChange(undefined)}>
                Entfernen
              </button>
            )}
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
