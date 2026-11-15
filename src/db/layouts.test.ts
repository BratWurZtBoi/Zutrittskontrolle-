import { beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_IDLE_ID, STANDARD_LAYOUT_ID } from '../domain/presentationLayout';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createBackupFile, openBackupFile, restoreBackup, validatePayload } from './backup';
import { createCards } from './cards';
import { clearAllData, db } from './db';
import { ensureDefaultGroups, listGroups, updateGroup } from './groups';
import {
  createLayout,
  deleteLayout,
  duplicateLayout,
  getLayout,
  layoutUsage,
  listLayouts,
  saveLayout,
  setCardLayout,
  upgradeLegacyLayouts,
} from './layouts';
import { loadSettings, saveSettings } from './settings';

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
});

describe('Präsentationslayouts', () => {
  it('mitgelieferter Ruhebildschirm und Scan-Anzeige sind immer da und nicht änderbar', async () => {
    const all = await listLayouts();
    expect(all.slice(0, 2).map((l) => [l.id, l.kind])).toEqual([
      [STANDARD_IDLE_ID, 'idle'],
      [STANDARD_LAYOUT_ID, 'result'],
    ]);
    await expect(saveLayout(all[1]!)).rejects.toThrow('Mitgelieferte');
    await expect(deleteLayout(STANDARD_IDLE_ID)).rejects.toThrow('Mitgelieferte');
  });

  it('Scan-Anzeige: anlegen, ändern, zuweisen, löschen', async () => {
    const vip = await createLayout('result');
    expect(vip).toMatchObject({ name: 'Neue Scan-Anzeige', kind: 'result' });
    await saveLayout({ ...vip, name: 'VIP', texts: { ...vip.texts, inTitle: 'Hallo {vorname}!' } });
    expect((await getLayout(vip.id))?.texts.inTitle).toBe('Hallo {vorname}!');
    expect((await duplicateLayout(vip.id)).name).toBe('VIP (Kopie)');

    const [staff] = await listGroups();
    await updateGroup(staff!.id, { ...staff!, presentationLayoutId: vip.id });
    const [card] = await createCards({ groupId: staff!.id, count: 1 });
    await setCardLayout(card!.id, vip.id);
    await saveSettings({ defaultLayoutId: vip.id });
    expect((await layoutUsage()).get(vip.id)).toEqual({ groups: [staff!.name], cards: 1 });

    await deleteLayout(vip.id);
    expect((await db.groups.get(staff!.id))?.presentationLayoutId).toBeUndefined();
    expect((await db.cards.get(card!.id))?.presentationLayoutId).toBeUndefined();
    expect((await loadSettings()).defaultLayoutId).toBe(STANDARD_LAYOUT_ID);
  });

  it('Ruhebildschirm: eigenes Design mit eigenen Elementen, aktivieren, löschen', async () => {
    const idle = await createLayout('idle');
    expect(idle).toMatchObject({ name: 'Neuer Ruhebildschirm', kind: 'idle' });
    const extra = { id: 'fest', type: 'text' as const, text: 'Heute Betriebsfest', x: 10, y: 5, w: 80, size: 6, align: 'center' as const, bold: true };
    await saveLayout({ ...idle, elements: [...idle.elements, extra] });
    expect((await getLayout(idle.id))?.elements.at(-1)).toMatchObject({ text: 'Heute Betriebsfest' });
    await saveSettings({ idleLayoutId: idle.id });
    await deleteLayout(idle.id);
    expect((await loadSettings()).idleLayoutId).toBe(STANDARD_IDLE_ID);
  });

  it('Layouts der Version 0.7 werden umgewandelt – der Ruhebildschirm bleibt erhalten', async () => {
    await db.layouts.add({
      id: 'alt',
      name: 'Empfang',
      arrangement: 'center',
      show: { photo: true, group: true, company: false, clock: true, org: true },
      texts: { idleTitle: 'Willkommen bei uns', inTitle: 'Hallo {vorname}!' },
      background: { kind: 'color', color: '#7c3aed', color2: '#000000', dim: 0 },
    } as never);
    await saveSettings({ defaultLayoutId: 'alt' });
    expect(await upgradeLegacyLayouts(5)).toBe(1);
    const all = await listLayouts();
    const result = all.find((l) => l.id === 'alt');
    const idle = all.find((l) => l.id === 'alt-ruhe');
    expect(result).toMatchObject({ kind: 'result', texts: { inTitle: 'Hallo {vorname}!' } });
    expect(idle?.kind).toBe('idle');
    expect(idle?.elements.some((e) => e.text === 'Willkommen bei uns')).toBe(true);
    expect((await loadSettings()).idleLayoutId).toBe('alt-ruhe');
    expect(await upgradeLegacyLayouts()).toBe(0); // nur einmal
  });

  it('Layouts sind im Backup enthalten; ältere Backups ohne Layouts gehen weiter', async () => {
    const l = await createLayout('result');
    await saveLayout({ ...l, name: 'Empfang', background: { ...l.background, kind: 'image', image: 'data:image/jpeg;base64,AAAA' } });
    const idle = await createLayout('idle');
    await saveLayout({ ...idle, name: 'Fest' });
    const { blob } = await createBackupFile('Backup-Passwort', '0.8.0', 1000);
    await clearAllData();
    expect(await db.layouts.count()).toBe(0);
    await restoreBackup(await openBackupFile(await blob.text(), 'Backup-Passwort'));
    const names = (await listLayouts()).filter((x) => !x.builtIn).map((x) => [x.kind, x.name]);
    expect(names).toEqual([
      ['idle', 'Fest'],
      ['result', 'Empfang'],
    ]);
    expect((await listLayouts()).find((x) => x.name === 'Empfang')?.background.image).toBe('data:image/jpeg;base64,AAAA');

    const old = validatePayload({ groups: [], cards: [], events: [], presence: [], settings: {} });
    expect(old.layouts).toEqual([]);
  });
});
