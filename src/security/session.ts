/**
 * Sicherheitszustand zur Laufzeit (nur im Arbeitsspeicher):
 * - Datenschlüssel: vorhanden = Personendaten entsperrt (Scanner zeigt Namen/Fotos).
 * - Admin-Sitzung: Zugriff auf Karten, Gruppen, Einstellungen usw.
 *   Endet bei „Abmelden“ oder automatisch nach Inaktivität – die Daten bleiben
 *   dabei entsperrt, damit der Scanner weiter Namen anzeigt.
 * - „Sperren“ verwirft zusätzlich den Datenschlüssel.
 */
import { WrongPasswordError, changeVaultPassword, createVault, passwordProblem, unlockVault } from './crypto';
import { loadVault, migratePlaintext, saveVault } from '../db/vault';

export type VaultState = 'loading' | 'setup' | 'locked' | 'unlocked';

export interface SecurityState {
  vault: VaultState;
  admin: boolean;
}

let state: SecurityState = { vault: 'loading', admin: false };
let dataKey: CryptoKey | null = null;
const listeners = new Set<() => void>();

function setState(patch: Partial<SecurityState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSecurityState(): SecurityState {
  return state;
}

export function subscribeSecurity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Datenschlüssel für die Datenbankschicht (null = gesperrt). */
export function getDataKey(): CryptoKey | null {
  return dataKey;
}

/** Nur für Tests: Schlüssel direkt setzen. */
export function setDataKeyForTests(key: CryptoKey | null): void {
  dataKey = key;
  setState({ vault: key ? 'unlocked' : 'locked' });
}

/** Beim App-Start: Gibt es schon einen Tresor? */
export async function initSecurity(): Promise<void> {
  const vault = await loadVault();
  dataKey = null;
  setState({ vault: vault ? 'locked' : 'setup', admin: false });
}

// --- Fehlversuche bremsen -------------------------------------------------
let failures = 0;
let blockedUntil = 0;

export function loginBlockedSeconds(now = Date.now()): number {
  return Math.max(0, Math.ceil((blockedUntil - now) / 1000));
}

function registerFailure(): void {
  failures++;
  if (failures >= 5) blockedUntil = Date.now() + Math.min(300, 15 * 2 ** (failures - 5)) * 1000;
}

async function verify(password: string): Promise<CryptoKey> {
  if (loginBlockedSeconds() > 0) {
    throw new Error(`Zu viele Fehlversuche. Bitte ${loginBlockedSeconds()} Sekunden warten.`);
  }
  const vault = await loadVault();
  if (!vault) throw new Error('Es ist noch kein Passwort eingerichtet.');
  try {
    const key = await unlockVault(vault, password);
    failures = 0;
    return key;
  } catch (err) {
    if (err instanceof WrongPasswordError) registerFailure();
    throw err;
  }
}

// --- Aktionen -------------------------------------------------------------

/** Ersteinrichtung: Tresor anlegen, vorhandene Klartextdaten verschlüsseln, anmelden. */
export async function setupPassword(password: string, iterations?: number): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if (await loadVault()) throw new Error('Es ist bereits ein Passwort eingerichtet.');
  const { vault, dataKey: key } = await createVault(password, iterations);
  await saveVault(vault);
  await migratePlaintext(key);
  dataKey = key;
  setState({ vault: 'unlocked', admin: true });
  touchActivity();
}

/** Anmelden: entsperrt die Daten (falls nötig) und startet die Admin-Sitzung. */
export async function login(password: string): Promise<void> {
  const key = await verify(password);
  dataKey = key;
  setState({ vault: 'unlocked', admin: true });
  touchActivity();
}

/** Admin abmelden – die Daten bleiben für den Scanner entsperrt. */
export function logout(): void {
  setState({ admin: false });
}

/** Alles sperren: Admin abmelden und Datenschlüssel verwerfen. */
export function lockAll(): void {
  dataKey = null;
  setState({ vault: state.vault === 'setup' ? 'setup' : 'locked', admin: false });
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const problem = passwordProblem(newPassword);
  if (problem) throw new Error(problem);
  const vault = await loadVault();
  if (!vault) throw new Error('Es ist noch kein Passwort eingerichtet.');
  if (loginBlockedSeconds() > 0) throw new Error(`Zu viele Fehlversuche. Bitte ${loginBlockedSeconds()} Sekunden warten.`);
  try {
    await saveVault(await changeVaultPassword(vault, oldPassword, newPassword));
    failures = 0;
  } catch (err) {
    if (err instanceof WrongPasswordError) registerFailure();
    throw err;
  }
}

// --- Automatische Abmeldung -------------------------------------------------
let lastActivity = Date.now();

export function touchActivity(now = Date.now()): void {
  lastActivity = now;
}

/** Meldet den Admin ab, wenn länger als `minutes` keine Bedienung erfolgte (0 = nie). */
export function checkAutoLogout(minutes: number, now = Date.now()): boolean {
  if (!state.admin || minutes <= 0) return false;
  if (now - lastActivity > minutes * 60_000) {
    logout();
    return true;
  }
  return false;
}
