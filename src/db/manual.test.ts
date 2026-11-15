import { beforeEach, describe, expect, it } from 'vitest';
import { encodeCardPayload } from '../domain/cardCode';
import { undoableSeqs } from '../domain/overview';
import type { Group } from '../domain/types';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { assignHolderToFreeCard, createCards, getCard, listFreeCards, reportCardLost, setCardBlocked, updateCard } from './cards';
import { clearAllData, db } from './db';
import { ensureDefaultGroups, listGroups, updateGroup } from './groups';
import { bookManually, listRecentEvents, processScan, undoBooking } from './scans';

const opts = { mode: 'auto' as const, cooldownMs: 30_000, source: 'test' as const };
let staff: Group;

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
  [staff] = (await listGroups()) as [Group];
});

async function card() {
  const [c] = await createCards({ groupId: staff.id, count: 1 });
  await updateCard(c!.id, { accessGranted: true, holder: { firstName: 'Max', lastName: 'Mustermann' } });
  return c!;
}

describe('Manuell buchen', () => {
  it('bucht ein und aus, im Protokoll als „manuell“ mit Rolle', async () => {
    const c = await card();
    const inn = await bookManually(c.id, 'in', { by: 'operator' });
    expect(inn.decision).toMatchObject({ outcome: 'granted', direction: 'in' });
    expect(inn.event).toMatchObject({ source: 'manual', confirmedBy: 'operator' });
    expect((await db.presence.get(c.id))?.status).toBe('in');
    // kein Doppelscan-Schutz beim manuellen Buchen
    expect((await bookManually(c.id, 'out', { by: 'admin' })).decision.direction).toBe('out');
  });

  it('es gelten dieselben Regeln – gesperrt wird nicht gebucht und nicht protokolliert', async () => {
    const c = await card();
    await setCardBlocked(c.id, true);
    const r = await bookManually(c.id, 'in', { by: 'operator' });
    expect(r.decision).toMatchObject({ outcome: 'denied', reason: 'CARD_BLOCKED' });
    expect(r.event).toBeUndefined();
    expect(await db.events.count()).toBe(0);
  });

  it('Gruppen mit Bestätigungspflicht: der Bediener bucht selbst – keine weitere Bestätigung', async () => {
    const c = await card();
    await updateGroup(staff.id, { ...staff, requireConfirmation: true });
    expect((await bookManually(c.id, 'in', { by: 'operator' })).decision.outcome).toBe('granted');
  });
});

describe('Buchung rückgängig machen', () => {
  it('Gegenbuchung, Anwesenheit zurückgesetzt, beide Einträge bleiben', async () => {
    const c = await card();
    const scan = await processScan(encodeCardPayload(c.token), opts);
    const undone = await undoBooking(scan.event!.seq!, { by: 'operator' });
    expect(undone.decision).toEqual({ outcome: 'granted', reason: 'CORRECTION', direction: 'out' });
    expect(await db.presence.get(c.id)).toMatchObject({ status: 'out', bySystem: true });
    const events = await db.events.orderBy('seq').toArray();
    expect(events).toHaveLength(2);
    expect(events[0]?.correctedBy).toBe(events[1]?.seq);
    expect(events[1]).toMatchObject({ reason: 'CORRECTION', correctionOf: events[0]?.seq, source: 'manual', confirmedBy: 'operator' });
    // nächster Scan ist kein Doppelscan, sondern ein neuer Eintritt
    expect((await processScan(encodeCardPayload(c.token), opts)).decision).toMatchObject({ outcome: 'granted', direction: 'in' });
  });

  it('nur die letzte Buchung einer Karte, nicht doppelt, keine Korrektur der Korrektur', async () => {
    const c = await card();
    const first = await processScan(encodeCardPayload(c.token), { ...opts, cooldownMs: 0 });
    const second = await processScan(encodeCardPayload(c.token), { ...opts, cooldownMs: 0 });
    await expect(undoBooking(first.event!.seq!, { by: 'admin' })).rejects.toThrow('letzte Buchung');
    const fix = await undoBooking(second.event!.seq!, { by: 'admin' });
    await expect(undoBooking(second.event!.seq!, { by: 'admin' })).rejects.toThrow('bereits');
    await expect(undoBooking(fix.event!.seq!, { by: 'admin' })).rejects.toThrow('nicht rückgängig');
  });

  it('Auswahl der rückgängig machbaren Buchungen in der Liste', async () => {
    const a = await card();
    const [b] = await createCards({ groupId: staff.id, count: 1 });
    await updateCard(b!.id, { accessGranted: true, holder: { firstName: 'Erika', lastName: 'Musterfrau' } });
    const a1 = await processScan(encodeCardPayload(a.token), { ...opts, cooldownMs: 0 });
    const a2 = await processScan(encodeCardPayload(a.token), { ...opts, cooldownMs: 0 });
    const b1 = await processScan(encodeCardPayload(b!.token), opts);
    await processScan('fremder Code', opts);
    const seqs = undoableSeqs(await listRecentEvents());
    expect([...seqs].sort()).toEqual([a2.event!.seq!, b1.event!.seq!].sort());
    expect(seqs.has(a1.event!.seq!)).toBe(false);
  });
});

describe('Besucher-Schnellerfassung', () => {
  it('freie Karten einer Gruppe: ohne Person, nicht gesperrt oder verloren, nach Nummer', async () => {
    const visitors = (await listGroups())[1]!;
    const cards = await createCards({ groupId: visitors.id, count: 12 });
    await updateCard(cards[0]!.id, { accessGranted: true, holder: { firstName: 'Berta', lastName: 'Besuch' } });
    await setCardBlocked(cards[1]!.id, true);
    await reportCardLost(cards[2]!.id);
    const free = await listFreeCards(visitors.id);
    expect(free.map((c) => c.number)).toEqual(['B-004', 'B-005', 'B-006', 'B-007', 'B-008', 'B-009', 'B-010', 'B-011', 'B-012']);
  });

  it('weist nur freie Karten zu – eine vergebene Karte wird nie überschrieben', async () => {
    const visitors = (await listGroups())[1]!;
    const [a, b] = await createCards({ groupId: visitors.id, count: 2 });
    const assigned = await assignHolderToFreeCard(a!.id, {
      holder: { firstName: 'Felix', lastName: 'Gast', company: 'Beispiel GmbH' },
      validFrom: '2026-11-15',
      validUntil: '2026-11-15',
    });
    expect(assigned).toMatchObject({ accessGranted: true, validUntil: '2026-11-15', holder: { firstName: 'Felix' } });
    await expect(assignHolderToFreeCard(a!.id, { holder: { firstName: 'Mia', lastName: 'Lieferant' } })).rejects.toThrow('bereits vergeben');
    expect((await getCard(a!.id))?.holder?.firstName).toBe('Felix');
    await expect(assignHolderToFreeCard(b!.id, { holder: { firstName: ' ', lastName: '' } })).rejects.toThrow('Nachnamen');
  });
});
