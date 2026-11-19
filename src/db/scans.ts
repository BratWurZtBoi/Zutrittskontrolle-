import { decideAccess, type ConfirmationContext, type Decision } from '../domain/access';
import { parseCardPayload } from '../domain/cardCode';
import type { Guest, Occasion } from '../domain/occasion';
import { holderName } from '../domain/texts';
import type { AccessEvent, AccessEventRecord, Card, CardRecord, Direction, Group, ScanMode, StaffRole } from '../domain/types';
import { decryptText } from '../security/crypto';
import { cachedDecrypt } from '../security/decryptCache';
import { getDataKey } from '../security/session';
import { toCard } from './cards';
import { ValidationError, db } from './db';

export interface ScanOptions {
  mode: ScanMode;
  cooldownMs: number;
  source: AccessEventRecord['source'];
  now?: Date;
  /** Kann hier jemand Eintritte bestätigen? ('operator' = Dashboard, Standard 'none' = Kiosk) */
  confirmation?: Exclude<ConfirmationContext, 'confirmed'>;
}

export interface ScanOutcome {
  decision: Decision;
  /** Karte – Personendaten nur, wenn die Daten entsperrt sind. */
  card?: Card;
  group?: Group;
  /** Protokolleintrag (fehlt bei Doppelscans und wartenden Scans – diese werden nicht gebucht). */
  event?: AccessEventRecord;
  at: number;
  /** Einlass-Modus: Veranstaltung, für die gescannt wurde. */
  occasion?: Pick<Occasion, 'id' | 'name' | 'color' | 'resultLayoutId'>;
  /** Einlass-Modus: Gast der Einladung (Personendaten nur, wenn entsperrt). */
  guest?: Guest;
  /** Einladung gehört zu dieser (anderen) Veranstaltung. */
  otherOccasion?: Pick<Occasion, 'id' | 'name' | 'color'>;
  /** Von Hand eingelassen. */
  manual?: boolean;
  /** Einlass-Modus, „Bereits eingelassen“: Zeitpunkt des ersten Einlasses. */
  admittedAt?: number;
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
    if (!record) {
      // Alter QR-Code einer neu ausgestellten Karte: abweisen, aber mit Karte/Person im Protokoll
      const old = await db.cards.where('oldTokens').equals(token).first();
      if (old) {
        const oldGroup = await db.groups.get(old.groupId);
        const decision: Decision = { outcome: 'denied', reason: 'OLD_CARD' };
        const event = await book(decision, old, oldGroup, at, opts.source);
        return { decision, record: old, group: oldGroup, event };
      }
    }
    const group = record ? await db.groups.get(record.groupId) : undefined;
    const presence = record ? await db.presence.get(record.id) : undefined;
    const decision = decideAccess({
      card: record ? { ...record, hasHolder: hasHolderRecord(record) } : undefined,
      group,
      presence,
      mode: opts.mode,
      now,
      cooldownMs: opts.cooldownMs,
      confirmation: opts.confirmation ?? 'none',
    });

    // Doppelscans und wartende Eintritte werden (noch) nicht gebucht
    if (decision.outcome === 'duplicate' || decision.outcome === 'pending') return { decision, record, group, event: undefined };

    const event = await book(decision, record, group, at, opts.source);
    return { decision, record, group, event };
  });

  // Entschlüsseln erst nach der Transaktion
  const card = result.record ? await toCard(result.record) : undefined;
  return { decision: result.decision, card, group: result.group, event: result.event, at };
}

function hasHolderRecord(record: CardRecord): boolean {
  return Boolean(record.holderEnc || record.holder);
}

/** Protokolleintrag schreiben und Anwesenheit aktualisieren (innerhalb einer Transaktion aufrufen). */
async function book(
  decision: Decision,
  record: CardRecord | undefined,
  group: Group | undefined,
  at: number,
  source: AccessEventRecord['source'],
  confirmedBy?: StaffRole,
): Promise<AccessEventRecord> {
  const event: AccessEventRecord = {
    timestamp: at,
    outcome: decision.outcome === 'granted' ? 'granted' : 'denied',
    direction: decision.direction,
    reason: decision.reason,
    cardId: record?.id,
    cardNumber: record?.number,
    groupId: record?.groupId,
    groupName: group?.name,
    holderNameEnc: record?.nameEnc,
    holderName: record && !record.nameEnc ? holderName(record.holder) : undefined,
    source,
    ...(confirmedBy ? { confirmedBy } : {}),
  };
  event.seq = await db.events.add(event);
  if (record && decision.outcome === 'granted' && decision.direction) {
    await db.presence.put({ cardId: record.id, status: decision.direction, lastBookingAt: at });
  }
  return event;
}

export type PendingAction = 'accept' | 'reject' | 'timeout';

/**
 * Entscheidet über einen wartenden Eintritt. „Einlassen“ prüft die Karte erneut
 * (sie könnte inzwischen gesperrt worden sein) und bucht dann den Eintritt.
 * Abweisen und Zeitablauf werden protokolliert.
 */
export async function resolvePendingScan(
  pending: ScanOutcome,
  action: PendingAction,
  opts: { by: StaffRole; source: AccessEventRecord['source']; now?: Date },
): Promise<ScanOutcome> {
  const now = opts.now ?? new Date();
  const at = now.getTime();
  const cardId = pending.card?.id;
  const result = await db.transaction('rw', [db.cards, db.groups, db.presence, db.events], async () => {
    const record = cardId ? await db.cards.get(cardId) : undefined;
    const group = record ? await db.groups.get(record.groupId) : undefined;
    let decision: Decision;
    if (action === 'accept') {
      const presence = record ? await db.presence.get(record.id) : undefined;
      decision = decideAccess({
        card: record ? { ...record, hasHolder: hasHolderRecord(record) } : undefined,
        group,
        presence,
        mode: 'in',
        now,
        cooldownMs: 0,
        confirmation: 'confirmed',
      });
    } else {
      decision = { outcome: 'denied', reason: action === 'reject' ? 'REJECTED' : 'CONFIRMATION_TIMEOUT', direction: 'in' };
    }
    const event = await book(decision, record, group, at, opts.source, action === 'timeout' ? undefined : opts.by);
    return { decision, record, group, event };
  });
  const card = result.record ? await toCard(result.record) : undefined;
  return { decision: result.decision, card, group: result.group, event: result.event, at };
}

/**
 * Manuell ein- oder ausbuchen (z. B. Karte vergessen). Es gelten dieselben Regeln
 * wie beim Scan (gesperrt, abgelaufen …) – nur ohne Doppelscan-Schutz und ohne
 * zusätzliche Bestätigung, denn der Bediener bucht ja selbst. Abgelehnte Versuche
 * werden nicht protokolliert (Ergebnis ohne `event`).
 */
export async function bookManually(
  cardId: string,
  direction: Direction,
  opts: { by: StaffRole; now?: Date },
): Promise<ScanOutcome> {
  const now = opts.now ?? new Date();
  const at = now.getTime();
  const result = await db.transaction('rw', [db.cards, db.groups, db.presence, db.events], async () => {
    const record = await db.cards.get(cardId);
    const group = record ? await db.groups.get(record.groupId) : undefined;
    const presence = record ? await db.presence.get(cardId) : undefined;
    const decision = decideAccess({
      card: record ? { ...record, hasHolder: hasHolderRecord(record) } : undefined,
      group,
      presence,
      mode: direction,
      now,
      cooldownMs: 0,
      confirmation: 'confirmed',
    });
    if (decision.outcome !== 'granted') return { decision, record, group, event: undefined };
    const event = await book(decision, record, group, at, 'manual', opts.by);
    return { decision, record, group, event };
  });
  const card = result.record ? await toCard(result.record) : undefined;
  return { decision: result.decision, card, group: result.group, event: result.event, at };
}

/**
 * Fehlbuchung rückgängig machen: schreibt eine Gegenbuchung (Grund „Korrektur“)
 * und setzt die Anwesenheit zurück. Nur die letzte Buchung einer Karte, nichts
 * wird gelöscht – beide Einträge bleiben im Protokoll.
 */
export async function undoBooking(seq: number, opts: { by: StaffRole; now?: Date }): Promise<ScanOutcome> {
  const at = (opts.now ?? new Date()).getTime();
  const result = await db.transaction('rw', [db.cards, db.groups, db.presence, db.events], async () => {
    const original = await db.events.get(seq);
    if (!original || !original.cardId) throw new ValidationError('Buchung nicht gefunden.');
    if (original.outcome !== 'granted' || original.source === 'system' || original.reason === 'CORRECTION') {
      throw new ValidationError('Diese Buchung kann nicht rückgängig gemacht werden.');
    }
    if (original.correctedBy) throw new ValidationError('Diese Buchung wurde bereits rückgängig gemacht.');
    const later = await db.events
      .where('cardId')
      .equals(original.cardId)
      .filter((e) => e.outcome === 'granted' && (e.seq ?? 0) > seq)
      .count();
    if (later > 0) throw new ValidationError('Nur die letzte Buchung einer Karte kann rückgängig gemacht werden.');

    const record = await db.cards.get(original.cardId);
    const group = record ? await db.groups.get(record.groupId) : undefined;
    const direction: Direction = original.direction === 'in' ? 'out' : 'in';
    const correction: AccessEventRecord = {
      timestamp: at,
      outcome: 'granted',
      direction,
      reason: 'CORRECTION',
      cardId: original.cardId,
      cardNumber: original.cardNumber,
      groupId: original.groupId,
      groupName: original.groupName,
      holderNameEnc: original.holderNameEnc,
      holderName: original.holderName,
      source: 'manual',
      confirmedBy: opts.by,
      correctionOf: seq,
    };
    correction.seq = await db.events.add(correction);
    await db.events.update(seq, { correctedBy: correction.seq });
    // als automatische Buchung markieren: der nächste echte Scan wird nicht als Doppelscan gewertet
    await db.presence.put({ cardId: original.cardId, status: direction, lastBookingAt: at, bySystem: true });
    const decision: Decision = { outcome: 'granted', reason: 'CORRECTION', direction };
    return { decision, record, group, event: correction };
  });
  const card = result.record ? await toCard(result.record) : undefined;
  return { decision: result.decision, card, group: result.group, event: result.event, at };
}

/** Protokolleintrag für die Anzeige aufbereiten (Name entschlüsseln, falls möglich). */
export async function toEvent(record: AccessEventRecord, key: CryptoKey | null = getDataKey()): Promise<AccessEvent> {
  const { holderNameEnc, ...rest } = record;
  if (!holderNameEnc) return rest;
  if (!key) return { ...rest, holderLocked: true };
  try {
    return { ...rest, holderName: await cachedDecrypt(key, holderNameEnc, () => decryptText(key, holderNameEnc)) };
  } catch {
    return { ...rest, holderLocked: true };
  }
}

export async function listRecentEvents(limit = 100): Promise<AccessEvent[]> {
  const records = await db.events.orderBy('timestamp').reverse().limit(limit).toArray();
  const key = getDataKey();
  return Promise.all(records.map((r) => toEvent(r, key)));
}

/** Protokolleinträge in einem Zeitraum [from, to), neueste zuerst. */
export async function queryEvents(from: number, to: number): Promise<AccessEvent[]> {
  const records = await db.events.where('timestamp').between(from, to, true, false).reverse().toArray();
  const key = getDataKey();
  return Promise.all(records.map((r) => toEvent(r, key)));
}

export function listPresence() {
  return db.presence.toArray();
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
