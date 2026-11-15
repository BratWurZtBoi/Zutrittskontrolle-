/**
 * Verschlüsselung mit der Web Crypto API (im Browser eingebaut, keine Fremdbibliothek).
 *
 * Aufbau („Schlüsselumhüllung“):
 * - Ein zufälliger Datenschlüssel (AES-256-GCM) verschlüsselt die Personendaten.
 * - Aus dem Admin-Passwort wird mit PBKDF2-SHA-256 (600 000 Runden) ein
 *   Schlüssel abgeleitet, der den Datenschlüssel verschlüsselt („umhüllt“).
 * - Gespeichert werden nur Salt, Rundenzahl und der umhüllte Datenschlüssel.
 *   Ohne Passwort lässt sich der Datenschlüssel nicht wiederherstellen.
 * - Passwortwechsel: nur der Datenschlüssel wird neu umhüllt, die Daten bleiben.
 */

export const PBKDF2_ITERATIONS = 600_000;

import type { EncryptedData } from '../domain/types';

export type { EncryptedData };

export interface VaultRecord {
  version: 1;
  salt: Uint8Array;
  iterations: number;
  wrapIv: Uint8Array;
  wrappedKey: Uint8Array;
  createdAt: number;
  updatedAt: number;
}

const subtle = () => globalThis.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** Kopie als eigenständiger ArrayBuffer (für Web Crypto und IndexedDB). */
function bytes(view: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(view);
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Das Passwort ist falsch.');
    this.name = 'WrongPasswordError';
  }
}

async function deriveWrappingKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encoder.encode(password.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function wrapWith(kek: CryptoKey, dataKey: CryptoKey) {
  const wrapIv = randomBytes(12);
  const wrapped = await subtle().wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv: wrapIv });
  return { wrapIv, wrappedKey: new Uint8Array(wrapped) };
}

async function unwrapWith(kek: CryptoKey, vault: Pick<VaultRecord, 'wrapIv' | 'wrappedKey'>, extractable: boolean) {
  try {
    return await subtle().unwrapKey(
      'raw',
      bytes(vault.wrappedKey),
      kek,
      { name: 'AES-GCM', iv: bytes(vault.wrapIv) },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new WrongPasswordError();
  }
}

/** Neuer Tresor: erzeugt einen Datenschlüssel und umhüllt ihn mit dem Passwort. */
export async function createVault(
  password: string,
  iterations = PBKDF2_ITERATIONS,
  now = Date.now(),
): Promise<{ vault: VaultRecord; dataKey: CryptoKey }> {
  const extractable = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const salt = randomBytes(16);
  const kek = await deriveWrappingKey(password, salt, iterations);
  const vault: VaultRecord = {
    version: 1,
    salt,
    iterations,
    ...(await wrapWith(kek, extractable)),
    createdAt: now,
    updatedAt: now,
  };
  // Für den laufenden Betrieb eine nicht exportierbare Kopie verwenden
  return { vault, dataKey: await unwrapWith(kek, vault, false) };
}

/** Entsperrt den Tresor. Wirft WrongPasswordError bei falschem Passwort. */
export async function unlockVault(vault: VaultRecord, password: string, extractable = false): Promise<CryptoKey> {
  const kek = await deriveWrappingKey(password, vault.salt, vault.iterations);
  return unwrapWith(kek, vault, extractable);
}

/** Passwort ändern: Datenschlüssel mit neuem Passwort umhüllen (Daten bleiben unverändert). */
export async function changeVaultPassword(
  vault: VaultRecord,
  oldPassword: string,
  newPassword: string,
  now = Date.now(),
): Promise<VaultRecord> {
  const key = await unlockVault(vault, oldPassword, true);
  const salt = randomBytes(16);
  const kek = await deriveWrappingKey(newPassword, salt, vault.iterations);
  return { ...vault, salt, ...(await wrapWith(kek, key)), updatedAt: now };
}

export async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<EncryptedData> {
  const iv = randomBytes(12);
  const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, bytes(plain));
  return { iv, data: new Uint8Array(data) };
}

export async function decryptBytes(key: CryptoKey, enc: EncryptedData): Promise<Uint8Array> {
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: bytes(enc.iv) }, key, bytes(enc.data));
  return new Uint8Array(plain);
}

export async function encryptText(key: CryptoKey, text: string): Promise<EncryptedData> {
  return encryptBytes(key, encoder.encode(text));
}

export async function decryptText(key: CryptoKey, enc: EncryptedData): Promise<string> {
  return decoder.decode(await decryptBytes(key, enc));
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedData> {
  return encryptText(key, JSON.stringify(value));
}

export async function decryptJson<T>(key: CryptoKey, enc: EncryptedData): Promise<T> {
  return JSON.parse(await decryptText(key, enc)) as T;
}

/** Mindestanforderungen an das Admin-Passwort (null = in Ordnung). */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  if (password.trim() !== password) return 'Das Passwort darf nicht mit Leerzeichen beginnen oder enden.';
  return null;
}

// ---------------------------------------------------------------------------
// Passwortbasierte Verschlüsselung für Backup-Dateien
// ---------------------------------------------------------------------------

export interface PasswordEncrypted {
  salt: Uint8Array;
  iterations: number;
  iv: Uint8Array;
  data: Uint8Array;
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encoder.encode(password.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Verschlüsselt Daten direkt mit einem Passwort (eigenes Salt, eigener IV). */
export async function encryptWithPassword(
  plain: Uint8Array,
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<PasswordEncrypted> {
  const salt = randomBytes(16);
  const key = await derivePasswordKey(password, salt, iterations);
  const { iv, data } = await encryptBytes(key, plain);
  return { salt, iterations, iv, data };
}

/** Entschlüsselt passwortverschlüsselte Daten. Wirft WrongPasswordError bei falschem Passwort. */
export async function decryptWithPassword(enc: PasswordEncrypted, password: string): Promise<Uint8Array> {
  const key = await derivePasswordKey(password, enc.salt, enc.iterations);
  try {
    return await decryptBytes(key, { iv: enc.iv, data: enc.data });
  } catch {
    throw new WrongPasswordError();
  }
}

// ---------------------------------------------------------------------------
// Hilfen: Base64 und Komprimierung
// ---------------------------------------------------------------------------

export function toBase64(data: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    s += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function transform(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const result = await new Response(new Blob([bytes(data)]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(result);
}

export const compressionAvailable = (): boolean => typeof CompressionStream === 'function';

export function gzip(data: Uint8Array): Promise<Uint8Array> {
  return transform(data, new CompressionStream('gzip'));
}

export function gunzip(data: Uint8Array): Promise<Uint8Array> {
  return transform(data, new DecompressionStream('gzip'));
}
