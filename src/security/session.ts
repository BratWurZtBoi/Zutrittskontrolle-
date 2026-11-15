/**
 * Sicherheitszustand zur Laufzeit (nur im Arbeitsspeicher):
 * - Datenschlüssel: vorhanden = Personendaten entsperrt (Scanner zeigt Namen/Fotos).
 * - Admin-Sitzung: Zugriff auf Karten, Gruppen, Einstellungen usw.
 *   Endet bei „Abmelden“ oder automatisch nach Inaktivität – die Daten bleiben
 *   dabei entsperrt, damit der Scanner weiter Namen anzeigt.
 * - Bediener-Sitzung (PIN): nur Dashboard und Übersicht, z. B. zum Bestätigen von
 *   Eintritten. Setzt voraus, dass der Admin die Daten seit dem Start entsperrt hat.
 * - „Sperren“ verwirft zusätzlich den Datenschlüssel.
 */
import type { StaffRole } from '../domain/types';
import {
  WrongPasswordError,
  changeVaultPassword,
  createPinRecord,
  createVault,
  passwordProblem,
  unlockVault,
  verifyPinRecord,
} from './crypto';
import { loadOperatorPin, loadVault, migratePlaintext, removeOperatorPin, saveOperatorPin, saveVault } from '../db/vault';

export type VaultState = 'loading' | 'setup' | 'locked' | 'unlocked';

export interface SecurityState {
  vault: VaultState;
  /** Admin angemeldet (alle Rechte). */
  admin: boolean;
  /** Bediener angemeldet (Dashboard, Übersicht, Bestätigen) – nie gleichzeitig mit admin. */
  operator: boolean;
}

let state: SecurityState = { vault: 'loading', admin: false, operator: false };
let dataKey: CryptoKey | null = null;
const listeners = new Set<() => void>();

function setState(patch: Partial<SecurityState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSecurityState(): SecurityState {
  return state;
}

/** Wer ist für den Empfang angemeldet? (null = niemand) */
export function staffRole(s: SecurityState = state): StaffRole | null {
  if (s.admin) return 'admin';
  if (s.operator) return 'operator';
  return null;
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
  setState({ vault: vault ? 'locked' : 'setup', admin: false, operator: false });
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
  setState({ vault: 'unlocked', admin: true, operator: false });
  touchActivity();
}

/** Anmelden: entsperrt die Daten (falls nötig) und startet die Admin-Sitzung. */
export async function login(password: string): Promise<void> {
  const key = await verify(password);
  dataKey = key;
  setState({ vault: 'unlocked', admin: true, operator: false });
  touchActivity();
}

/**
 * Bediener mit PIN anmelden. Die PIN entschlüsselt nichts – deshalb nur möglich,
 * solange die Daten (vom Admin) entsperrt sind.
 */
export async function loginOperator(pin: string): Promise<void> {
  if (loginBlockedSeconds() > 0) {
    throw new Error(`Zu viele Fehlversuche. Bitte ${loginBlockedSeconds()} Sekunden warten.`);
  }
  if (!dataKey) throw new Error('Die Daten sind gesperrt. Bitte zuerst mit dem Admin-Passwort entsperren.');
  const record = await loadOperatorPin();
  if (!record) throw new Error('Es ist keine Bediener-PIN eingerichtet.');
  if (!(await verifyPinRecord(record, pin))) {
    registerFailure();
    throw new Error('Die PIN ist falsch.');
  }
  failures = 0;
  setState({ admin: false, operator: true });
  touchActivity();
}

/** Bediener-PIN festlegen oder ändern (nur Admin). */
export async function setOperatorPin(pin: string, iterations?: number): Promise<void> {
  if (!state.admin) throw new Error('Nur der Admin kann die Bediener-PIN ändern.');
  await saveOperatorPin(await createPinRecord(pin, iterations));
}

/** Bediener-Zugang abschalten (nur Admin). */
export async function disableOperatorPin(): Promise<void> {
  if (!state.admin) throw new Error('Nur der Admin kann die Bediener-PIN ändern.');
  await removeOperatorPin();
}

/** Abmelden (Admin oder Bediener) – die Daten bleiben für den Scanner entsperrt. */
export function logout(): void {
  setState({ admin: false, operator: false });
}

/** Alles sperren: abmelden und Datenschlüssel verwerfen. */
export function lockAll(): void {
  dataKey = null;
  setState({ vault: state.vault === 'setup' ? 'setup' : 'locked', admin: false, operator: false });
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

/**
 * Meldet ab, wenn länger als die eingestellte Zeit keine Bedienung erfolgte (0 = nie).
 * Admin und Bediener haben getrennte Zeiten (Bediener arbeiten oft eine ganze Schicht).
 */
export function checkAutoLogout(adminMinutes: number, now = Date.now(), operatorMinutes = 0): boolean {
  const minutes = state.admin ? adminMinutes : state.operator ? operatorMinutes : 0;
  if (minutes <= 0) return false;
  if (now - lastActivity > minutes * 60_000) {
    logout();
    return true;
  }
  return false;
}
