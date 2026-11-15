import { beforeEach, describe, expect, it } from 'vitest';
import { encodeCardPayload } from '../domain/cardCode';
import type { Group } from '../domain/types';
import { describeOutcome, displayName } from '../lib/resultText';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createCards, getCard, issueReplacementCard, markCardFound, reissueToken, reportCardLost, updateCard } from './cards';
import { clearAllData, db } from './db';
import { ensureDefaultGroups, listGroups } from './groups';
import { processScan } from './scans';

const opts = { mode: 'auto' as const, cooldownMs: 0, source: 'test' as const };
let staff: Group;

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
  [staff] = (await listGroups()) as [Group];
});

async function cardWithHolder() {
  const [card] = await createCards({ groupId: staff.id, count: 1 });
  await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Max', lastName: 'Mustermann', company: 'Technik' } });
  return (await getCard(card!.id))!;
}

describe('Verlorene Karten', () => {
  it('als verloren melden sperrt sofort – Scan wird in beide Richtungen abgewiesen', async () => {
    const card = await cardWithHolder();
    await processScan(encodeCardPayload(card.token), opts); // eingebucht
    await reportCardLost(card.id, 1000);
    const stored = await db.cards.get(card.id);
    expect(stored).toMatchObject({ blocked: true, lostAt: 1000 });
    const scan = await processScan(encodeCardPayload(card.token), opts);
    expect(scan.decision).toEqual({ outcome: 'denied', reason: 'CARD_LOST' });
    expect((await db.presence.get(card.id))?.status).toBe('in'); // Ausgang wird nicht gebucht
  });

  it('Bediener sieht die Warnung, der Gast weder Grund noch Person', async () => {
    const card = await cardWithHolder();
    await reportCardLost(card.id);
    const scan = await processScan(encodeCardPayload(card.token), opts);
    expect(describeOutcome(scan, 'staff')).toMatchObject({ title: 'Verlorene Karte!' });
    expect(describeOutcome(scan, 'staff').detail).toContain('als verloren gemeldet');
    expect(displayName(scan, 'staff')).toBe('Max Mustermann');
    expect(describeOutcome(scan, 'guest')).toEqual({ tone: 'deny', title: 'Kein Zutritt', detail: 'Bitte wenden Sie sich an den Empfang.' });
    expect(displayName(scan, 'guest')).toBeUndefined();
  });

  it('Ersatzkarte übernimmt Person, Berechtigung und Anwesenheit', async () => {
    const card = await cardWithHolder();
    await updateCard(card.id, { accessGranted: true, validUntil: '2030-12-31', holder: card.holder });
    await processScan(encodeCardPayload(card.token), opts); // eingebucht
    await reportCardLost(card.id);
    const replacement = await issueReplacementCard(card.id);

    expect(replacement.number).toBe('M-002');
    expect(replacement).toMatchObject({ replaces: card.id, validUntil: '2030-12-31', blocked: false });
    expect(replacement.holder).toMatchObject({ firstName: 'Max', lastName: 'Mustermann' });
    expect((await db.presence.get(replacement.id))?.status).toBe('in');
    expect(await db.presence.get(card.id)).toBeUndefined();

    const old = await getCard(card.id);
    expect(old).toMatchObject({ blocked: true, replacedBy: replacement.id, hasHolder: false });
    expect(old?.lostAt).toBeDefined();

    // neue Karte bucht aus, alte bleibt verloren
    const out = await processScan(encodeCardPayload(replacement.token), opts);
    expect(out.decision).toMatchObject({ outcome: 'granted', direction: 'out' });
    await expect(issueReplacementCard(card.id)).rejects.toThrow('bereits');
  });

  it('wiedergefunden hebt die Verlustmeldung auf', async () => {
    const card = await cardWithHolder();
    await reportCardLost(card.id);
    await markCardFound(card.id);
    const stored = await db.cards.get(card.id);
    expect(stored?.blocked).toBe(false);
    expect(stored?.lostAt).toBeUndefined();
    const scan = await processScan(encodeCardPayload(card.token), opts);
    expect(scan.decision.outcome).toBe('granted');
  });

  it('neuer QR-Code erledigt die Verlustmeldung – der alte Code ist ungültig', async () => {
    const card = await cardWithHolder();
    await reportCardLost(card.id);
    const fresh = await reissueToken(card.id);
    expect(fresh.lostAt).toBeUndefined();
    expect((await processScan(encodeCardPayload(card.token), opts)).decision.reason).toBe('UNKNOWN_CARD');
    expect((await processScan(encodeCardPayload(fresh.token), opts)).decision.outcome).toBe('granted');
  });
});
