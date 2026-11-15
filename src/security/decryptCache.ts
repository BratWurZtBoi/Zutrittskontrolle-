/**
 * Zwischenspeicher für entschlüsselte Werte (nur im Arbeitsspeicher).
 * Viele Protokolleinträge enthalten denselben verschlüsselten Namen (kopiert von
 * der Karte) – so wird jeder Name nur einmal entschlüsselt.
 * Der Cache hängt am Schlüsselobjekt: Nach dem Sperren ist er nicht mehr erreichbar.
 */
import type { EncryptedData } from '../domain/types';

const MAX_ENTRIES = 5000;
const caches = new WeakMap<CryptoKey, Map<string, Promise<unknown>>>();

function cacheKey(enc: EncryptedData): string {
  // Der IV ist pro Verschlüsselung zufällig und damit eindeutig.
  let s = '';
  for (const b of enc.iv) s += b.toString(16).padStart(2, '0');
  return `${s}:${enc.data.length}`;
}

export function cachedDecrypt<T>(key: CryptoKey, enc: EncryptedData, decrypt: () => Promise<T>): Promise<T> {
  let cache = caches.get(key);
  if (!cache) {
    cache = new Map();
    caches.set(key, cache);
  }
  const id = cacheKey(enc);
  const hit = cache.get(id) as Promise<T> | undefined;
  if (hit) return hit;
  if (cache.size >= MAX_ENTRIES) cache.clear();
  const promise = decrypt();
  // Fehler nicht zwischenspeichern
  promise.catch(() => cache.delete(id));
  cache.set(id, promise);
  return promise;
}
