import { beforeEach, describe, expect, it } from 'vitest';
import { parseImport } from '../domain/csvImport';
import { createVault } from '../security/crypto';
import { setDataKeyForTests } from '../security/session';
import { createCards, listCards, updateCard } from './cards';
import { clearAllData, db } from './db';
import { ensureDefaultGroups, listGroups } from './groups';
import { executeImport, planImport } from './importCards';
import { listUnassigned } from './unassigned';

const HEADER = 'Kartennummer;Gruppe;Vorname;Nachname;Firma/Abteilung;Notiz;Zutritt erlaubt;Gültig ab;Gültig bis';

beforeEach(async () => {
  await clearAllData(true);
  setDataKeyForTests((await createVault('testpasswort', 1000)).dataKey);
  await ensureDefaultGroups();
});

async function plan(lines: string[], overwrite = false) {
  return planImport(parseImport([HEADER, ...lines].join('\n')).rows, overwrite);
}

describe('CSV-Import planen und ausführen', () => {
  it('legt neue Karten mit fortlaufender Nummer an (Gruppe per Name oder Kürzel)', async () => {
    const [staff] = await listGroups();
    await createCards({ groupId: staff!.id, count: 2 }); // M-001, M-002 vorhanden
    const p = await plan([
      ';Bestandspersonal;Max;Mustermann;Technik;;ja;;',
      ';m;Erika;Musterfrau;;;nein;;31.12.2026',
      ';Besucher;Felix;Gast;Beispiel GmbH;;;15.11.2026;15.11.2026',
    ]);
    expect(p.map((r) => (r.action.kind === 'create' ? r.action.number : r.errors))).toEqual(['M-003', 'M-004', 'B-001']);

    const result = await executeImport(p);
    expect(result.created.map((c) => [c.number, c.holder?.lastName, c.accessGranted, c.validUntil])).toEqual([
      ['M-003', 'Mustermann', true, undefined],
      ['M-004', 'Musterfrau', false, '2026-12-31'],
      ['B-001', 'Gast', true, '2026-11-15'],
    ]);
    expect((await db.cards.toArray()).every((c) => c.holder === undefined)).toBe(true); // verschlüsselt
  });

  it('weist bestehende Karten zu und schützt vorhandene Personendaten', async () => {
    const [, visitors] = await listGroups();
    const [b1, b2] = await createCards({ groupId: visitors!.id, count: 2 });
    await updateCard(b2!.id, { accessGranted: true, holder: { firstName: 'Alt', lastName: 'Besucher' } });

    const p = await plan(['B-001;;Neu;Gast;;;ja;;', 'b-002;Besucher;Neu;Zwei;;;ja;;']);
    expect(p[0]?.action).toMatchObject({ kind: 'assign', cardId: b1!.id, number: 'B-001' });
    expect(p[1]?.action.kind).toBe('error');
    expect(p[1]?.errors[0]).toMatch(/bereits Alt Besucher zugeordnet/);

    const p2 = await plan(['B-002;;Neu;Zwei;;;ja;;'], true);
    expect(p2[0]?.action).toMatchObject({ kind: 'assign', replaces: 'Alt Besucher' });
    await executeImport(p2);
    const cards = (await listCards()).map((x) => x.card);
    expect(cards.find((c) => c.number === 'B-002')?.holder?.lastName).toBe('Zwei');
  });

  it('behält das Foto, wenn dieselbe Person aktualisiert wird', async () => {
    const [staff] = await listGroups();
    const [m1] = await createCards({ groupId: staff!.id, count: 1 });
    await updateCard(m1!.id, { accessGranted: true, holder: { firstName: 'Max', lastName: 'Mustermann', photo: 'data:image/jpeg;base64,AAAA' } });
    await executeImport(await plan(['M-001;;Max;Mustermann;Neue Abteilung;;ja;;'], true));
    const card = (await listCards())[0]!.card;
    expect(card.holder).toMatchObject({ company: 'Neue Abteilung', photo: 'data:image/jpeg;base64,AAAA' });
  });

  it('meldet unbekannte Gruppen bei Kartennummern, falsche Gruppen, Doppelte und neue Nummern ohne Gruppe', async () => {
    const [staff] = await listGroups();
    await createCards({ groupId: staff!.id, count: 1 }); // M-001
    const p = await plan([
      'M-001;Hausmeister;A;B;;;ja;;',
      'M-001;Besucher;A;B;;;ja;;',
      'X-9;;A;B;;;ja;;',
      'NEU-1;Besucher;A;B;;;ja;;',
      'NEU-1;Besucher;C;D;;;ja;;',
    ]);
    expect(p.map((r) => r.errors[0] ?? (r.action.kind === 'create' ? r.action.number : ''))).toEqual([
      'Gruppe „Hausmeister“ gibt es nicht.',
      'Karte M-001 gehört zur Gruppe „Bestandspersonal“.',
      'Karte X-9 gibt es nicht – für eine neue Karte bitte die Gruppe angeben.',
      'NEU-1',
      'Kartennummer NEU-1 kommt in der Datei mehrfach vor.',
    ]);
    const result = await executeImport(p);
    expect(result.created.map((c) => c.number)).toEqual(['NEU-1']); // nur gültige Zeilen
  });

  it('legt Personen ohne oder mit unbekannter Gruppe unter „Nicht zugeordnet“ ab', async () => {
    const p = await plan([
      ';;Nina;Ohnegruppe;Beispiel AG;Notiz;nein;;31.12.2026',
      ';Besuchr;Tim;Tippfehler;;;ja;;',
      ';Besucher;Felix;Gast;;;ja;;',
      ';;nina;ohnegruppe;beispiel ag;;ja;;',
    ]);
    expect(p.map((r) => r.action)).toEqual([
      { kind: 'unassigned', groupHint: undefined },
      { kind: 'unassigned', groupHint: 'Besuchr' },
      expect.objectContaining({ kind: 'create', number: 'B-001' }),
      { kind: 'error' },
    ]);
    expect(p[3]?.errors).toEqual(['Steht bereits unter „Nicht zugeordnet“.']);

    const result = await executeImport(p);
    expect(result).toMatchObject({ assigned: 0, unassigned: 2 });
    expect(result.created).toHaveLength(1);
    const waiting = await listUnassigned();
    expect(waiting.map((w) => [w.holder?.lastName, w.holder?.company, w.accessGranted, w.validUntil, w.groupHint])).toEqual([
      ['Ohnegruppe', 'Beispiel AG', false, '2026-12-31', undefined],
      ['Tippfehler', undefined, true, undefined, 'Besuchr'],
    ]);
    expect((await db.unassigned.toArray()).every((r) => r.holderEnc && !('holder' in r))).toBe(true); // verschlüsselt

    // Datei erneut eingelesen: keine Doppelten
    const again = await plan([';;Nina;Ohnegruppe;Beispiel AG;;ja;;']);
    expect(again[0]?.errors).toEqual(['Steht bereits unter „Nicht zugeordnet“.']);
  });
});
