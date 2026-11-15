import { useEffect, useRef, useState } from 'react';
import { describeCameraError, openCamera, stopStream } from '../lib/camera';
import { createQrDecoder } from './qrDecoder';

interface Props {
  facingMode: 'user' | 'environment';
  mirror: boolean;
  onCode: (text: string) => void;
}

/** Größte Kantenlänge des Bildes, das an den Decoder geht (Kompromiss Tempo/Reichweite). */
const MAX_DECODE_SIZE = 960;
/** Pause zwischen zwei Dekodierversuchen. */
const SCAN_INTERVAL_MS = 80;

/**
 * Dauerhaft aktive Kamera mit lokaler QR-Erkennung.
 * Startet die Kamera automatisch neu, wenn sie unterbrochen wurde
 * (z. B. nach dem Wechsel in eine andere App).
 */
export function CameraScanner({ facingMode, mirror, onCode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [error, setError] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [ready, setReady] = useState(false);

  // Kamera starten
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    setError(null);
    setReady(false);

    openCamera({ facingMode })
      .then(async (s) => {
        if (cancelled) {
          stopStream(s);
          return;
        }
        stream = s;
        s.getVideoTracks().forEach((t) => {
          t.addEventListener('ended', () => setRestartKey((k) => k + 1));
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        await video.play().catch(() => undefined);
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeCameraError(err));
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible' && stream && !stream.active) setRestartKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      stopStream(stream);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [facingMode, restartKey]);

  // Scan-Schleife
  useEffect(() => {
    if (!ready) return;
    const decoder = createQrDecoder();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let stopped = false;
    let timer: number | undefined;

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video || !ctx) return;
      if (video.readyState >= 2 && video.videoWidth > 0 && document.visibilityState === 'visible') {
        const scale = Math.min(1, MAX_DECODE_SIZE / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.drawImage(video, 0, 0, w, h);
        const text = await decoder.decode(ctx.getImageData(0, 0, w, h));
        if (!stopped && text) onCodeRef.current(text);
      }
      if (!stopped) timer = window.setTimeout(tick, SCAN_INTERVAL_MS);
    };
    void tick();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      decoder.dispose();
    };
  }, [ready]);

  return (
    <div className="camera">
      <video
        ref={videoRef}
        className={mirror ? 'camera-video mirrored' : 'camera-video'}
        playsInline
        muted
        autoPlay
      />
      {!error && <div className="camera-frame" aria-hidden="true" />}
      {!ready && !error && <div className="camera-message">Kamera wird gestartet …</div>}
      {error && (
        <div className="camera-message camera-error">
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => setRestartKey((k) => k + 1)}>
            Erneut versuchen
          </button>
        </div>
      )}
    </div>
  );
}
