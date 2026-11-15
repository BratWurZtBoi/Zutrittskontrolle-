import { isHexColor } from '../domain/color';
import type { Group, GroupInput } from '../domain/types';
import { ValidationError, db, newId } from './db';

export const DEFAULT_GROUPS: GroupInput[] = [
  { name: 'Bestandspersonal', color: '#2563eb', prefix: 'M', accessGranted: true, allowUnassigned: false, printHolder: true },
  { name: 'Besucher', color: '#ea580c', prefix: 'B', accessGranted: true, allowUnassigned: false, printHolder: false },
];

const PREFIX_PATTERN = /^[A-Z0-9]{1,4}$/;

function normalize(input: GroupInput): GroupInput {
  return { ...input, name: input.name.trim(), prefix: input.prefix.trim().toUpperCase(), color: input.color.toLowerCase() };
}

async function validate(input: GroupInput, ownId?: string): Promise<void> {
  if (!input.name) throw new ValidationError('Bitte einen Gruppennamen eingeben.');
  if (input.name.length > 40) throw new ValidationError('Der Gruppenname darf höchstens 40 Zeichen lang sein.');
  if (!PREFIX_PATTERN.test(input.prefix)) {
    throw new ValidationError('Das Kürzel muss aus 1–4 Buchstaben oder Ziffern bestehen.');
  }
  if (!isHexColor(input.color)) throw new ValidationError('Bitte eine gültige Farbe wählen.');
  const all = await db.groups.toArray();
  const others = all.filter((g) => g.id !== ownId);
  if (others.some((g) => g.name.toLowerCase() === input.name.toLowerCase())) {
    throw new ValidationError(`Die Gruppe „${input.name}“ gibt es bereits.`);
  }
  if (others.some((g) => g.prefix === input.prefix)) {
    throw new ValidationError(`Das Kürzel „${input.prefix}“ wird bereits von einer anderen Gruppe verwendet.`);
  }
}

export function listGroups(): Promise<Group[]> {
  return db.groups.orderBy('sortOrder').toArray();
}

export async function createGroup(raw: GroupInput, now = Date.now()): Promise<Group> {
  const input = normalize(raw);
  return db.transaction('rw', db.groups, async () => {
    await validate(input);
    const last = await db.groups.orderBy('sortOrder').last();
    const group: Group = { ...input, id: newId(), sortOrder: (last?.sortOrder ?? 0) + 1, createdAt: now, updatedAt: now };
    await db.groups.add(group);
    return group;
  });
}

/** Das Kürzel ist nach dem Anlegen fest, weil es in den Kartennummern steckt. */
export async function updateGroup(id: string, raw: Omit<GroupInput, 'prefix'>, now = Date.now()): Promise<Group> {
  return db.transaction('rw', db.groups, async () => {
    const current = await db.groups.get(id);
    if (!current) throw new ValidationError('Gruppe nicht gefunden.');
    const input = normalize({ ...raw, prefix: current.prefix });
    await validate(input, id);
    const updated: Group = { ...current, ...input, updatedAt: now };
    await db.groups.put(updated);
    return updated;
  });
}

export async function deleteGroup(id: string): Promise<void> {
  await db.transaction('rw', [db.groups, db.cards], async () => {
    const count = await db.cards.where('groupId').equals(id).count();
    if (count > 0) {
      throw new ValidationError(`Die Gruppe enthält noch ${count} Karte(n). Bitte zuerst die Karten löschen.`);
    }
    await db.groups.delete(id);
  });
}

/** Legt die Standardgruppen an, falls noch keine Gruppe existiert. */
export async function ensureDefaultGroups(): Promise<void> {
  await db.transaction('rw', db.groups, async () => {
    if ((await db.groups.count()) > 0) return;
    for (const g of DEFAULT_GROUPS) await createGroup(g);
  });
}
