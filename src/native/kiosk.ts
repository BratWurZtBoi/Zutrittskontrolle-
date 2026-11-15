/**
 * Brücke zu nativen Funktionen der Android-App (siehe
 * android/app/src/main/java/de/zutrittskontrolle/app/KioskPlugin.java).
 * Im Browser/PWA werden Web-APIs als Ersatz verwendet.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface KioskPlugin {
  print(options: { name: string }): Promise<void>;
  setKeepScreenOn(options: { enabled: boolean }): Promise<void>;
}

const Kiosk = registerPlugin<KioskPlugin>('Kiosk');

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
export const platformName = (): string => Capacitor.getPlatform();

/** Druckt die aktuelle Seite (Android: System-Druckdialog inkl. „Als PDF speichern“). */
export async function printCurrentPage(jobName: string): Promise<void> {
  if (isNativeApp()) {
    await Kiosk.print({ name: jobName });
  } else {
    window.print();
  }
}

let wakeLock: WakeLockSentinel | null = null;

/** Hält den Bildschirm eingeschaltet (für den Dauerbetrieb des Scanners). */
export async function setKeepScreenOn(enabled: boolean): Promise<void> {
  if (isNativeApp()) {
    try {
      await Kiosk.setKeepScreenOn({ enabled });
    } catch {
      /* ältere App-Version ohne Plugin */
    }
    return;
  }
  try {
    if (enabled) {
      if (!wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      }
    } else {
      await wakeLock?.release();
      wakeLock = null;
    }
  } catch {
    /* Wake Lock nicht verfügbar */
  }
}
