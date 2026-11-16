import {
  CARD_TEMPLATES,
  STANDARD_CARD_LAYOUT,
  STANDARD_CARD_LAYOUT_ID,
  copyCardLayout,
  normalizeCardLayout,
  type CardLayout,
} from '../domain/cardLayout';
import { ValidationError, db, newId } from './db';
import { loadSettings, saveSettings } from './settings';

/** Alle Kartenlayouts: zuerst das mitgelieferte, dann eigene nach Name. */
export async function listCardLayouts(): Promise<CardLayout[]> {
  const own = (await db.cardLayouts.toArray()).filter((l) => l.id !== STANDARD_CARD_LAYOUT_ID).map(normalizeCardLayout);
  own.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return [STANDARD_CARD_LAYOUT, ...own];
}

async function uniqueName(base: string): Promise<string> {
  const names = new Set((await db.cardLayouts.toArray()).map((l) => l.name));
  let name = base;
  for (let i = 2; names.has(name); i++) name = `${base} ${i}`;
  return name;
}

/** Neues Kartenlayout aus einer Vorlage (Standard: Querformat). */
export async function createCardLayout(templateId = 'standard', now = Date.now()): Promise<CardLayout> {
  const template = CARD_TEMPLATES.find((t) => t.id === templateId) ?? CARD_TEMPLATES[0]!;
  const layout: CardLayout = {
    ...copyCardLayout(STANDARD_CARD_LAYOUT, newId(), await uniqueName('Neues Kartenlayout'), now),
    orientation: template.orientation,
    elements: template.elements(),
  };
  await db.cardLayouts.add(layout);
  return layout;
}

export async function duplicateCardLayout(sourceId: string, now = Date.now()): Promise<CardLayout> {
  if (sourceId === STANDARD_CARD_LAYOUT_ID) return createCardLayout('standard', now);
  const raw = await db.cardLayouts.get(sourceId);
  if (!raw) throw new ValidationError('Kartenlayout nicht gefunden.');
  const source = normalizeCardLayout(raw);
  const layout = copyCardLayout(source, newId(), await uniqueName(`${source.name} (Kopie)`), now);
  await db.cardLayouts.add(layout);
  return layout;
}

export async function saveCardLayout(layout: CardLayout, now = Date.now()): Promise<void> {
  if (layout.builtIn || layout.id === STANDARD_CARD_LAYOUT_ID) {
    throw new ValidationError('Das mitgelieferte Kartenlayout kann nicht geändert werden – bitte kopieren.');
  }
  const name = layout.name.trim();
  if (!name) throw new ValidationError('Bitte einen Namen für das Kartenlayout eingeben.');
  if (name.length > 40) throw new ValidationError('Der Name darf höchstens 40 Zeichen lang sein.');
  if (!layout.elements.some((e) => e.type === 'qr')) {
    throw new ValidationError('Die Karte braucht einen QR-Code – sonst kann sie nicht gescannt werden.');
  }
  await db.cardLayouts.put({ ...layout, name, updatedAt: now });
}

/** Kartenlayout löschen; Gruppen, die es verwenden, fallen auf das Standardlayout zurück. */
export async function deleteCardLayout(id: string): Promise<void> {
  if (id === STANDARD_CARD_LAYOUT_ID) throw new ValidationError('Das mitgelieferte Kartenlayout kann nicht gelöscht werden.');
  await db.transaction('rw', [db.cardLayouts, db.groups], async () => {
    await db.cardLayouts.delete(id);
    await db.groups.where('id').notEqual('').modify((g) => {
      if (g.cardLayoutId === id) delete g.cardLayoutId;
    });
  });
  if ((await loadSettings()).defaultCardLayoutId === id) await saveSettings({ defaultCardLayoutId: STANDARD_CARD_LAYOUT_ID });
}

/** Welche Gruppen verwenden welches Kartenlayout? */
export async function cardLayoutUsage(): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>();
  for (const g of await db.groups.toArray()) {
    if (!g.cardLayoutId) continue;
    usage.set(g.cardLayoutId, [...(usage.get(g.cardLayoutId) ?? []), g.name]);
  }
  return usage;
}

/** Gruppen, die dieses Kartenlayout verwenden, festlegen (andere Gruppen bleiben unverändert). */
export async function setCardLayoutGroups(layoutId: string, groupIds: Iterable<string>): Promise<void> {
  const wanted = new Set(groupIds);
  await db.transaction('rw', db.groups, async () => {
    await db.groups.where('id').notEqual('').modify((g) => {
      if (wanted.has(g.id)) g.cardLayoutId = layoutId;
      else if (g.cardLayoutId === layoutId) delete g.cardLayoutId;
    });
  });
}
