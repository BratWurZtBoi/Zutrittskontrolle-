import type { ScanMode } from '../domain/types';

export type CameraChoice = 'user' | 'environment' | `device:${string}`;
import { db } from './db';

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** Größe der Kameravorschau im Dashboard (die Erkennung läuft immer in voller Auflösung). */
export type DashCameraSize = 'small' | 'large' | 'hidden';

export interface AppSettings {
  /** Darstellung: automatisch nach Systemeinstellung, hell oder dunkel (je Gerät). */
  theme: ThemeChoice;
  /** Name der Organisation – erscheint auf den Ausweisen. */
  orgName: string;
  scanMode: ScanMode;
  /** Doppelscan-Schutz in Sekunden (Mindestabstand zwischen Buchungen einer Person). */
  cooldownSec: number;
  /** Wie lange das Ergebnis groß angezeigt wird. */
  resultDisplaySec: number;
  /** Kamera: 'user' (Front/Webcam), 'environment' (Rückkamera) oder 'device:<id>' (bestimmtes Gerät). */
  camera: CameraChoice;
  mirrorPreview: boolean;
  sound: boolean;
  /** Zeigt im Scanner ein Feld zum Simulieren von Scans (nur für angemeldete Admins). */
  testMode: boolean;
  /** Automatische Admin-Abmeldung nach Minuten ohne Bedienung (0 = nie). */
  autoLogoutMin: number;
  /** Löschfrist: Protokolleinträge nach so vielen Tagen löschen (0 = nie). */
  retentionDays: number;
  /** Zeitpunkt des letzten Backups auf diesem Gerät. */
  lastBackupAt?: number;
  /** Kameravorschau im Dashboard: klein, groß oder ausgeblendet (Scannen läuft weiter). */
  dashCamera: DashCameraSize;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  orgName: 'Musterfirma (Testbetrieb)',
  scanMode: 'auto',
  cooldownSec: 30,
  resultDisplaySec: 4,
  camera: 'user',
  mirrorPreview: true,
  sound: true,
  testMode: false,
  autoLogoutMin: 15,
  retentionDays: 90,
  dashCamera: 'small',
};

const KEY = 'app';

export async function loadSettings(): Promise<AppSettings> {
  const rec = await db.settings.get(KEY);
  return { ...DEFAULT_SETTINGS, ...((rec?.value as Partial<AppSettings> | undefined) ?? {}) };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await loadSettings()), ...patch };
    await db.settings.put({ key: KEY, value: next });
    return next;
  });
}
