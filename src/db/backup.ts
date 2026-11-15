/**
 * Datensicherung: verschlüsseltes Voll-Backup als Datei.
 *
 * Inhalt: Gruppen, Karten (mit Personendaten), Protokoll, Anwesenheit und
 * geräteunabhängige Einstellungen – komprimiert und mit einem eigenen
 * Backup-Passwort verschlüsselt (PBKDF2-SHA-256 + AES-256-GCM).
 * Das Admin-Passwort des Geräts wird NICHT übertragen: Beim Einspielen werden die
 * Personendaten mit dem Schlüssel des Zielgeräts neu verschlüsselt.
 */
import { holderName } from '../domain/texts';
import type { AccessEventRecord, CardHolder, CardRecord, Group, PresenceRecord } from '../domain/types';
import {
  compressionAvailable,
  decryptWithPassword,
  encryptJson,
  encryptText,
  encryptWithPassword,
  fromBase64,
  gunzip,
  gzip,
  passwordProblem,
  toBase64,
  PBKDF2_ITERATIONS,
} from '../security/crypto';
import { getDataKey } from '../security/session';
import { toCard } from './cards';
import { DEVICE_SECRET_KEYS, ValidationError, db } from './db';
import { toEvent } from './scans';
import { loadSettings, type AppSettings } from './settings';
import { normalizeLayout, type PresentationLayout } from '../domain/presentationLayout';

export const BACKUP_FORMAT = 'zutrittskontrolle-backup';
export const BACKUP_VERSION = 1;

/** Einstellungen, die mitgesichert werden (gerätebezogene wie Kamera bleiben auf dem Gerät). */
const PORTABLE_SETTINGS = [
  'orgName',
  'scanMode',
  'cooldownSec',
  'resultDisplaySec',
  'sound',
  'autoLogoutMin',
  'operatorAutoLogoutMin',
  'confirmTimeoutSec',
  'retentionDays',
  'defaultLayoutId',
] as const;
type PortableSettings = Partial<Pick<AppSettings, (typeof PORTABLE_SETTINGS)[number]>>;

export type BackupCard = Omit<CardRecord, 'holderEnc' | 'nameEnc' | 'holder'> & { holder?: CardHolder };
export type BackupEvent = Omit<AccessEventRecord, 'holderNameEnc'> & { holderName?: string };

export interface BackupPayload {
  exportedAt: number;
  appVersion: string;
  groups: Group[];
  cards: BackupCard[];
  events: BackupEvent[];
  presence: PresenceRecord[];
  settings: PortableSettings;
  /** Präsentationslayouts (ab App-Version 0.7; fehlt in älteren Backups). */
  layouts?: PresentationLayout[];
}

/** Äußere Hülle der Datei (JSON). */
interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  compression: 'gzip' | 'none';
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

export interface BackupSummary {
  exportedAt: number;
  appVersion: string;
  groups: number;
  cards: number;
  assignedCards: number;
  events: number;
}

export function summarize(p: BackupPayload): BackupSummary {
  return {
    exportedAt: p.exportedAt,
    appVersion: p.appVersion,
    groups: p.groups.length,
    cards: p.cards.length,
    assignedCards: p.cards.filter((c) => c.holder).length,
    events: p.events.length,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Sammelt alle Daten entschlüsselt (nur im Arbeitsspeicher). Daten müssen entsperrt sein. */
export async function collectBackup(appVersion = 'unbekannt', now = Date.now()): Promise<BackupPayload> {
  const key = getDataKey();
  if (!key) throw new ValidationError('Die Daten sind gesperrt. Bitte zuerst anmelden.');
  // erst lesen, dann entschlüsseln
  const [groups, cardRecords, eventRecords, presence, settings, layouts] = await Promise.all([
    db.groups.toArray(),
    db.cards.toArray(),
    db.events.toArray(),
    db.presence.toArray(),
    loadSettings(),
    db.layouts.toArray(),
  ]);
  const cards: BackupCard[] = await Promise.all(
    cardRecords.map(async (r) => {
      const { hasHolder: _h, holder, ...rest } = await toCard(r, key);
      if (r.holderEnc && !holder) throw new ValidationError(`Personendaten der Karte ${r.number} lassen sich nicht entschlüsseln.`);
      return holder ? { ...rest, holder } : rest;
    }),
  );
  const events: BackupEvent[] = await Promise.all(
    eventRecords.map(async (r) => {
      const { holderLocked: _l, ...rest } = await toEvent(r, key);
      return rest;
    }),
  );
  const portable: PortableSettings = {};
  for (const k of PORTABLE_SETTINGS) (portable as Record<string, unknown>)[k] = settings[k];
  return { exportedAt: now, appVersion, groups, cards, events, presence, settings: portable, layouts };
}

/** Erstellt die verschlüsselte Backup-Datei. */
export async function createBackupFile(
  password: string,
  appVersion?: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ blob: Blob; filename: string; summary: BackupSummary }> {
  const problem = passwordProblem(password);
  if (problem) throw new ValidationError(problem);
  const payload = await collectBackup(appVersion);
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = compressionAvailable();
  const plain = compressed ? await gzip(json) : json;
  const enc = await encryptWithPassword(plain, password, iterations);
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date(payload.exportedAt).toISOString(),
    compression: compressed ? 'gzip' : 'none',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: enc.iterations, salt: toBase64(enc.salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(enc.iv) },
    data: toBase64(enc.data),
  };
  const d = new Date(payload.exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `zutrittskontrolle-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.zkb`;
  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/octet-stream' });
  return { blob, filename, summary: summarize(payload) };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function parseEnvelope(text: string): BackupEnvelope {
  let env: unknown;
  try {
    env = JSON.parse(text);
  } catch {
    throw new ValidationError('Die Datei ist kein Backup der Zutrittskontrolle.');
  }
  const e = env as Partial<BackupEnvelope>;
  if (e?.format !== BACKUP_FORMAT) throw new ValidationError('Die Datei ist kein Backup der Zutrittskontrolle.');
  if (e.version !== BACKUP_VERSION) {
    throw new ValidationError('Dieses Backup stammt aus einer anderen App-Version und kann nicht gelesen werden.');
  }
  if (!e.kdf?.salt || !e.kdf.iterations || !e.cipher?.iv || typeof e.data !== 'string') {
    throw new ValidationError('Die Backup-Datei ist beschädigt.');
  }
  return e as BackupEnvelope;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Prüft den entschlüsselten Inhalt auf die erwartete Struktur. */
export function validatePayload(p: unknown): BackupPayload {
  const fail = (what: string): never => {
    throw new ValidationError(`Die Backup-Datei ist beschädigt (${what}).`);
  };
  const x = p as Partial<BackupPayload>;
  if (!x || !Array.isArray(x.groups) || !Array.isArray(x.cards) || !Array.isArray(x.events) || !Array.isArray(x.presence)) {
    fail('Aufbau');
  }
  for (const g of x.groups!) if (!isStr(g?.id) || !isStr(g.name) || !isStr(g.prefix) || !isStr(g.color)) fail('Gruppe');
  const groupIds = new Set(x.groups!.map((g) => g.id));
  const numbers = new Set<string>();
  const tokens = new Set<string>();
  for (const c of x.cards!) {
    if (!isStr(c?.id) || !isStr(c.number) || !isStr(c.token) || !isStr(c.groupId)) fail('Karte');
    if (!groupIds.has(c.groupId)) fail(`Gruppe der Karte ${c.number}`);
    if (numbers.has(c.number) || tokens.has(c.token)) fail(`doppelte Karte ${c.number}`);
    numbers.add(c.number);
    tokens.add(c.token);
    if (c.holder && (!isStr(c.holder.firstName) || !isStr(c.holder.lastName))) fail(`Personendaten ${c.number}`);
  }
  for (const e of x.events!) if (!isNum(e?.timestamp) || !isStr(e.outcome) || !isStr(e.reason)) fail('Protokoll');
  for (const pr of x.presence!) if (!isStr(pr?.cardId) || !isStr(pr.status) || !isNum(pr.lastBookingAt)) fail('Anwesenheit');
  return {
    exportedAt: isNum(x.exportedAt) ? x.exportedAt : 0,
    appVersion: isStr(x.appVersion) ? x.appVersion : 'unbekannt',
    groups: x.groups!,
    cards: x.cards!,
    events: x.events!,
    presence: x.presence!,
    settings: typeof x.settings === 'object' && x.settings ? x.settings : {},
    layouts: Array.isArray(x.layouts) ? x.layouts.filter((l) => isStr(l?.id)).map(normalizeLayout) : [],
  };
}

/** Öffnet eine Backup-Datei mit dem Backup-Passwort (ohne etwas zu verändern). */
export async function openBackupFile(text: string, password: string): Promise<BackupPayload> {
  const env = parseEnvelope(text);
  const plain = await decryptWithPassword(
    {
      salt: fromBase64(env.kdf.salt),
      iterations: env.kdf.iterations,
      iv: fromBase64(env.cipher.iv),
      data: fromBase64(env.data),
    },
    password,
  );
  let json: Uint8Array = plain;
  if (env.compression === 'gzip') {
    try {
      json = await gunzip(plain);
    } catch {
      throw new ValidationError('Die Backup-Datei ist beschädigt (Komprimierung).');
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new ValidationError('Die Backup-Datei ist beschädigt (Inhalt).');
  }
  return validatePayload(parsed);
}

/**
 * Spielt ein Backup ein und ERSETZT alle Daten auf diesem Gerät.
 * Das Admin-Passwort des Geräts bleibt bestehen; Personendaten werden mit dem
 * Schlüssel dieses Geräts neu verschlüsselt.
 */
export async function restoreBackup(payload: BackupPayload): Promise<BackupSummary> {
  const key = getDataKey();
  if (!key) throw new ValidationError('Die Daten sind gesperrt. Bitte zuerst anmelden.');

  // 1. Verschlüsseln (außerhalb der Transaktion)
  const cards: CardRecord[] = await Promise.all(
    payload.cards.map(async (c) => {
      const { holder, ...rest } = c;
      if (!holder) return rest;
      return {
        ...rest,
        holderEnc: await encryptJson(key, holder),
        nameEnc: await encryptText(key, holderName(holder) ?? ''),
      };
    }),
  );
  // Gleiche Namen im Protokoll nur einmal verschlüsseln
  const nameCache = new Map<string, Promise<Awaited<ReturnType<typeof encryptText>>>>();
  const events: AccessEventRecord[] = await Promise.all(
    payload.events.map(async (e) => {
      const { holderName: name, seq: _seq, ...rest } = e;
      if (name === undefined) return rest;
      if (!nameCache.has(name)) nameCache.set(name, encryptText(key, name));
      return { ...rest, holderNameEnc: await nameCache.get(name)! };
    }),
  );
  const current = await loadSettings();
  const settings = { ...current };
  for (const k of PORTABLE_SETTINGS) {
    const v = payload.settings[k];
    if (v !== undefined) (settings as Record<string, unknown>)[k] = v;
  }

  // 2. Alles in einer Transaktion ersetzen
  await db.transaction('rw', [db.groups, db.cards, db.events, db.presence, db.settings, db.layouts], async () => {
    await Promise.all([db.groups.clear(), db.cards.clear(), db.events.clear(), db.presence.clear(), db.layouts.clear()]);
    await db.settings.where('key').noneOf(DEVICE_SECRET_KEYS).delete();
    await db.layouts.bulkAdd(payload.layouts ?? []);
    await db.groups.bulkAdd(payload.groups);
    await db.cards.bulkAdd(cards);
    await db.events.bulkAdd(events);
    await db.presence.bulkAdd(payload.presence);
    await db.settings.put({ key: 'app', value: settings });
  });
  return summarize(payload);
}
