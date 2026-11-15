/** Gerätefunktionen über Web-APIs (Chrome/Edge auf Android und Windows). */

/** Druckt die aktuelle Seite (Android: Druckdialog inkl. „Als PDF speichern“). */
export function printCurrentPage(): void {
  window.print();
}

let wakeLock: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!wanted || wakeLock || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    /* z. B. Energiesparmodus – dann bleibt das Standardverhalten */
  }
}

document.addEventListener('visibilitychange', () => {
  void acquire();
});

/** Hält den Bildschirm eingeschaltet, solange der Scanner geöffnet ist. */
export async function setKeepScreenOn(enabled: boolean): Promise<void> {
  wanted = enabled;
  if (enabled) {
    await acquire();
  } else {
    const lock = wakeLock;
    wakeLock = null;
    await lock?.release().catch(() => undefined);
  }
}
