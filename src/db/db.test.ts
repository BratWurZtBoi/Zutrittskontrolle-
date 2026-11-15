import { beforeEach, describe, expect, it } from 'vitest';
import { encodeCardPayload } from '../domain/cardCode';
import type { CardHolder, Group } from '../domain/types';
import {
  MAX_BATCH,
  createCards,
  deleteCard,
  listCards,
  reissueToken,
  returnCard,
  setCardBlocked,
  suggestNumbers,
  updateCard,
} from './cards';
import { ValidationError, clearAllData, db } from './db';
import { createGroup, deleteGroup, ensureDefaultGroups, listGroups, updateGroup } from './groups';
import { listPresentCards, listRecentEvents, processScan, purgeOldEvents } from './scans';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { removeTestCards, seedTestCards } from './seed';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

const opts = { mode: 'auto' as const, cooldownMs: 30_000, source: 'test' as const };
const at = (sec: number) => new Date(2026, 5, 15, 9, 0, sec);
const max: CardHolder = { firstName: 'Max', lastName: 'Mustermann' };
let staff: Group;
let visitors: Group;

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
  [staff, visitors] = (await listGroups()) as [Group, Group];
});

describe('Gruppen', () => {
  it('legt Standardgruppen nur einmal an', async () => {
    await ensureDefaultGroups();
    expect((await listGroups()).map((g) => `${g.name}/${g.prefix}`)).toEqual(['Bestandspersonal/M', 'Besucher/B']);
  });

  it('validiert Name, Kürzel und Farbe', async () => {
    const base = { name: 'Dienstleister', color: '#16a34a', prefix: 'd', accessGranted: true, allowUnassigned: false, printHolder: true };
    const g = await createGroup(base);
    expect(g.prefix).toBe('D');
    expect(g.sortOrder).toBe(3);
    await expect(createGroup({ ...base, prefix: 'X' })).rejects.toThrow('gibt es bereits');
    await expect(createGroup({ ...base, name: 'Andere', prefix: 'B' })).rejects.toThrow('Kürzel');
    await expect(createGroup({ ...base, name: 'Andere', prefix: 'TOOLONG' })).rejects.toThrow('1–4');
    await expect(createGroup({ ...base, name: 'Andere', prefix: 'Y', color: 'rot' })).rejects.toThrow('Farbe');
  });

  it('ändert Gruppen, das Kürzel bleibt fest', async () => {
    const u = await updateGroup(visitors.id, { ...visitors, name: 'Gäste', color: '#000000' });
    expect(u).toMatchObject({ name: 'Gäste', color: '#000000', prefix: 'B' });
  });

  it('löscht nur leere Gruppen', async () => {
    await createCards({ groupId: visitors.id, count: 1 });
    await expect(deleteGroup(visitors.id)).rejects.toThrow('enthält noch 1');
    await deleteGroup(staff.id);
    expect((await listGroups()).length).toBe(1);
  });
});

describe('Karten', () => {
  it('erstellt Karten in Serie mit fortlaufender Nummer je Gruppe', async () => {
    const a = await createCards({ groupId: visitors.id, count: 3 });
    expect(a.map((c) => c.number)).toEqual(['B-001', 'B-002', 'B-003']);
    expect(a.every((c) => /^[A-Z2-7]{26}$/.test(c.token) && !c.holder && c.accessGranted)).toBe(true);
    expect(await suggestNumbers(visitors.id, 2)).toEqual(['B-004', 'B-005']);
    expect((await createCards({ groupId: staff.id, count: 1 }))[0]?.number).toBe('M-001');
  });

  it('erlaubt eigene Nummern bei Einzelkarten und prüft Eindeutigkeit', async () => {
    await createCards({ groupId: staff.id, count: 1, number: 'CHEF-1' });
    await expect(createCards({ groupId: staff.id, count: 1, number: 'CHEF-1' })).rejects.toThrow(ValidationError);
    await expect(createCards({ groupId: staff.id, count: MAX_BATCH + 1 })).rejects.toThrow('1 bis');
  });

  it('weist Personendaten zu, ändert und entfernt sie', async () => {
    const [card] = await createCards({ groupId: staff.id, count: 1 });
    const u = await updateCard(card!.id, { accessGranted: true, holder: { ...max, company: ' Technik ' } }, 1000);
    expect(u.holder).toEqual({ firstName: 'Max', lastName: 'Mustermann', company: 'Technik' });
    expect(u.holderSince).toBe(1000);
    const same = await updateCard(card!.id, { accessGranted: true, holder: { ...max, note: 'x' } }, 2000);
    expect(same.holderSince).toBe(1000); // gleiche Person
    await expect(updateCard(card!.id, { accessGranted: true, holder: { firstName: ' ', lastName: '' } })).rejects.toThrow(
      'Vor- oder Nachnamen',
    );
    await expect(
      updateCard(card!.id, { accessGranted: true, validFrom: '2026-05-01', validUntil: '2026-04-01' }),
    ).rejects.toThrow('liegt vor');
  });
});

describe('Scan-Verarbeitung', () => {
  it('bucht ein und aus und führt die Anwesenheit', async () => {
    const [card] = await createCards({ groupId: staff.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: max });
    const code = encodeCardPayload(card!.token);

    const r1 = await processScan(code, { ...opts, now: at(0) });
    expect(r1.decision).toMatchObject({ outcome: 'granted', direction: 'in' });
    expect(r1.group?.name).toBe('Bestandspersonal');
    expect((await listPresentCards()).map((x) => x.card.id)).toEqual([card!.id]);

    const r2 = await processScan(code, { ...opts, now: at(40) });
    expect(r2.decision).toMatchObject({ outcome: 'granted', direction: 'out' });
    expect(await listPresentCards()).toEqual([]);

    const events = await listRecentEvents();
    expect(events.map((e) => e.direction)).toEqual(['out', 'in']);
    expect(events[0]).toMatchObject({ holderName: 'Max Mustermann', cardNumber: 'M-001', groupName: 'Bestandspersonal' });
  });

  it('ignoriert Doppelscans und protokolliert sie nicht', async () => {
    const [card] = await createCards({ groupId: staff.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: max });
    const code = encodeCardPayload(card!.token);
    await processScan(code, { ...opts, now: at(0) });
    const dup = await processScan(code, { ...opts, now: at(10) });
    expect(dup.decision).toMatchObject({ outcome: 'duplicate', secondsSinceLast: 10 });
    expect(await db.events.count()).toBe(1);
  });

  it('lehnt nicht zugeordnete Karten ab, außer die Gruppe erlaubt es', async () => {
    const [card] = await createCards({ groupId: visitors.id, count: 1 });
    const code = encodeCardPayload(card!.token);
    expect((await processScan(code, opts)).decision.reason).toBe('UNASSIGNED');
    await updateGroup(visitors.id, { ...visitors, allowUnassigned: true });
    expect((await processScan(code, opts)).decision.outcome).toBe('granted');
  });

  it('protokolliert ungültige, unbekannte und gesperrte Karten', async () => {
    const [card] = await createCards({ groupId: staff.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: max });
    const oldCode = encodeCardPayload(card!.token);

    expect((await processScan('Hallo Welt', opts)).decision.reason).toBe('INVALID_CODE');
    await setCardBlocked(card!.id, true);
    expect((await processScan(oldCode, opts)).decision.reason).toBe('CARD_BLOCKED');
    const reissued = await reissueToken(card!.id);
    expect(reissued.blocked).toBe(false);
    expect((await processScan(oldCode, opts)).decision.reason).toBe('UNKNOWN_CARD');
    expect((await processScan(encodeCardPayload(reissued.token), opts)).decision.outcome).toBe('granted');
  });

  it('Rückgabe bucht aus und entfernt Personendaten, Historie bleibt lesbar', async () => {
    const [card] = await createCards({ groupId: visitors.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, validUntil: '2026-06-15', holder: { firstName: 'Felix', lastName: 'Gast' } });
    await processScan(encodeCardPayload(card!.token), { ...opts, now: at(0) });

    const returned = await returnCard(card!.id, at(60).getTime());
    expect(returned.holder).toBeUndefined();
    expect(returned.validUntil).toBeUndefined();
    expect(await listPresentCards()).toEqual([]);
    const events = await listRecentEvents();
    expect(events[0]).toMatchObject({ direction: 'out', source: 'system', holderName: 'Felix Gast' });
    expect(events[1]).toMatchObject({ direction: 'in', holderName: 'Felix Gast' });
  });

  it('Personenwechsel bucht die bisherige Person aus', async () => {
    const [card] = await createCards({ groupId: visitors.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Felix', lastName: 'Gast' } });
    await processScan(encodeCardPayload(card!.token), { ...opts, now: at(0) });
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Mia', lastName: 'Neu' } });
    expect(await listPresentCards()).toEqual([]);
    expect((await listRecentEvents())[0]).toMatchObject({ direction: 'out', holderName: 'Felix Gast', source: 'system' });
  });

  it('behält das Protokoll beim Löschen einer Karte', async () => {
    const [card] = await createCards({ groupId: staff.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: max });
    await processScan(encodeCardPayload(card!.token), opts);
    await deleteCard(card!.id);
    expect(await listPresentCards()).toEqual([]);
    expect((await listRecentEvents())[0]?.holderName).toBe('Max Mustermann');
  });
});

describe('Löschfrist', () => {
  it('entfernt Protokolleinträge, die älter als die Frist sind', async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.UTC(2026, 5, 15);
    for (const age of [1, 89, 91, 400]) {
      await db.events.add({ timestamp: now - age * day, outcome: 'denied', reason: 'INVALID_CODE', source: 'test' });
    }
    expect(await purgeOldEvents(0, now)).toBe(0); // 0 = nie löschen
    expect(await purgeOldEvents(90, now)).toBe(2);
    expect(await db.events.count()).toBe(2);
  });
});

describe('Testdaten', () => {
  it('legt fiktive Testkarten an und entfernt sie wieder', async () => {
    const today = new Date(2026, 5, 15);
    expect(await seedTestCards(today)).toBe(14);
    expect(await seedTestCards(today)).toBe(0); // idempotent
    const [own] = await createCards({ groupId: staff.id, count: 1 });

    const all = (await listCards()).map((x) => x.card);
    expect(all.filter((c) => c.blocked).map((c) => c.holder?.lastName)).toEqual(['Platzhalter']);
    expect(all.filter((c) => c.groupId === visitors.id && !c.hasHolder).length).toBe(3);
    expect(all.find((c) => c.holder?.lastName === 'Demo')?.validUntil).toBe('2026-06-14');
    expect((await db.cards.toArray()).every((c) => c.holder === undefined)).toBe(true); // nur verschlüsselt

    expect(await removeTestCards()).toBe(14);
    expect((await db.cards.toArray()).map((c) => c.id)).toEqual([own!.id]);
    expect(await db.groups.count()).toBe(2);
  });
});

describe('Einstellungen', () => {
  it('liefert Standardwerte und speichert Änderungen', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.testMode).toBe(false);
    await saveSettings({ cooldownSec: 60, camera: 'device:abc' });
    expect(await loadSettings()).toMatchObject({ cooldownSec: 60, camera: 'device:abc', scanMode: 'auto' });
  });
});
