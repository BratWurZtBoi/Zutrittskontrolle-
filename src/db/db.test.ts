import { beforeEach, describe, expect, it } from 'vitest';
import { encodeCardPayload } from '../domain/cardCode';
import type { PersonInput } from '../domain/types';
import { clearAllData, db } from './db';
import {
  MAX_PERSONS,
  ValidationError,
  createPerson,
  deletePerson,
  reissueCard,
  setCardBlocked,
  suggestPersonnelNo,
  updatePerson,
} from './persons';
import { listPresentPersons, listRecentEvents, processScan } from './scans';
import { removeTestPersons, seedTestPersons } from './seed';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';

const base: PersonInput = { personnelNo: 'P-0001', firstName: 'Max', lastName: 'Mustermann', accessGranted: true };
const opts = { mode: 'auto' as const, cooldownMs: 30_000, source: 'test' as const };
const at = (sec: number) => new Date(2026, 5, 15, 9, 0, sec);

beforeEach(async () => {
  await clearAllData();
});

describe('Personenverwaltung', () => {
  it('legt Personen mit Ausweis an und prüft Eindeutigkeit der ID', async () => {
    const p = await createPerson({ ...base, firstName: '  Max ' });
    expect(p.firstName).toBe('Max');
    expect(p.cardToken).toMatch(/^[A-Z2-7]{26}$/);
    expect(p.cardBlocked).toBe(false);
    await expect(createPerson({ ...base, firstName: 'Erika' })).rejects.toThrow(ValidationError);
  });

  it('validiert Pflichtfelder und Gültigkeitszeitraum', async () => {
    await expect(createPerson({ ...base, lastName: ' ' })).rejects.toThrow('Nachnamen');
    await expect(createPerson({ ...base, validFrom: '2026-05-01', validUntil: '2026-04-01' })).rejects.toThrow(
      'liegt vor',
    );
  });

  it('aktualisiert Personen und erlaubt das Entfernen optionaler Felder', async () => {
    const p = await createPerson({ ...base, note: 'Hinweis', validUntil: '2026-12-31' });
    const u = await updatePerson(p.id, { ...base, lastName: 'Neu' });
    expect(u.lastName).toBe('Neu');
    expect(u.note).toBeUndefined();
    expect(u.validUntil).toBeUndefined();
    expect(u.cardToken).toBe(p.cardToken);
  });

  it('begrenzt die Anzahl der Personen', async () => {
    await db.persons.bulkAdd(
      Array.from({ length: MAX_PERSONS }, (_, i) => ({
        ...base,
        id: `id-${i}`,
        personnelNo: `X-${i}`,
        cardToken: `TOKEN${i}`,
        cardIssuedAt: 0,
        cardBlocked: false,
        createdAt: 0,
        updatedAt: 0,
      })),
    );
    await expect(createPerson({ ...base, personnelNo: 'P-9999' })).rejects.toThrow('höchstens');
  });

  it('schlägt fortlaufende IDs vor', async () => {
    expect(await suggestPersonnelNo()).toBe('P-0001');
    await createPerson({ ...base, personnelNo: 'P-0007' });
    expect(await suggestPersonnelNo()).toBe('P-0008');
  });
});

describe('Scan-Verarbeitung', () => {
  it('bucht ein und aus und führt die Anwesenheit', async () => {
    const p = await createPerson(base);
    const code = encodeCardPayload(p.cardToken);

    const r1 = await processScan(code, { ...opts, now: at(0) });
    expect(r1.decision).toMatchObject({ outcome: 'granted', direction: 'in' });
    expect(r1.person?.id).toBe(p.id);
    expect((await listPresentPersons()).map((x) => x.person.id)).toEqual([p.id]);

    const r2 = await processScan(code, { ...opts, now: at(40) });
    expect(r2.decision).toMatchObject({ outcome: 'granted', direction: 'out' });
    expect(await listPresentPersons()).toEqual([]);

    const events = await listRecentEvents();
    expect(events.map((e) => e.direction)).toEqual(['out', 'in']);
    expect(events[0]).toMatchObject({ personName: 'Max Mustermann', personnelNo: 'P-0001', outcome: 'granted' });
  });

  it('ignoriert Doppelscans und protokolliert sie nicht', async () => {
    const p = await createPerson(base);
    const code = encodeCardPayload(p.cardToken);
    await processScan(code, { ...opts, now: at(0) });
    const dup = await processScan(code, { ...opts, now: at(10) });
    expect(dup.decision).toMatchObject({ outcome: 'duplicate', secondsSinceLast: 10 });
    expect(dup.event).toBeUndefined();
    expect(await db.events.count()).toBe(1);
  });

  it('protokolliert ungültige, unbekannte und gesperrte Ausweise', async () => {
    const p = await createPerson(base);
    const oldCode = encodeCardPayload(p.cardToken);

    expect((await processScan('Hallo Welt', opts)).decision.reason).toBe('INVALID_CODE');

    await setCardBlocked(p.id, true);
    const blocked = await processScan(oldCode, opts);
    expect(blocked.decision.reason).toBe('CARD_BLOCKED');
    expect(blocked.person?.id).toBe(p.id);

    const reissued = await reissueCard(p.id);
    expect(reissued.cardBlocked).toBe(false);
    expect((await processScan(oldCode, opts)).decision.reason).toBe('UNKNOWN_CARD');
    expect((await processScan(encodeCardPayload(reissued.cardToken), opts)).decision.outcome).toBe('granted');

    const events = await listRecentEvents();
    expect(events.map((e) => e.reason).sort()).toEqual(['CARD_BLOCKED', 'INVALID_CODE', 'OK', 'UNKNOWN_CARD']);
  });

  it('behält das Protokoll beim Löschen einer Person', async () => {
    const p = await createPerson(base);
    await processScan(encodeCardPayload(p.cardToken), opts);
    await deletePerson(p.id);
    expect(await listPresentPersons()).toEqual([]);
    expect((await listRecentEvents())[0]?.personName).toBe('Max Mustermann');
  });
});

describe('Testdaten', () => {
  it('legt fiktive Testpersonen an und entfernt sie wieder', async () => {
    const today = new Date(2026, 5, 15);
    expect(await seedTestPersons(today)).toBe(12);
    expect(await seedTestPersons(today)).toBe(0); // idempotent
    await createPerson({ ...base, personnelNo: 'P-0100' });

    const all = await db.persons.toArray();
    expect(all.filter((p) => p.cardBlocked).map((p) => p.lastName)).toEqual(['Platzhalter']);
    expect(all.find((p) => p.lastName === 'Demo')?.validUntil).toBe('2026-06-14');

    expect(await removeTestPersons()).toBe(12);
    expect((await db.persons.toArray()).map((p) => p.personnelNo)).toEqual(['P-0100']);
  });
});

describe('Einstellungen', () => {
  it('liefert Standardwerte und speichert Änderungen', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    await saveSettings({ cooldownSec: 60 });
    expect((await loadSettings()).cooldownSec).toBe(60);
    expect((await loadSettings()).scanMode).toBe('auto');
  });
});
