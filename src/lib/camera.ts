/** Kamerazugriff über getUserMedia – funktioniert im Browser, in der PWA und in der Android-App. */

import type { CameraChoice } from '../db/settings';

export interface CameraOptions {
  /** 'user' / 'environment' oder 'device:<deviceId>' für eine bestimmte Kamera (z. B. USB-Webcam). */
  camera: CameraChoice;
  width?: number;
  height?: number;
}

export async function openCamera({ camera, width = 1280, height = 720 }: CameraOptions): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  const size = { width: { ideal: width }, height: { ideal: height } };
  const video: MediaTrackConstraints = camera.startsWith('device:')
    ? { deviceId: { exact: camera.slice('device:'.length) }, ...size }
    : { facingMode: { ideal: camera }, ...size };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video });
  } catch (err) {
    // Gewählte Kamera nicht mehr vorhanden (z. B. USB-Webcam abgezogen) → Standardkamera
    if (camera.startsWith('device:') && isMissingDevice(err)) {
      return openCamera({ camera: 'user', width, height });
    }
    throw new CameraError(mapError(err), err);
  }
}

function isMissingDevice(err: unknown): boolean {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  return name === 'OverconstrainedError' || name === 'NotFoundError';
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** Verfügbare Kameras. Namen gibt der Browser erst nach erteilter Kamera-Erlaubnis heraus. */
export async function listCameras(): Promise<CameraDevice[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput' && d.deviceId)
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${i + 1}` }));
  } catch {
    return [];
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export type CameraErrorKind = 'insecure' | 'unsupported' | 'denied' | 'not-found' | 'busy' | 'unknown';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    readonly original?: unknown,
  ) {
    super(CAMERA_ERROR_TEXT[kind]);
    this.name = 'CameraError';
  }
}

const CAMERA_ERROR_TEXT: Record<CameraErrorKind, string> = {
  insecure: 'Die Kamera ist nur über HTTPS oder localhost verfügbar.',
  unsupported: 'Dieses Gerät bzw. dieser Browser unterstützt keinen Kamerazugriff.',
  denied: 'Kamerazugriff verweigert. Bitte die Kamera-Berechtigung in den Einstellungen erlauben.',
  'not-found': 'Keine Kamera gefunden.',
  busy: 'Die Kamera wird gerade von einer anderen Anwendung verwendet.',
  unknown: 'Die Kamera konnte nicht gestartet werden.',
};

function mapError(err: unknown): CameraErrorKind {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'unknown';
  }
}

export function describeCameraError(err: unknown): string {
  return err instanceof CameraError ? err.message : CAMERA_ERROR_TEXT.unknown;
}
