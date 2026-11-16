import { beforeEach, describe, expect, it } from 'vitest';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createCards, listCards, updateCard } from './cards';
import { clearAllData, db } from './db';
import { ensureDefaultGroups, listGroups } from './groups';
import { addUnassigned, assignUnassigned, deleteUnassigned, listUnassigned } from './unassigned';

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
});

const person = (firstName: string, lastName: string, extra: Partial<{ accessGranted: boolean; validUntil: string }> = {}) => ({
  holder: { firstName, lastName },
  accessGranted: extra.accessGranted ?? true,
  validUntil: extra.validUntil,
});

describe('Nicht zugeordnete Personen', () => {
  it('nimmt zuerst freie Karten der Gruppe, danach neue', async () => {
    const [, visitors] = await listGroups();
    const [b1, b2, b3] = await createCards({ groupId: visitors!.id, count: 3 });
    await updateCard(b2!.id, { accessGranted: true, holder: { firstName: 'Schon', lastName: 'Vergeben' } });
    await db.cards.update(b3!.id, { blocked: true });
    await addUnassigned([person('Anna', 'Eins'), person('Ben', 'Zwei', { accessGranted: false, validUntil: '2026-12-31' })]);
    const ids = (await listUnassigned()).map((p) => p.id);

    const result = await assignUnassigned(ids, visitors!.id, 1000);
    expect(result.created).toBe(1);
    expect(result.assigned.map((a) => [a.number, a.name])).toEqual([
      ['B-001', 'Anna Eins'], // freie Karte
      ['B-004', 'Ben Zwei'], // B-002 vergeben, B-003 gesperrt → neue Karte
    ]);
    expect(result.assigned[0]?.cardId).toBe(b1!.id);
    const cards = new Map((await listCards()).map(({ card }) => [card.number, card]));
    expect(cards.get('B-001')?.holder).toEqual({ firstName: 'Anna', lastName: 'Eins' });
    expect(cards.get('B-004')).toMatchObject({ accessGranted: false, validUntil: '2026-12-31', holderSince: 1000 });
    expect((await db.cards.get(b1!.id))?.nameEnc).toBeDefined(); // Name fürs Protokoll
    expect(await listUnassigned()).toEqual([]);
  });

  it('löscht Personen und braucht entsperrte Daten', async () => {
    await addUnassigned([person('Anna', 'Eins'), person('Ben', 'Zwei')]);
    const [first] = await listUnassigned();
    expect(await deleteUnassigned([first!.id])).toBe(1);
    expect((await listUnassigned()).map((p) => p.holder?.firstName)).toEqual(['Ben']);

    setDataKeyForTests(null);
    expect((await listUnassigned())[0]?.holder).toBeUndefined(); // gesperrt: keine Namen
    const [, visitors] = await listGroups();
    await expect(assignUnassigned([(await listUnassigned())[0]!.id], visitors!.id)).rejects.toThrow(/gesperrt/);
  });
});
