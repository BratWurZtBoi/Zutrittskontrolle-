import { beforeEach, describe, expect, it } from 'vitest';
import { encodeCardPayload, encodeGuestPayload } from '../domain/cardCode';
import type { Group } from '../domain/types';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createCards, updateCard } from './cards';
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
  setGuestCancelled,
  startEntry,
  undoAdmission,
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
