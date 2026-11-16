/**
 * CSV-Import: plant für jede Zeile, was passiert (neue Karte, bestehende Karte
 * zuweisen oder – ohne bzw. mit unbekannter Gruppe – unter „Nicht zugeordnet“
 * ablegen), prüft Konflikte und führt den Import anschließend aus.
 */
import type { ImportRow } from '../domain/csvImport';
import { holderName } from '../domain/texts';
import type { Card, CardHolder, Group } from '../domain/types';
import { MAX_CARDS, createCards, listCards, updateCard } from './cards';
import { listGroups } from './groups';
import { MAX_UNASSIGNED, addUnassigned, listUnassigned } from './unassigned';

export type PlanAction =
  | { kind: 'create'; groupId: string; number: string }
  | { kind: 'assign'; cardId: string; groupId: string; number: string; replaces?: string }
  /** Ohne bzw. mit unbekannter Gruppe (`groupHint`) → „Nicht zugeordnet“, später einer Gruppe zuordnen. */
  | { kind: 'unassigned'; groupHint?: string }
  | { kind: 'error' };

export interface PlannedRow extends ImportRow {
  action: PlanAction;
  group?: Group;
}

/** Gleiche Person (Vorname, Nachname, Firma – ohne Groß-/Kleinschreibung). */
function personKey(h: CardHolder): string {
  return [h.firstName, h.lastName, h.company ?? ''].map((s) => s.trim().toLowerCase()).join('|');
}

function findGroup(groups: Group[], ref: string | undefined): Group | undefined {
  if (!ref) return undefined;
  const r = ref.trim().toLowerCase();
  return groups.find((g) => g.name.toLowerCase() === r) ?? groups.find((g) => g.prefix.toLowerCase() === r);
}

/** Plant den Import. `overwrite`: bestehende Personendaten auf Karten dürfen ersetzt werden. */
export async function planImport(rows: ImportRow[], overwrite: boolean): Promise<PlannedRow[]> {
  const [groups, cardList, waiting] = await Promise.all([listGroups(), listCards(), listUnassigned()]);
  // Wer schon unter „Nicht zugeordnet“ steht, wird nicht doppelt abgelegt (z. B. Datei zweimal eingelesen)
  const waitingKeys = new Set(waiting.flatMap((p) => (p.holder ? [personKey(p.holder)] : [])));
  let waitingTotal = waiting.length;
  const byNumber = new Map<string, Card>(cardList.map(({ card }) => [card.number.toLowerCase(), card]));
  const used = new Set(cardList.map(({ card }) => card.number.toLowerCase()));
  const seenInFile = new Set<string>();
  const nextCounter = new Map<string, number>();
  let total = cardList.length;

  const nextNumber = (g: Group): string => {
    if (!nextCounter.has(g.id)) {
      let max = 0;
      for (const n of used) {
        if (n.startsWith(`${g.prefix.toLowerCase()}-`)) {
          const v = Number.parseInt(n.slice(g.prefix.length + 1), 10);
          if (Number.isFinite(v) && v > max) max = v;
        }
      }
      nextCounter.set(g.id, max + 1);
    }
    let n = nextCounter.get(g.id)!;
    let candidate = `${g.prefix}-${String(n).padStart(3, '0')}`;
    while (used.has(candidate.toLowerCase())) candidate = `${g.prefix}-${String(++n).padStart(3, '0')}`;
    nextCounter.set(g.id, n + 1);
    return candidate;
  };

  return rows.map((row): PlannedRow => {
    const errors = [...row.errors];
    const error = (msg?: string): PlannedRow => ({ ...row, errors: msg ? [...errors, msg] : errors, action: { kind: 'error' } });
    if (errors.length) return error();
    const toUnassigned = (groupHint?: string): PlannedRow => {
      const key = personKey(row.holder);
      if (waitingKeys.has(key)) return error('Steht bereits unter „Nicht zugeordnet“.');
      if (waitingTotal >= MAX_UNASSIGNED) return error(`Höchstens ${MAX_UNASSIGNED} nicht zugeordnete Personen möglich.`);
      waitingKeys.add(key);
      waitingTotal++;
      return { ...row, action: { kind: 'unassigned', groupHint } };
    };

    const group = findGroup(groups, row.groupRef);
    // Unbekannte Gruppe (z. B. Tippfehler): Person trotzdem übernehmen – außer bei einer Kartennummer
    if (row.groupRef && !group && !row.cardNumber) return toUnassigned(row.groupRef);
    if (row.groupRef && !group) return error(`Gruppe „${row.groupRef}“ gibt es nicht.`);

    if (row.cardNumber) {
      const key = row.cardNumber.toLowerCase();
      if (seenInFile.has(key)) return error(`Kartennummer ${row.cardNumber} kommt in der Datei mehrfach vor.`);
      seenInFile.add(key);
      const existing = byNumber.get(key);
      if (existing) {
        const cardGroup = groups.find((g) => g.id === existing.groupId);
        if (group && group.id !== existing.groupId) {
          return error(`Karte ${existing.number} gehört zur Gruppe „${cardGroup?.name ?? '?'}“.`);
        }
        const current = existing.holder ? holderName(existing.holder) : existing.hasHolder ? 'einer Person' : undefined;
        if (current && !overwrite) {
          return error(`Karte ${existing.number} ist bereits ${current} zugeordnet („Überschreiben“ aktivieren).`);
        }
        return { ...row, group: cardGroup, action: { kind: 'assign', cardId: existing.id, groupId: existing.groupId, number: existing.number, replaces: current } };
      }
      if (!group) return error(`Karte ${row.cardNumber} gibt es nicht – für eine neue Karte bitte die Gruppe angeben.`);
      if (total >= MAX_CARDS) return error(`Höchstzahl von ${MAX_CARDS} Karten erreicht.`);
      total++;
      used.add(key);
      return { ...row, group, action: { kind: 'create', groupId: group.id, number: row.cardNumber } };
    }

    if (!group) return toUnassigned();
    if (total >= MAX_CARDS) return error(`Höchstzahl von ${MAX_CARDS} Karten erreicht.`);
    total++;
    return { ...row, group, action: { kind: 'create', groupId: group.id, number: nextNumber(group) } };
  });
}

export interface ImportResult {
  created: Card[];
  assigned: number;
  /** Unter „Nicht zugeordnet“ abgelegt. */
  unassigned: number;
}

/** Führt die gültigen Zeilen eines Plans aus (Daten müssen entsperrt sein). */
export async function executeImport(plan: PlannedRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: [], assigned: 0, unassigned: 0 };
  const existing = new Map((await listCards()).map(({ card }) => [card.id, card]));
  for (const row of plan) {
    const update = { accessGranted: row.accessGranted, validFrom: row.validFrom, validUntil: row.validUntil };
    if (row.action.kind === 'create') {
      const [card] = await createCards({ groupId: row.action.groupId, count: 1, number: row.action.number });
      if (!card) continue;
      result.created.push(await updateCard(card.id, { ...update, holder: row.holder }));
    } else if (row.action.kind === 'assign') {
      const before = existing.get(row.action.cardId)?.holder;
      // gleiche Person: Foto behalten, sonst komplett ersetzen
      const samePerson = before && holderName(before) === holderName(row.holder);
      const holder: CardHolder = samePerson ? { ...row.holder, photo: before.photo } : row.holder;
      await updateCard(row.action.cardId, { ...update, holder });
      result.assigned++;
    }
  }
  const waiting = plan.flatMap((row) =>
    row.action.kind === 'unassigned'
      ? [{ holder: row.holder, accessGranted: row.accessGranted, validFrom: row.validFrom, validUntil: row.validUntil, groupHint: row.action.groupHint }]
      : [],
  );
  result.unassigned = await addUnassigned(waiting);
  return result;
}
