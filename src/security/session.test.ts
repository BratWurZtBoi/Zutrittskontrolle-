import { beforeEach, describe, expect, it } from 'vitest';
import { createCards, getCard, listCards, updateCard } from '../db/cards';
import { clearAllData, db } from '../db/db';
import { ensureDefaultGroups, listGroups } from '../db/groups';
import { listRecentEvents, processScan } from '../db/scans';
import { loadVault } from '../db/vault';
import { encodeCardPayload } from '../domain/cardCode';
import {
  changePassword,
  checkAutoLogout,
  getDataKey,
  getSecurityState,
  initSecurity,
  lockAll,
  login,
  logout,
  setupPassword,
  touchActivity,
} from './session';

const FAST = 1000;
const opts = { mode: 'auto' as const, cooldownMs: 0, source: 'test' as const };

beforeEach(async () => {
  await clearAllData(true);
  await ensureDefaultGroups();
  await initSecurity();
});

describe('Sicherheitssitzung', () => {
  it('verlangt eine Ersteinrichtung und meldet danach an', async () => {
    expect(getSecurityState()).toEqual({ vault: 'setup', admin: false });
    await expect(setupPassword('kurz', FAST)).rejects.toThrow('8 Zeichen');
    await setupPassword('sicheresPasswort', FAST);
    expect(getSecurityState()).toEqual({ vault: 'unlocked', admin: true });
    expect(await loadVault()).toBeDefined();
    await expect(setupPassword('nochEinPasswort', FAST)).rejects.toThrow('bereits');
  });

  it('nach dem Neustart gesperrt, Anmeldung entsperrt', async () => {
    await setupPassword('sicheresPasswort', FAST);
    await initSecurity(); // simuliert App-Neustart
    expect(getSecurityState()).toEqual({ vault: 'locked', admin: false });
    expect(getDataKey()).toBeNull();
    await expect(login('falschesPasswort')).rejects.toThrow('falsch');
    await login('sicheresPasswort');
    expect(getSecurityState()).toEqual({ vault: 'unlocked', admin: true });
  });

  it('Abmelden lässt die Daten entsperrt, Sperren nicht', async () => {
    await setupPassword('sicheresPasswort', FAST);
    logout();
    expect(getSecurityState()).toEqual({ vault: 'unlocked', admin: false });
    expect(getDataKey()).not.toBeNull();
    lockAll();
    expect(getSecurityState()).toEqual({ vault: 'locked', admin: false });
    expect(getDataKey()).toBeNull();
  });

  it('meldet nach Inaktivität automatisch ab', async () => {
    await setupPassword('sicheresPasswort', FAST);
    touchActivity(1_000_000);
    expect(checkAutoLogout(15, 1_000_000 + 14 * 60_000)).toBe(false);
    expect(checkAutoLogout(0, 1_000_000 + 999 * 60_000)).toBe(false); // 0 = nie
    expect(checkAutoLogout(15, 1_000_000 + 16 * 60_000)).toBe(true);
    expect(getSecurityState().admin).toBe(false);
  });

  it('ändert das Passwort', async () => {
    await setupPassword('altesPasswort', FAST);
    await expect(changePassword('falsch', 'neuesPasswort')).rejects.toThrow('falsch');
    await changePassword('altesPasswort', 'neuesPasswort');
    lockAll();
    await expect(login('altesPasswort')).rejects.toThrow('falsch');
    await login('neuesPasswort');
    expect(getSecurityState().vault).toBe('unlocked');
  });
});

describe('Verschlüsselte Personendaten', () => {
  it('speichert Personendaten nur verschlüsselt', async () => {
    await setupPassword('sicheresPasswort', FAST);
    const [group] = await listGroups();
    const [card] = await createCards({ groupId: group!.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Max', lastName: 'Mustermann', company: 'Technik' } });
    const raw = await db.cards.get(card!.id);
    expect(raw?.holder).toBeUndefined();
    expect(raw?.holderEnc?.data).toBeInstanceOf(Uint8Array);
    expect(JSON.stringify(Array.from(raw!.holderEnc!.data))).not.toContain('Max');
    expect((await getCard(card!.id))?.holder?.lastName).toBe('Mustermann');
  });

  it('im gesperrten Zustand: Zutritt wird geprüft, Namen bleiben verborgen und werden protokolliert', async () => {
    await setupPassword('sicheresPasswort', FAST);
    const [group] = await listGroups();
    const [card] = await createCards({ groupId: group!.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Max', lastName: 'Mustermann' } });
    lockAll();

    const listed = (await listCards())[0]!.card;
    expect(listed).toMatchObject({ hasHolder: true, holder: undefined });
    await expect(updateCard(card!.id, { accessGranted: false })).rejects.toThrow('gesperrt');

    const scan = await processScan(encodeCardPayload(card!.token), opts);
    expect(scan.decision.outcome).toBe('granted'); // Zutritt trotz Sperre
    expect(scan.card?.holder).toBeUndefined();
    expect((await listRecentEvents())[0]).toMatchObject({ holderLocked: true, cardNumber: 'M-001' });

    await login('sicheresPasswort');
    expect((await listRecentEvents())[0]).toMatchObject({ holderName: 'Max Mustermann' });
  });

  it('wandelt unverschlüsselte Altdaten bei der Einrichtung um', async () => {
    const [group] = await listGroups();
    const now = Date.now();
    await db.cards.add({
      id: 'alt-1', number: 'M-900', groupId: group!.id, token: 'A'.repeat(26), tokenIssuedAt: now,
      blocked: false, accessGranted: true, holder: { firstName: 'Alt', lastName: 'Bestand' }, createdAt: now, updatedAt: now,
    });
    await db.events.add({ timestamp: now, outcome: 'granted', reason: 'OK', holderName: 'Alt Bestand', source: 'test' });
    // vor der Einrichtung: Klartext wird angezeigt
    expect((await getCard('alt-1'))?.holder?.firstName).toBe('Alt');

    await setupPassword('sicheresPasswort', FAST);
    const raw = await db.cards.get('alt-1');
    expect(raw?.holder).toBeUndefined();
    expect(raw?.holderEnc).toBeDefined();
    expect((await db.events.toArray())[0]?.holderName).toBeUndefined();
    expect((await getCard('alt-1'))?.holder?.lastName).toBe('Bestand');
    expect((await listRecentEvents())[0]?.holderName).toBe('Alt Bestand');
  });

  it('„Alle Daten löschen“ behält das Passwort', async () => {
    await setupPassword('sicheresPasswort', FAST);
    await clearAllData();
    expect(await loadVault()).toBeDefined();
    await clearAllData(true);
    expect(await loadVault()).toBeUndefined();
  });
});
