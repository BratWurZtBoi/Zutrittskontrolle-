import { beforeEach, describe, expect, it } from 'vitest';
import { encodeCardPayload } from '../domain/cardCode';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createBackupFile, openBackupFile, restoreBackup, validatePayload } from './backup';
import { createCards, listCards, updateCard } from './cards';
import { VAULT_KEY, clearAllData, db } from './db';
import { createGroup, ensureDefaultGroups, listGroups } from './groups';
import { listPresentCards, listRecentEvents, processScan } from './scans';
import { loadSettings, saveSettings } from './settings';
import { addUnassigned, listUnassigned } from './unassigned';
import { createSampleOccasion, listGuests, listOccasionLog, listOccasions, processOccasionScan } from './occasions';
import { encodeGuestPayload } from '../domain/cardCode';

const FAST = 1000;
const PW = 'Backup-Passwort';
const opts = { mode: 'auto' as const, cooldownMs: 0, source: 'test' as const };

async function freshDevice(): Promise<void> {
  await clearAllData(true);
  setDataKeyForTests((await createVault('geraetepasswort', FAST)).dataKey);
}

async function sampleData() {
  await ensureDefaultGroups();
  const extra = await createGroup({ name: 'Dienstleister', color: '#16a34a', prefix: 'D', accessGranted: true, allowUnassigned: true, printHolder: false });
  const [staff] = await listGroups();
  const [a, b] = await createCards({ groupId: staff!.id, count: 2 });
  await createCards({ groupId: extra.id, count: 1 });
  await updateCard(a!.id, { accessGranted: true, validUntil: '2030-12-31', holder: { firstName: 'Max', lastName: 'Mustermann', company: 'Technik', photo: 'data:image/jpeg;base64,AAAA', note: 'Notiz' } });
  await updateCard(b!.id, { accessGranted: false, holder: { firstName: 'Erika', lastName: 'Musterfrau' } });
  await processScan(encodeCardPayload(a!.token), opts);
  await processScan(encodeCardPayload(b!.token), opts);
  await processScan('fremder Code', opts);
  await saveSettings({ orgName: 'Testfirma', cooldownSec: 45, camera: 'device:xyz' });
  await addUnassigned([{ holder: { firstName: 'Nina', lastName: 'Wartend', company: 'Extern' }, accessGranted: false, validUntil: '2030-01-31', groupHint: 'Besuchr' }]);
  const occasion = await createSampleOccasion();
  const [guest] = await listGuests(occasion.id);
  await processOccasionScan(encodeGuestPayload(guest!.token), { occasionId: occasion.id, cooldownMs: 0, source: 'test' });
  return { a: a!, b: b!, occasion, guest: guest! };
}

beforeEach(freshDevice);

describe('Backup', () => {
  it('sichert alles verschlüsselt und stellt es vollständig wieder her', async () => {
    const { a, occasion, guest } = await sampleData();
    const before = await listCards();
    const guestsBefore = await listGuests(occasion.id);
    const { blob, filename, summary } = await createBackupFile(PW, '0.5.0', FAST);
    expect(filename).toMatch(/^zutrittskontrolle-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zkb$/);
    expect(summary).toMatchObject({ groups: 3, cards: 3, assignedCards: 2, events: 3, unassigned: 1, appVersion: '0.5.0' });
    const text = await blob.text();
    expect(text).not.toMatch(/Mustermann|Musterfrau|Testfirma|Wartend/); // nichts im Klartext

    // Neues Gerät mit anderem Admin-Passwort (= anderer Datenschlüssel)
    await freshDevice();
    const payload = await openBackupFile(text, PW);
    await restoreBackup(payload);

    const after = await listCards();
    expect(after.map((x) => [x.card.number, x.card.holder, x.card.accessGranted, x.card.validUntil, x.group?.name])).toEqual(
      before.map((x) => [x.card.number, x.card.holder, x.card.accessGranted, x.card.validUntil, x.group?.name]),
    );
    expect((await listPresentCards()).map((p) => p.card.id)).toEqual([a.id]);
    const events = await listRecentEvents();
    expect(events.map((e) => e.holderName).filter(Boolean).sort()).toEqual(['Erika Musterfrau', 'Max Mustermann']);
    expect((await db.cards.toArray()).every((c) => c.holder === undefined)).toBe(true); // wieder verschlüsselt
    expect((await listUnassigned()).map((u) => [u.holder, u.accessGranted, u.validUntil, u.groupHint])).toEqual([
      [{ firstName: 'Nina', lastName: 'Wartend', company: 'Extern' }, false, '2030-01-31', 'Besuchr'],
    ]);

    const settings = await loadSettings();
    expect(settings.orgName).toBe('Testfirma');
    expect(settings.cooldownSec).toBe(45);
    expect(settings.camera).toBe('user'); // gerätebezogen: nicht übernommen

    // Karten funktionieren nach dem Einspielen weiter
    expect((await processScan(encodeCardPayload(a.token), opts)).decision.direction).toBe('out');

    // Veranstaltung mit Gästen, Einlass und Protokoll ist wieder da – Einladung bleibt verbraucht
    expect((await listOccasions()).map((o) => [o.name, o.admitted])).toEqual([[occasion.name, 1]]);
    expect((await listGuests(occasion.id)).map((g) => [g.number, g.person, g.admittedAt])).toEqual(
      guestsBefore.map((g) => [g.number, g.person, g.admittedAt]),
    );
    expect((await listOccasionLog(occasion.id))[0]?.name).toBe('Oberst Max Mustermann');
    expect(JSON.stringify(await db.guests.toArray())).not.toContain('Mustermann');
    const again = await processOccasionScan(encodeGuestPayload(guest.token), { occasionId: occasion.id, cooldownMs: 0, source: 'test' });
    expect(again?.decision.reason).toBe('ALREADY_ADMITTED');
  });

  it('lehnt ein falsches Backup-Passwort ab', async () => {
    await sampleData();
    const { blob } = await createBackupFile(PW, undefined, FAST);
    await expect(openBackupFile(await blob.text(), 'falsches-Passwort')).rejects.toThrow('falsch');
  });

  it('erkennt manipulierte und fremde Dateien', async () => {
    await sampleData();
    const { blob } = await createBackupFile(PW, undefined, FAST);
    const env = JSON.parse(await blob.text());
    const data = env.data as string;
    env.data = data.slice(0, 10) + (data[10] === 'A' ? 'B' : 'A') + data.slice(11);
    await expect(openBackupFile(JSON.stringify(env), PW)).rejects.toThrow();
    await expect(openBackupFile('{"hallo":1}', PW)).rejects.toThrow('kein Backup');
    await expect(openBackupFile('kein json', PW)).rejects.toThrow('kein Backup');
    await expect(openBackupFile(JSON.stringify({ ...env, version: 99 }), PW)).rejects.toThrow('anderen App-Version');
  });

  it('prüft den Inhalt auf Plausibilität', () => {
    const group = { id: 'g', name: 'G', prefix: 'G', color: '#000000' };
    const card = { id: 'c', number: 'G-001', token: 'T', groupId: 'g' };
    expect(() => validatePayload({ groups: [group], cards: [card], events: [], presence: [] })).not.toThrow();
    expect(() => validatePayload({ groups: [], cards: [card], events: [], presence: [] })).toThrow('Gruppe der Karte');
    expect(() => validatePayload({ groups: [group], cards: [card, { ...card, id: 'd' }], events: [], presence: [] })).toThrow('doppelte');
    expect(() => validatePayload({ cards: [] })).toThrow('Aufbau');
  });

  it('verlangt ein ausreichend langes Backup-Passwort und entsperrte Daten', async () => {
    await sampleData();
    await expect(createBackupFile('kurz', undefined, FAST)).rejects.toThrow('8 Zeichen');
    setDataKeyForTests(null);
    await expect(createBackupFile(PW, undefined, FAST)).rejects.toThrow('gesperrt');
  });

  it('das Admin-Passwort des Geräts bleibt beim Einspielen erhalten', async () => {
    await sampleData();
    const { blob } = await createBackupFile(PW, undefined, FAST);
    await db.settings.put({ key: VAULT_KEY, value: { marker: 'tresor' } });
    await restoreBackup(await openBackupFile(await blob.text(), PW));
    expect((await db.settings.get(VAULT_KEY))?.value).toEqual({ marker: 'tresor' });
  });
});
