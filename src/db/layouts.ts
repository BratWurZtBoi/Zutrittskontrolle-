import {
  BUILT_IN_LAYOUTS,
  STANDARD_IDLE_ID,
  STANDARD_LAYOUT_ID,
  builtInFor,
  copyLayout,
  idleFromLegacy,
  isLegacyLayout,
  normalizeLayout,
  type PresentationLayout,
  type ScreenKind,
} from '../domain/presentationLayout';
import { ValidationError, db, newId } from './db';
import { loadSettings, saveSettings } from './settings';

/** Alle Layouts: zuerst die mitgelieferten, dann eigene nach Art und Name. */
export async function listLayouts(): Promise<PresentationLayout[]> {
  const builtInIds = new Set(BUILT_IN_LAYOUTS.map((l) => l.id));
  const own = (await db.layouts.toArray()).filter((l) => !builtInIds.has(l.id)).map(normalizeLayout);
  own.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'de'));
  return [...BUILT_IN_LAYOUTS, ...own];
}

export async function getLayout(id: string): Promise<PresentationLayout | undefined> {
  const builtIn = BUILT_IN_LAYOUTS.find((l) => l.id === id);
  if (builtIn) return builtIn;
  const l = await db.layouts.get(id);
  return l ? normalizeLayout(l) : undefined;
}

async function uniqueName(base: string): Promise<string> {
  const names = new Set((await db.layouts.toArray()).map((l) => l.name));
  let name = base;
  for (let i = 2; names.has(name); i++) name = `${base} ${i}`;
  return name;
}

/** Neues Layout einer Art (Kopie des mitgelieferten). */
export async function createLayout(kind: ScreenKind, now = Date.now()): Promise<PresentationLayout> {
  const layout = copyLayout(builtInFor(kind), newId(), await uniqueName(kind === 'idle' ? 'Neuer Ruhebildschirm' : 'Neue Scan-Anzeige'), now);
  await db.layouts.add(layout);
  return layout;
}

/** Kopie eines vorhandenen Layouts. */
export async function duplicateLayout(sourceId: string, now = Date.now()): Promise<PresentationLayout> {
  const source = await getLayout(sourceId);
  if (!source) throw new ValidationError('Layout nicht gefunden.');
  if (source.builtIn) return createLayout(source.kind, now);
  const layout = copyLayout(source, newId(), await uniqueName(`${source.name} (Kopie)`), now);
  await db.layouts.add(layout);
  return layout;
}

export async function saveLayout(layout: PresentationLayout, now = Date.now()): Promise<void> {
  if (layout.builtIn || BUILT_IN_LAYOUTS.some((l) => l.id === layout.id)) {
    throw new ValidationError('Mitgelieferte Layouts können nicht geändert werden – bitte kopieren.');
  }
  const name = layout.name.trim();
  if (!name) throw new ValidationError('Bitte einen Namen für das Layout eingeben.');
  if (name.length > 40) throw new ValidationError('Der Name darf höchstens 40 Zeichen lang sein.');
  await db.layouts.put({ ...layout, name, updatedAt: now });
}

/** Layout löschen; wer es verwendet (Gruppen, Karten, Standard, Ruhebildschirm), fällt auf das mitgelieferte zurück. */
export async function deleteLayout(id: string): Promise<void> {
  if (BUILT_IN_LAYOUTS.some((l) => l.id === id)) throw new ValidationError('Mitgelieferte Layouts können nicht gelöscht werden.');
  await db.transaction('rw', [db.layouts, db.groups, db.cards], async () => {
    await db.layouts.delete(id);
    await db.groups.where('id').notEqual('').modify((g) => {
      if (g.presentationLayoutId === id) delete g.presentationLayoutId;
    });
    await db.cards.where('id').notEqual('').modify((c) => {
      if (c.presentationLayoutId === id) delete c.presentationLayoutId;
    });
  });
  const settings = await loadSettings();
  if (settings.defaultLayoutId === id) await saveSettings({ defaultLayoutId: STANDARD_LAYOUT_ID });
  if (settings.idleLayoutId === id) await saveSettings({ idleLayoutId: STANDARD_IDLE_ID });
}

/**
 * Layouts der App-Version 0.7 (feste Anordnung, Ruhebildschirm im selben Layout)
 * einmalig umwandeln. Das damalige Standardlayout liefert zusätzlich einen eigenen
 * Ruhebildschirm, damit dessen Texte und Hintergrund erhalten bleiben.
 */
export async function upgradeLegacyLayouts(now = Date.now()): Promise<number> {
  const legacy = (await db.layouts.toArray()).filter(isLegacyLayout);
  if (legacy.length === 0) return 0;
  const settings = await loadSettings();
  let idleId: string | undefined;
  await db.transaction('rw', db.layouts, async () => {
    for (const raw of legacy) {
      await db.layouts.put(normalizeLayout(raw));
      if (raw.id === settings.defaultLayoutId) {
        idleId = `${raw.id}-ruhe`;
        await db.layouts.put(idleFromLegacy(raw, idleId, now));
      }
    }
  });
  if (idleId) await saveSettings({ idleLayoutId: idleId });
  return legacy.length;
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
