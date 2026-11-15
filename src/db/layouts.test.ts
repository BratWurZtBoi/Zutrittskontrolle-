import { beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_LAYOUT_ID } from '../domain/presentationLayout';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createBackupFile, openBackupFile, restoreBackup, validatePayload } from './backup';
import { createCards } from './cards';
import { clearAllData, db } from './db';
import { ensureDefaultGroups, listGroups, updateGroup } from './groups';
import { deleteLayout, duplicateLayout, getLayout, layoutUsage, listLayouts, saveLayout, setCardLayout } from './layouts';
import { loadSettings, saveSettings } from './settings';

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
});

describe('Präsentationslayouts', () => {
  it('Standardlayout ist immer da und nicht änderbar', async () => {
    const all = await listLayouts();
    expect(all[0]?.id).toBe(STANDARD_LAYOUT_ID);
    await expect(saveLayout(all[0]!)).rejects.toThrow('Standardlayout');
    await expect(deleteLayout(STANDARD_LAYOUT_ID)).rejects.toThrow('Standardlayout');
  });

  it('kopieren, ändern, zuweisen, löschen', async () => {
    const vip = await duplicateLayout(STANDARD_LAYOUT_ID);
    expect(vip.name).toBe('Neues Layout');
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

  it('Layouts sind im Backup enthalten; ältere Backups ohne Layouts gehen weiter', async () => {
    const l = await duplicateLayout(STANDARD_LAYOUT_ID);
    await saveLayout({ ...l, name: 'Empfang', background: { ...l.background, kind: 'image', image: 'data:image/jpeg;base64,AAAA' } });
    const { blob } = await createBackupFile('Backup-Passwort', '0.7.0', 1000);
    await clearAllData();
    expect(await db.layouts.count()).toBe(0);
    await restoreBackup(await openBackupFile(await blob.text(), 'Backup-Passwort'));
    expect((await listLayouts()).map((x) => x.name)).toEqual(['Standard', 'Empfang']);
    expect((await listLayouts())[1]?.background.image).toBe('data:image/jpeg;base64,AAAA');

    const old = validatePayload({ groups: [], cards: [], events: [], presence: [], settings: {} });
    expect(old.layouts).toEqual([]);
  });
});
