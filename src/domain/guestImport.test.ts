import { describe, expect, it } from 'vitest';
import { guestTemplateCsv, guestsToCsv, parseGuestImport } from './guestImport';

describe('Gästeliste per CSV', () => {
  it('liest die eigene Vorlage fehlerfrei', () => {
    const { rows, fileErrors } = parseGuestImport(guestTemplateCsv());
    expect(fileErrors).toEqual([]);
    expect(rows.map((r) => [r.line, r.person.rank, r.person.lastName, r.category, r.errors])).toEqual([
      [2, 'Oberst', 'Mustermann', 'VIP', []],
      [3, undefined, 'Musterfrau', 'Gast', []],
    ]);
  });

  it('abweichende Spaltennamen, Fehler je Zeile, fehlende Pflichtspalte', () => {
    const { rows } = parseGuestImport('Name;Vorname;Firma;Mail\nGast;Felix;Musterzeitung;kaputt\n;;;');
    expect(rows[0]).toMatchObject({ person: { firstName: 'Felix', lastName: 'Gast', company: 'Musterzeitung' }, errors: ['E-Mail „kaputt“ ist ungültig.'] });
    expect(parseGuestImport('Anrede;Firma\nHerr;X').fileErrors[0]).toContain('Vorname');
  });

  it('Teilnehmerliste mit Status und Uhrzeit', () => {
    const csv = guestsToCsv([
      { id: 'a', occasionId: 'o', number: 1, token: 't', hasPerson: true, createdAt: 0, updatedAt: 0, admittedAt: new Date(2026, 11, 12, 18, 5).getTime(), person: { firstName: 'Max', lastName: 'Mustermann' } },
      { id: 'b', occasionId: 'o', number: 2, token: 'u', hasPerson: false, createdAt: 0, updatedAt: 0, cancelled: true },
    ]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toBe('1;;;Mustermann;Max;;;;eingelassen;12.12.2026 18:05;');
    expect(lines[2]).toContain(';storniert;');
  });
});
