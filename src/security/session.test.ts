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
  disableOperatorPin,
  lockAll,
  login,
  loginOperator,
  logout,
  setOperatorPin,
  setupPassword,
  staffRole,
  touchActivity,
} from './session';
import { loadOperatorPin } from '../db/vault';
import { resolvePendingScan } from '../db/scans';
import { updateGroup } from '../db/groups';

const FAST = 1000;
const opts = { mode: 'auto' as const, cooldownMs: 0, source: 'test' as const };

beforeEach(async () => {
  await clearAllData(true);
  await ensureDefaultGroups();
  await initSecurity();
});

describe('Sicherheitssitzung', () => {
  it('verlangt eine Ersteinrichtung und meldet danach an', async () => {
    expect(getSecurityState()).toEqual({ vault: 'setup', admin: false, operator: false });
    await expect(setupPassword('kurz', FAST)).rejects.toThrow('8 Zeichen');
    await setupPassword('sicheresPasswort', FAST);
    expect(getSecurityState()).toEqual({ vault: 'unlocked', admin: true, operator: false });
    expect(await loadVault()).toBeDefined();
    await expect(setupPassword('nochEinPasswort', FAST)).rejects.toThrow('bereits');
  });

  it('nach dem Neustart gesperrt, Anmeldung entsperrt', async () => {
    await setupPassword('sicheresPasswort', FAST);
    await initSecurity(); // simuliert App-Neustart
    expect(getSecurityState()).toEqual({ vault: 'locked', admin: false, operator: false });
    expect(getDataKey()).toBeNull();
    await expect(login('falschesPasswort')).rejects.toThrow('falsch');
    await login('sicheresPasswort');
    expect(getSecurityState()).toEqual({ vault: 'unlocked', admin: true, operator: false });
  });

  it('Abmelden lässt die Daten entsperrt, Sperren nicht', async () => {
    await setupPassword('sicheresPasswort', FAST);
    logout();
    expect(getSecurityState()).toEqual({ vault: 'unlocked', admin: false, operator: false });
    expect(getDataKey()).not.toBeNull();
    lockAll();
    expect(getSecurityState()).toEqual({ vault: 'locked', admin: false, operator: false });
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

describe('Bediener-PIN', () => {
  it('Bediener meldet sich mit PIN an – nur solange die Daten entsperrt sind', async () => {
    await setupPassword('sicheresPasswort', FAST);
    await setOperatorPin('482913', FAST);
    const record = await loadOperatorPin();
    expect(JSON.stringify(record)).not.toContain('482913'); // nur Prüfwert gespeichert
    logout();
    await expect(loginOperator('000000')).rejects.toThrow('PIN ist falsch');
    await loginOperator('482913');
    expect(getSecurityState()).toEqual({ vault: 'unlocked', admin: false, operator: true });
    expect(staffRole()).toBe('operator');
    await expect(setOperatorPin('111111', FAST)).rejects.toThrow('Nur der Admin');

    lockAll(); // z. B. Neustart: Daten gesperrt → PIN reicht nicht
    await expect(loginOperator('482913')).rejects.toThrow('gesperrt');
    await login('sicheresPasswort');
    expect(staffRole()).toBe('admin');
  });

  it('getrennte automatische Abmeldung für Bediener', async () => {
    await setupPassword('sicheresPasswort', FAST);
    await setOperatorPin('482913', FAST);
    logout();
    await loginOperator('482913');
    touchActivity(1_000_000);
    expect(checkAutoLogout(15, 1_000_000 + 60 * 60_000, 0)).toBe(false); // Bediener: nie
    expect(checkAutoLogout(15, 1_000_000 + 61 * 60_000, 60)).toBe(true);
    expect(getSecurityState().operator).toBe(false);
  });

  it('PIN-Regeln und Abschalten', async () => {
    await setupPassword('sicheresPasswort', FAST);
    await expect(setOperatorPin('12', FAST)).rejects.toThrow('4 bis 12 Ziffern');
    await expect(setOperatorPin('12ab56', FAST)).rejects.toThrow('4 bis 12 Ziffern');
    await setOperatorPin('1234', FAST);
    await clearAllData();
    expect(await loadOperatorPin()).toBeDefined(); // bleibt wie das Admin-Passwort erhalten
    await disableOperatorPin();
    expect(await loadOperatorPin()).toBeUndefined();
  });
});

describe('Bestätigung von Eintritten', () => {
  async function setupConfirmCard() {
    await setupPassword('sicheresPasswort', FAST);
    const groups = await listGroups();
    const visitors = groups.find((g) => g.prefix === 'B')!;
    await updateGroup(visitors.id, { ...visitors, requireConfirmation: true });
    const [card] = await createCards({ groupId: visitors.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Berta', lastName: 'Besuch' } });
    return card!;
  }

  it('Dashboard: wartet auf Bestätigung, bucht erst nach „Einlassen“', async () => {
    const card = await setupConfirmCard();
    const pending = await processScan(encodeCardPayload(card.token), { ...opts, confirmation: 'operator' });
    expect(pending.decision.outcome).toBe('pending');
    expect(pending.card?.holder?.firstName).toBe('Berta');
    expect(await db.events.count()).toBe(0);
    expect(await db.presence.get(card.id)).toBeUndefined();

    const done = await resolvePendingScan(pending, 'accept', { by: 'operator', source: 'test' });
    expect(done.decision).toMatchObject({ outcome: 'granted', direction: 'in' });
    expect((await db.presence.get(card.id))?.status).toBe('in');
    expect((await db.events.toArray())[0]).toMatchObject({ outcome: 'granted', confirmedBy: 'operator' });

    // Ausgang ohne Bestätigung
    const out = await processScan(encodeCardPayload(card.token), { ...opts, confirmation: 'operator' });
    expect(out.decision).toMatchObject({ outcome: 'granted', direction: 'out' });
  });

  it('Abweisen und Zeitablauf werden protokolliert', async () => {
    const card = await setupConfirmCard();
    const p1 = await processScan(encodeCardPayload(card.token), { ...opts, confirmation: 'operator' });
    expect((await resolvePendingScan(p1, 'reject', { by: 'admin', source: 'test' })).decision.reason).toBe('REJECTED');
    const p2 = await processScan(encodeCardPayload(card.token), { ...opts, confirmation: 'operator' });
    expect((await resolvePendingScan(p2, 'timeout', { by: 'admin', source: 'test' })).decision.reason).toBe('CONFIRMATION_TIMEOUT');
    const events = await db.events.orderBy('seq').toArray();
    expect(events.map((e) => [e.outcome, e.reason, e.confirmedBy])).toEqual([
      ['denied', 'REJECTED', 'admin'],
      ['denied', 'CONFIRMATION_TIMEOUT', undefined],
    ]);
    expect(await db.presence.get(card.id)).toBeUndefined();
  });

  it('„Einlassen“ prüft erneut – inzwischen gesperrte Karte wird abgewiesen', async () => {
    const card = await setupConfirmCard();
    const pending = await processScan(encodeCardPayload(card.token), { ...opts, confirmation: 'operator' });
    await db.cards.update(card.id, { blocked: true });
    const done = await resolvePendingScan(pending, 'accept', { by: 'operator', source: 'test' });
    expect(done.decision).toMatchObject({ outcome: 'denied', reason: 'CARD_BLOCKED' });
  });

  it('Kiosk ohne Bediener: abgewiesen mit Hinweis', async () => {
    const card = await setupConfirmCard();
    const scan = await processScan(encodeCardPayload(card.token), opts);
    expect(scan.decision).toMatchObject({ outcome: 'denied', reason: 'CONFIRMATION_REQUIRED' });
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
