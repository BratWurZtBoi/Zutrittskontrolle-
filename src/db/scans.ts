import { decideAccess, type Decision } from '../domain/access';
import { parseCardPayload } from '../domain/cardCode';
import { holderName } from '../domain/texts';
import type { AccessEvent, AccessEventRecord, Card, Group, ScanMode } from '../domain/types';
import { decryptText } from '../security/crypto';
import { getDataKey } from '../security/session';
import { toCard } from './cards';
import { db } from './db';

export interface ScanOptions {
  mode: ScanMode;
  cooldownMs: number;
  source: AccessEventRecord['source'];
  now?: Date;
}

export interface ScanOutcome {
  decision: Decision;
  /** Karte – Personendaten nur, wenn die Daten entsperrt sind. */
  card?: Card;
  group?: Group;
  /** Protokolleintrag (fehlt bei Doppelscans – diese werden nicht gebucht). */
  event?: AccessEventRecord;
  at: number;
}

/**
 * Verarbeitet einen gescannten QR-Text: prüft die Karte, entscheidet,
 * protokolliert und aktualisiert die Anwesenheit – alles in einer Transaktion.
 * Funktioniert auch im gesperrten Zustand: Der verschlüsselte Name wird
 * unverändert ins Protokoll übernommen.
 */
export async function processScan(text: string, opts: ScanOptions): Promise<ScanOutcome> {
  const now = opts.now ?? new Date();
  const at = now.getTime();
  const token = parseCardPayload(text);

  const result = await db.transaction('rw', [db.cards, db.groups, db.presence, db.events], async () => {
    if (!token) {
      const event: AccessEventRecord = { timestamp: at, outcome: 'denied', reason: 'INVALID_CODE', source: opts.source };
      event.seq = await db.events.add(event);
      return { decision: { outcome: 'denied', reason: 'INVALID_CODE' } as Decision, event, record: undefined, group: undefined };
    }

    const record = await db.cards.where('token').equals(token).first();
    const group = record ? await db.groups.get(record.groupId) : undefined;
    const presence = record ? await db.presence.get(record.id) : undefined;
    const decision = decideAccess({
      card: record ? { ...record, hasHolder: Boolean(record.holderEnc || record.holder) } : undefined,
      group,
      presence,
      mode: opts.mode,
      now,
      cooldownMs: opts.cooldownMs,
    });

    if (decision.outcome === 'duplicate') return { decision, record, group, event: undefined };

    const event: AccessEventRecord = {
      timestamp: at,
      outcome: decision.outcome,
      direction: decision.direction,
      reason: decision.reason,
      cardId: record?.id,
      cardNumber: record?.number,
      groupId: record?.groupId,
      groupName: group?.name,
      holderNameEnc: record?.nameEnc,
      holderName: record && !record.nameEnc ? holderName(record.holder) : undefined,
      source: opts.source,
    };
    event.seq = await db.events.add(event);

    if (record && decision.outcome === 'granted' && decision.direction) {
      await db.presence.put({ cardId: record.id, status: decision.direction, lastBookingAt: at });
    }
    return { decision, record, group, event };
  });

  // Entschlüsseln erst nach der Transaktion
  const card = result.record ? await toCard(result.record) : undefined;
  return { decision: result.decision, card, group: result.group, event: result.event, at };
}

/** Protokolleintrag für die Anzeige aufbereiten (Name entschlüsseln, falls möglich). */
export async function toEvent(record: AccessEventRecord, key: CryptoKey | null = getDataKey()): Promise<AccessEvent> {
  const { holderNameEnc, ...rest } = record;
  if (!holderNameEnc) return rest;
  if (!key) return { ...rest, holderLocked: true };
  try {
    return { ...rest, holderName: await decryptText(key, holderNameEnc) };
  } catch {
    return { ...rest, holderLocked: true };
  }
}

export async function listRecentEvents(limit = 100): Promise<AccessEvent[]> {
  const records = await db.events.orderBy('timestamp').reverse().limit(limit).toArray();
  const key = getDataKey();
  return Promise.all(records.map((r) => toEvent(r, key)));
}

export interface PresentCard {
  card: Card;
  group: Group | undefined;
  since: number;
}

export async function listPresentCards(): Promise<PresentCard[]> {
  // erst alle Datenbankzugriffe, dann entschlüsseln
  const presence = await db.presence.where('status').equals('in').toArray();
  const records = await db.cards.bulkGet(presence.map((r) => r.cardId));
  const groups = new Map((await db.groups.toArray()).map((g) => [g.id, g]));
  const key = getDataKey();
  const result: PresentCard[] = [];
  for (const [i, p] of presence.entries()) {
    const record = records[i];
    if (record) result.push({ card: await toCard(record, key), group: groups.get(record.groupId), since: p.lastBookingAt });
  }
  return result.sort((a, b) => b.since - a.since);
}

export async function clearEvents(): Promise<void> {
  await db.transaction('rw', [db.events, db.presence], async () => {
    await db.events.clear();
    await db.presence.clear();
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Löschfrist: entfernt Protokolleinträge, die älter als `days` Tage sind (0 = nie). */
export async function purgeOldEvents(days: number, now = Date.now()): Promise<number> {
  if (!days || days <= 0) return 0;
  return db.events.where('timestamp').below(now - days * DAY_MS).delete();
}
