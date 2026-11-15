import { isDesktopApp } from './lib/desktop';

/** Registriert den Service Worker: Danach ist die App vollständig auf dem Gerät gespeichert und läuft offline. */
export async function setupPwa(): Promise<void> {
  // Im Windows-Programm liegen die Dateien ohnehin auf dem Rechner – kein Service Worker nötig
  if (!('serviceWorker' in navigator) || import.meta.env.DEV || isDesktopApp()) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

/** Bittet den Browser, die lokalen Daten nicht automatisch zu löschen. */
export async function requestPersistentStorage(): Promise<boolean | undefined> {
  try {
    if (!navigator.storage?.persist) return undefined;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return undefined;
  }
}

export async function isStoragePersisted(): Promise<boolean | undefined> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : undefined;
  } catch {
    return undefined;
  }
}
