import { beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_CARD_LAYOUT_ID } from '../domain/cardLayout';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createBackupFile, openBackupFile, restoreBackup, validatePayload } from './backup';
import { cardLayoutUsage, createCardLayout, deleteCardLayout, duplicateCardLayout, listCardLayouts, saveCardLayout } from './cardLayouts';
import { clearAllData, db } from './db';
import { ensureDefaultGroups, listGroups, updateGroup } from './groups';
import { loadSettings, saveSettings } from './settings';

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
});

describe('Kartenlayouts', () => {
  it('mitgeliefertes Layout ist immer da und nicht änderbar', async () => {
    const [std] = await listCardLayouts();
    expect(std?.id).toBe(STANDARD_CARD_LAYOUT_ID);
    await expect(saveCardLayout(std!)).rejects.toThrow('mitgelieferte');
    await expect(deleteCardLayout(STANDARD_CARD_LAYOUT_ID)).rejects.toThrow('mitgelieferte');
  });

  it('aus Vorlage anlegen, ändern, zuweisen, löschen', async () => {
    const hoch = await createCardLayout('portrait');
    expect(hoch).toMatchObject({ name: 'Neues Kartenlayout', orientation: 'portrait' });
    await saveCardLayout({ ...hoch, name: 'Besucher hoch' });
    expect((await duplicateCardLayout(hoch.id)).name).toBe('Besucher hoch (Kopie)');

    const groups = await listGroups();
    await updateGroup(groups[1]!.id, { ...groups[1]!, cardLayoutId: hoch.id });
    await saveSettings({ defaultCardLayoutId: hoch.id });
    expect((await cardLayoutUsage()).get(hoch.id)).toEqual([groups[1]!.name]);

    await deleteCardLayout(hoch.id);
    expect((await db.groups.get(groups[1]!.id))?.cardLayoutId).toBeUndefined();
    expect((await loadSettings()).defaultCardLayoutId).toBe(STANDARD_CARD_LAYOUT_ID);
  });

  it('ohne QR-Code wird nicht gespeichert', async () => {
    const l = await createCardLayout();
    await expect(saveCardLayout({ ...l, elements: l.elements.filter((e) => e.type !== 'qr') })).rejects.toThrow('QR-Code');
  });

  it('im Backup enthalten; ältere Backups ohne Kartenlayouts gehen weiter', async () => {
    const l = await createCardLayout('minimal');
    await saveCardLayout({ ...l, name: 'Schlicht' });
    const { blob } = await createBackupFile('Backup-Passwort', '0.10.0', 1000);
    await clearAllData();
    expect(await db.cardLayouts.count()).toBe(0);
    await restoreBackup(await openBackupFile(await blob.text(), 'Backup-Passwort'));
    expect((await listCardLayouts()).map((x) => x.name)).toEqual(['Standard', 'Schlicht']);
    expect(validatePayload({ groups: [], cards: [], events: [], presence: [], settings: {} }).cardLayouts).toEqual([]);
  });
});
