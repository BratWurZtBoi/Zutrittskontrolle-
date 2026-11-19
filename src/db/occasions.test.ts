import { beforeEach, describe, expect, it } from 'vitest';
import { encodeCardPayload, encodeGuestPayload } from '../domain/cardCode';
import type { Group } from '../domain/types';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createCards, issueReplacementCard, reissueToken, reportCardLost, returnCard, updateCard } from './cards';
import { clearAllData, db } from './db';
import { ensureDefaultGroups, listGroups } from './groups';
import {
  addGuest,
  addGuests,
  admitGuestManually,
  createOccasion,
  createSampleOccasion,
  deleteOccasion,
  endEntry,
  eraseGuestData,
  listAdmittedPeople,
  listGuests,
  listOccasionLog,
  listOccasions,
  loadActiveOccasion,
  processOccasionScan,
  setCompanionsAdmitted,
  setGuestCancelled,
  startEntry,
  undoAdmission,
  undoCardAdmission,
  updateGuest,
  updateOccasion,
} from './occasions';
import { listPresentCards, listRecentEvents } from './scans';

const at = (min: number, sec = 0) => new Date(2026, 11, 12, 18, min, sec);
const base = { name: 'Sommerfest', date: '2026-12-12', color: '#7c3aed', cardsAllowed: false };
let staff: Group;

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
  [staff] = (await listGroups()) as [Group];
});

describe('Veranstaltungen und Gäste', () => {
  it('legt an, prüft Eingaben, nummeriert Gäste fortlaufend (Personendaten verschlüsselt)', async () => {
    await expect(createOccasion({ ...base, name: ' ' })).rejects.toThrow('Namen');
    await expect(createOccasion({ ...base, date: '12.12.2026' })).rejects.toThrow('Datum');
    const o = await createOccasion(base);
    await addGuests(o.id, [
      { person: { firstName: 'Max', lastName: 'Mustermann', rank: 'Oberst' }, category: 'VIP' },
      { person: { firstName: 'Erika', lastName: 'Musterfrau', email: 'erika@example.com' } },
    ]);
    await expect(addGuest(o.id, { person: { firstName: '', lastName: '' } })).rejects.toThrow('Vor- oder Nachnamen');
    await expect(addGuest(o.id, { person: { firstName: 'A', lastName: 'B', email: 'kaputt' } })).rejects.toThrow('E-Mail');
    const guests = await listGuests(o.id);
    expect(guests.map((g) => [g.number, g.person?.lastName, g.category])).toEqual([
      [1, 'Mustermann', 'VIP'],
      [2, 'Musterfrau', undefined],
    ]);
    expect(JSON.stringify(await db.guests.toArray())).not.toContain('Mustermann');
    expect((await listOccasions())[0]).toMatchObject({ guests: 2, admitted: 0 });
    const renamed = await updateOccasion(o.id, { ...base, name: 'Herbstfest', location: ' Halle 1 ' });
    expect(renamed).toMatchObject({ name: 'Herbstfest', location: 'Halle 1' });
  });

  it('Einlass-Modus je Gerät, Löschen beendet ihn', async () => {
    const o = await createOccasion(base);
    await startEntry(o.id);
    expect((await loadActiveOccasion())?.id).toBe(o.id);
    await endEntry();
    expect(await loadActiveOccasion()).toBeUndefined();
    await startEntry(o.id);
    await deleteOccasion(o.id);
    expect(await loadActiveOccasion()).toBeUndefined();
  });
});

describe('Einlass mit Einladung', () => {
  const scan = (text: string, occasionId: string, when = at(0)) =>
    processOccasionScan(text, { occasionId, cooldownMs: 30_000, source: 'scanner', now: when });

  it('nur einmal gültig; kurz danach Doppelscan, später „bereits eingelassen“', async () => {
    const o = await createOccasion(base);
    const g = await addGuest(o.id, { person: { rank: 'Oberst', firstName: 'Max', lastName: 'Mustermann' }, category: 'VIP' });
    const first = await scan(encodeGuestPayload(g.token), o.id);
    expect(first).toMatchObject({ decision: { outcome: 'granted' }, occasion: { name: 'Sommerfest' }, guest: { number: 1 } });
    expect(first?.guest?.person?.lastName).toBe('Mustermann');
    expect((await scan(encodeGuestPayload(g.token), o.id, at(0, 10)))?.decision.outcome).toBe('duplicate');
    expect((await scan(encodeGuestPayload(g.token), o.id, at(5)))?.decision).toMatchObject({ outcome: 'denied', reason: 'ALREADY_ADMITTED' });
    const log = await listOccasionLog(o.id);
    expect(log.map((e) => [e.outcome, e.reason, e.name])).toEqual([
      ['denied', 'ALREADY_ADMITTED', 'Oberst Max Mustermann'],
      ['admitted', 'OK', 'Oberst Max Mustermann'],
    ]);
    // nicht in Anwesenheit/Protokoll der Zutrittskontrolle
    expect(await listPresentCards()).toEqual([]);
    expect(await listRecentEvents()).toEqual([]);
  });

  it('storniert, andere Veranstaltung, unbekannt, kein gültiger Code', async () => {
    const o = await createOccasion(base);
    const other = await createOccasion({ ...base, name: 'Neujahrsempfang' });
    const g = await addGuest(o.id, { person: { firstName: 'A', lastName: 'B' } });
    const foreign = await addGuest(other.id, { person: { firstName: 'C', lastName: 'D' } });
    await setGuestCancelled(g.id, true);
    expect((await scan(encodeGuestPayload(g.token), o.id))?.decision.reason).toBe('GUEST_CANCELLED');
    const wrong = await scan(encodeGuestPayload(foreign.token), o.id);
    expect(wrong).toMatchObject({ decision: { reason: 'OTHER_OCCASION' }, otherOccasion: { name: 'Neujahrsempfang' } });
    expect((await scan(encodeGuestPayload('A'.repeat(26)), o.id))?.decision.reason).toBe('UNKNOWN_GUEST');
    expect((await scan('Hallo', o.id))?.decision.reason).toBe('INVALID_CODE');
    expect(await scan('Hallo', 'gibt-es-nicht')).toBeNull();
  });

  it('Dienstausweise: standardmäßig abgewiesen, erlaubt → eingelassen (ohne normale Buchung)', async () => {
    const o = await createOccasion(base);
    const [card] = await createCards({ groupId: staff.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: { rank: 'Hptm', firstName: 'Lena', lastName: 'Probe' } });
    expect((await scan(encodeCardPayload(card!.token), o.id))?.decision.reason).toBe('CARDS_NOT_ADMITTED');
    await updateOccasion(o.id, { ...base, cardsAllowed: true });
    const ok = await scan(encodeCardPayload(card!.token), o.id, at(1));
    expect(ok).toMatchObject({ decision: { outcome: 'granted' }, card: { number: card!.number } });
    expect((await scan(encodeCardPayload(card!.token), o.id, at(1, 5)))?.decision.outcome).toBe('duplicate');
    expect(await listPresentCards()).toEqual([]);
    const people = await listAdmittedPeople(o.id);
    expect(people.cards.map((c) => c.card.holder?.lastName)).toEqual(['Probe']);
  });

  it('Dienstausweis gilt je Veranstaltung nur einmal; Zurücknehmen macht ihn wieder gültig', async () => {
    const o = await createOccasion({ ...base, cardsAllowed: true });
    const [card] = await createCards({ groupId: staff.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Lena', lastName: 'Probe' } });
    const code = encodeCardPayload(card!.token);
    expect((await scan(code, o.id, at(1)))?.decision.outcome).toBe('granted');
    const again = await scan(code, o.id, at(20));
    expect(again).toMatchObject({ decision: { outcome: 'denied', reason: 'ALREADY_ADMITTED' }, admittedAt: at(1).getTime() });
    await undoCardAdmission(o.id, card!.id, at(21).getTime());
    expect((await listAdmittedPeople(o.id)).cards).toEqual([]);
    expect((await scan(code, o.id, at(22)))?.decision.outcome).toBe('granted');
    expect((await listOccasionLog(o.id)).map((e) => [e.outcome, e.reason])).toEqual([
      ['admitted', 'OK'],
      ['denied', 'ALREADY_ADMITTED'],
      ['undone', 'ADMISSION_UNDONE'],
      ['admitted', 'OK'],
    ].reverse());
  });

  it('Gast mit vorhandener Karte: Karte gilt (auch ohne „Dienstausweise“), nur einmal, nicht nach Personenwechsel', async () => {
    const o = await createOccasion(base);
    const [card, other] = await createCards({ groupId: staff.id, count: 2 });
    await updateCard(card!.id, { accessGranted: false, holder: { rank: 'Hptm', firstName: 'Lena', lastName: 'Probe' } });
    const g = await addGuest(o.id, { person: { rank: 'Hptm', firstName: 'Lena', lastName: 'Probe' }, category: 'VIP', cardId: card!.id });
    expect(g).toMatchObject({ cardId: card!.id, cardNumber: card!.number });
    await expect(addGuest(o.id, { person: { firstName: 'X', lastName: 'Y' }, cardId: card!.id })).rejects.toThrow('schon auf der Gästeliste');
    await expect(addGuest(o.id, { person: { firstName: 'X', lastName: 'Y' }, cardId: other!.id })).rejects.toThrow('keiner Person');
    const code = encodeCardPayload(card!.token);
    // Gästeliste entscheidet: auch ohne Zutrittsberechtigung der Karte und ohne „Dienstausweise gelten“
    const ok = await scan(code, o.id, at(1));
    expect(ok).toMatchObject({ decision: { outcome: 'granted' }, guest: { number: g.number, admittedAt: at(1).getTime() }, card: { number: card!.number } });
    expect(await scan(code, o.id, at(30))).toMatchObject({ decision: { reason: 'ALREADY_ADMITTED' }, admittedAt: at(1).getTime() });
    // die Einladung desselben Gastes gilt dann auch nicht mehr
    expect((await scan(encodeGuestPayload(g.token), o.id, at(31)))?.decision.reason).toBe('ALREADY_ADMITTED');
    await undoAdmission(g.id, at(32).getTime());
    // Karte zurückgegeben und neu vergeben → andere Person: abgewiesen
    await returnCard(card!.id, at(33).getTime());
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Tom', lastName: 'Testmann' } });
    expect((await scan(code, o.id, at(34)))?.decision.reason).toBe('CARD_PERSON_CHANGED');
    // Verknüpfung lösen → Gast braucht wieder die Einladung, Karte gilt nicht
    await updateGuest(g.id, { person: { firstName: 'Lena', lastName: 'Probe' }, cardId: null });
    expect((await listGuests(o.id))[0]?.cardId).toBeUndefined();
    expect((await scan(code, o.id, at(40)))?.decision.reason).toBe('CARDS_NOT_ADMITTED');
  });

  it('Gast mit Karte: Ersatzkarte gilt, verlorene Karte und alter QR-Code nicht', async () => {
    const o = await createOccasion(base);
    const [card] = await createCards({ groupId: staff.id, count: 1 });
    await updateCard(card!.id, { accessGranted: true, holder: { firstName: 'Lena', lastName: 'Probe' } });
    await addGuest(o.id, { person: { firstName: 'Lena', lastName: 'Probe' }, cardId: card!.id });
    await reportCardLost(card!.id);
    expect((await scan(encodeCardPayload(card!.token), o.id, at(1)))?.decision.reason).toBe('CARD_LOST');
    const replacement = await issueReplacementCard(card!.id);
    expect((await scan(encodeCardPayload(replacement.token), o.id, at(2)))?.decision.outcome).toBe('granted');
    const fresh = await reissueToken(replacement.id);
    expect((await scan(encodeCardPayload(replacement.token), o.id, at(5)))?.decision.reason).toBe('OLD_CARD');
    expect((await scan(encodeCardPayload(fresh.token), o.id, at(6)))?.decision.reason).toBe('ALREADY_ADMITTED');
  });

  it('von Hand einlassen, zurücknehmen, danach wieder gültig', async () => {
    const o = await createOccasion(base);
    const g = await addGuest(o.id, { person: { firstName: 'Felix', lastName: 'Gast' } });
    expect((await admitGuestManually(g.id, at(0))).decision.outcome).toBe('granted');
    expect((await admitGuestManually(g.id, at(1))).decision.reason).toBe('ALREADY_ADMITTED');
    await undoAdmission(g.id, at(1, 30).getTime());
    expect((await listGuests(o.id))[0]?.admittedAt).toBeUndefined();
    expect((await scan(encodeGuestPayload(g.token), o.id, at(2)))?.decision.outcome).toBe('granted');
    expect((await listOccasionLog(o.id)).map((e) => e.outcome)).toEqual(['admitted', 'undone', 'admitted']);
  });

  it('Begleitpersonen: kommen beim Scan mit, korrigierbar (auch mehr), Zurücknehmen setzt zurück', async () => {
    const o = await createOccasion(base);
    const g = await addGuest(o.id, { person: { firstName: 'Max', lastName: 'Mustermann', companionNames: [' Anna Muster ', ''] }, companions: 2 });
    expect(g).toMatchObject({ companions: 2, person: { companionNames: ['Anna Muster'] } });
    expect(JSON.stringify(await db.guests.toArray())).not.toContain('Anna');
    await expect(setCompanionsAdmitted(g.id, 1)).rejects.toThrow('noch nicht eingelassen');
    const ok = await scan(encodeGuestPayload(g.token), o.id, at(1));
    expect(ok?.guest?.companionsAdmitted).toBe(2);
    expect(await setCompanionsAdmitted(g.id, 1)).toBe(1);
    expect(await setCompanionsAdmitted(g.id, 4)).toBe(4); // mehr als angemeldet: erlaubt
    expect(await setCompanionsAdmitted(g.id, 99)).toBe(20);
    expect((await listAdmittedPeople(o.id)).guests[0]?.companionsAdmitted).toBe(20);
    await undoAdmission(g.id, at(2).getTime());
    const afterUndo = (await listGuests(o.id))[0];
    expect(afterUndo?.companions).toBe(2);
    expect(afterUndo?.companionsAdmitted).toBeUndefined();
    expect((await admitGuestManually(g.id, at(3))).guest?.companionsAdmitted).toBe(2);
    await updateGuest(g.id, { person: { firstName: 'Max', lastName: 'Mustermann' }, companions: 0 });
    expect((await listGuests(o.id))[0]?.companions).toBeUndefined();
  });

  it('Gästedaten löschen: Namen weg, Zahlen bleiben', async () => {
    const o = await createSampleOccasion(at(0));
    const guests = await listGuests(o.id);
    await scan(encodeGuestPayload(guests[0]!.token), o.id);
    expect(await eraseGuestData(o.id)).toBe(guests.length);
    const after = await listGuests(o.id);
    expect(after.every((g) => !g.hasPerson && !g.person)).toBe(true);
    expect(after.filter((g) => g.admittedAt).length).toBe(1);
    expect((await listOccasionLog(o.id))[0]?.name).toBeUndefined();
  });
});
