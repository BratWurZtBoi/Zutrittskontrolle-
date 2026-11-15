import { isNativeApp } from './native/kiosk';

/** Registriert den Service Worker (Offline-Betrieb) – nur im Browser, nicht in der Android-App. */
export async function setupPwa(): Promise<void> {
  if (isNativeApp() || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
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
