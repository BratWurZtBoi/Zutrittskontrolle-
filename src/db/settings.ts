import type { ScannerSpeed } from '../domain/keyboardScan';
import type { BackMode, FlipEdge } from '../domain/printLayout';
import type { ScanMode } from '../domain/types';

export type CameraChoice = 'user' | 'environment' | `device:${string}`;
import { db } from './db';

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** Womit gescannt wird: Kamera, USB-Scanner (Tastatur-Modus) oder beides. */
export type ScanInput = 'both' | 'camera' | 'scanner';

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
  /** Automatische Abmeldung des Bedieners nach Minuten ohne Bedienung (0 = nie). */
  operatorAutoLogoutMin: number;
  /** Wartende Eintritte verfallen nach so vielen Sekunden ohne Bestätigung. */
  confirmTimeoutSec: number;
  /** Löschfrist: Protokolleinträge nach so vielen Tagen löschen (0 = nie). */
  retentionDays: number;
  /** Zeitpunkt des letzten Backups auf diesem Gerät. */
  lastBackupAt?: number;
  /** Kameravorschau im Dashboard: klein, groß oder ausgeblendet (Scannen läuft weiter). */
  dashCamera: DashCameraSize;
  /** Scan-Anzeige für alle Gruppen/Karten ohne eigenes Layout. */
  defaultLayoutId: string;
  /** Aktiver Ruhebildschirm (Gästebildschirm, solange niemand scannt). */
  idleLayoutId: string;
  /** Kartenlayout für alle Gruppen ohne eigenes. */
  defaultCardLayoutId: string;
  /** Druckformat: A4-Bogen (mehrere Karten) oder Kartendrucker (eine Karte je Seite). */
  cardPrintFormat: 'sheet' | 'card-printer';
  /** Rückseiten drucken: nicht, beidseitig (Duplex) oder zum Falten (nur A4). */
  cardPrintBack: BackMode;
  /** Beidseitig: an der langen oder kurzen Kante wenden (wie im Druckdialog). */
  cardPrintFlip: FlipEdge;
  /** A4-Bogen: Schnittmarken drucken. */
  cardPrintCutMarks: boolean;
  /** Kiosk-Modus: Vollbild-Scanner als Startseite für ein Gerät am Eingang ohne Bediener (je Gerät). */
  kioskMode: boolean;
  /** Scannen mit Kamera, USB-Scanner oder beidem (je Gerät). */
  scanInput: ScanInput;
  /** Tempo des USB-Scanners: normal oder langsam (Bluetooth/gedrosselt). */
  scannerSpeed: ScannerSpeed;
  /** Notfallliste mit Fotos drucken (je Gerät). */
  emergencyPhotos: boolean;
  /** Windows-/Linux-Programm: Notfallliste ohne Druckdialog sofort drucken (je Gerät). */
  emergencyDirectPrint: boolean;
  /** Drucker dafür ('' = Standarddrucker des Systems). */
  emergencyPrinter: string;
  /** Anzahl Ausdrucke (z. B. einer je Sammelplatz). */
  emergencyCopies: number;
  /** Einlass läuft für diese Veranstaltung (je Gerät; leer = normale Zutrittskontrolle). */
  activeOccasionId?: string;
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
  operatorAutoLogoutMin: 0,
  confirmTimeoutSec: 90,
  retentionDays: 90,
  dashCamera: 'small',
  defaultLayoutId: 'standard',
  idleLayoutId: 'standard-idle',
  defaultCardLayoutId: 'standard-karte',
  cardPrintFormat: 'sheet',
  cardPrintBack: 'none',
  cardPrintFlip: 'long',
  cardPrintCutMarks: true,
  kioskMode: false,
  scanInput: 'both',
  scannerSpeed: 'fast',
  emergencyPhotos: false,
  emergencyDirectPrint: false,
  emergencyPrinter: '',
  emergencyCopies: 1,
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
