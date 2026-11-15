import { decideAccess, toCardRules, type Decision } from '../domain/access';
import { parseCardPayload } from '../domain/cardCode';
import { holderName } from '../domain/texts';
import type { AccessEvent, Card, Group, ScanMode } from '../domain/types';
import { db } from './db';

export interface ScanOptions {
  mode: ScanMode;
  cooldownMs: number;
  source: AccessEvent['source'];
  now?: Date;
}

export interface ScanOutcome {
  decision: Decision;
  card?: Card;
  group?: Group;
  /** Protokolleintrag (fehlt bei Doppelscans – diese werden nicht gebucht). */
  event?: AccessEvent;
  at: number;
}

/**
 * Verarbeitet einen gescannten QR-Text: prüft die Karte, entscheidet,
 * protokolliert und aktualisiert die Anwesenheit – alles in einer Transaktion.
 */
export async function processScan(text: string, opts: ScanOptions): Promise<ScanOutcome> {
  const now = opts.now ?? new Date();
  const at = now.getTime();
  const token = parseCardPayload(text);

  return db.transaction('rw', [db.cards, db.groups, db.presence, db.events], async () => {
    if (!token) {
      const event: AccessEvent = { timestamp: at, outcome: 'denied', reason: 'INVALID_CODE', source: opts.source };
      event.seq = await db.events.add(event);
      return { decision: { outcome: 'denied', reason: 'INVALID_CODE' }, event, at };
    }

    const card = await db.cards.where('token').equals(token).first();
    const group = card ? await db.groups.get(card.groupId) : undefined;
    const presence = card ? await db.presence.get(card.id) : undefined;
    const decision = decideAccess({
      card: card ? toCardRules(card) : undefined,
      group,
      presence,
      mode: opts.mode,
      now,
      cooldownMs: opts.cooldownMs,
    });

    if (decision.outcome === 'duplicate') return { decision, card, group, at };

    const event: AccessEvent = {
      timestamp: at,
      outcome: decision.outcome,
      direction: decision.direction,
      reason: decision.reason,
      cardId: card?.id,
      cardNumber: card?.number,
      groupId: card?.groupId,
      groupName: group?.name,
      holderName: holderName(card?.holder),
      source: opts.source,
    };
    event.seq = await db.events.add(event);

    if (card && decision.outcome === 'granted' && decision.direction) {
      await db.presence.put({ cardId: card.id, status: decision.direction, lastBookingAt: at });
    }
    return { decision, card, group, event, at };
  });
}

export function listRecentEvents(limit = 100): Promise<AccessEvent[]> {
  return db.events.orderBy('timestamp').reverse().limit(limit).toArray();
}

export interface PresentCard {
  card: Card;
  group: Group | undefined;
  since: number;
}

export async function listPresentCards(): Promise<PresentCard[]> {
  const records = await db.presence.where('status').equals('in').toArray();
  const cards = await db.cards.bulkGet(records.map((r) => r.cardId));
  const groups = new Map((await db.groups.toArray()).map((g) => [g.id, g]));
  const result: PresentCard[] = [];
  records.forEach((r, i) => {
    const card = cards[i];
    if (card) result.push({ card, group: groups.get(card.groupId), since: r.lastBookingAt });
  });
  return result.sort((a, b) => b.since - a.since);
}

export async function clearEvents(): Promise<void> {
  await db.transaction('rw', [db.events, db.presence], async () => {
    await db.events.clear();
    await db.presence.clear();
  });
}
