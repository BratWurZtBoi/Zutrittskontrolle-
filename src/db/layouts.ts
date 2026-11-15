import {
  STANDARD_LAYOUT,
  STANDARD_LAYOUT_ID,
  copyLayout,
  normalizeLayout,
  type PresentationLayout,
} from '../domain/presentationLayout';
import { ValidationError, db, newId } from './db';
import { loadSettings, saveSettings } from './settings';

/** Alle Layouts: zuerst das mitgelieferte Standardlayout, dann eigene nach Name. */
export async function listLayouts(): Promise<PresentationLayout[]> {
  const own = (await db.layouts.toArray()).filter((l) => l.id !== STANDARD_LAYOUT_ID).map(normalizeLayout);
  own.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return [STANDARD_LAYOUT, ...own];
}

export async function getLayout(id: string): Promise<PresentationLayout | undefined> {
  if (id === STANDARD_LAYOUT_ID) return STANDARD_LAYOUT;
  const l = await db.layouts.get(id);
  return l ? normalizeLayout(l) : undefined;
}

/** Neues Layout als Kopie eines vorhandenen (Standard: Kopie des Standardlayouts). */
export async function duplicateLayout(sourceId: string, now = Date.now()): Promise<PresentationLayout> {
  const source = (await getLayout(sourceId)) ?? STANDARD_LAYOUT;
  const names = new Set((await db.layouts.toArray()).map((l) => l.name));
  let name = source.builtIn ? 'Neues Layout' : `${source.name} (Kopie)`;
  for (let i = 2; names.has(name); i++) name = `${source.builtIn ? 'Neues Layout' : `${source.name} (Kopie)`} ${i}`;
  const layout = copyLayout(source, newId(), name, now);
  await db.layouts.add(layout);
  return layout;
}

export async function saveLayout(layout: PresentationLayout, now = Date.now()): Promise<void> {
  if (layout.builtIn || layout.id === STANDARD_LAYOUT_ID) throw new ValidationError('Das Standardlayout kann nicht geändert werden – bitte kopieren.');
  const name = layout.name.trim();
  if (!name) throw new ValidationError('Bitte einen Namen für das Layout eingeben.');
  if (name.length > 40) throw new ValidationError('Der Name darf höchstens 40 Zeichen lang sein.');
  await db.layouts.put({ ...layout, name, updatedAt: now });
}

/** Layout löschen; Gruppen und Karten, die es verwenden, fallen auf das Standardlayout zurück. */
export async function deleteLayout(id: string): Promise<void> {
  if (id === STANDARD_LAYOUT_ID) throw new ValidationError('Das Standardlayout kann nicht gelöscht werden.');
  await db.transaction('rw', [db.layouts, db.groups, db.cards], async () => {
    await db.layouts.delete(id);
    await db.groups.where('id').notEqual('').modify((g) => {
      if (g.presentationLayoutId === id) delete g.presentationLayoutId;
    });
    await db.cards.where('id').notEqual('').modify((c) => {
      if (c.presentationLayoutId === id) delete c.presentationLayoutId;
    });
  });
  if ((await loadSettings()).defaultLayoutId === id) await saveSettings({ defaultLayoutId: STANDARD_LAYOUT_ID });
}

/** Eigenes Layout für eine Karte setzen (undefined = wie die Gruppe). */
export async function setCardLayout(cardId: string, layoutId: string | undefined, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(cardId);
    if (!card) throw new ValidationError('Karte nicht gefunden.');
    const { presentationLayoutId: _old, ...rest } = card;
    await db.cards.put(layoutId ? { ...rest, presentationLayoutId: layoutId, updatedAt: now } : { ...rest, updatedAt: now });
  });
}

/** Wo wird ein Layout verwendet? (für die Übersicht im Editor) */
export async function layoutUsage(): Promise<Map<string, { groups: string[]; cards: number }>> {
  const usage = new Map<string, { groups: string[]; cards: number }>();
  const entry = (id: string) => {
    let e = usage.get(id);
    if (!e) usage.set(id, (e = { groups: [], cards: 0 }));
    return e;
  };
  for (const g of await db.groups.toArray()) if (g.presentationLayoutId) entry(g.presentationLayoutId).groups.push(g.name);
  await db.cards.each((c) => {
    if (c.presentationLayoutId) entry(c.presentationLayoutId).cards++;
  });
  return usage;
}
