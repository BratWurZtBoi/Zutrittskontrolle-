import { describe, expect, it } from 'vitest';
import { guestTemplateCsv, guestsToCsv, parseGuestImport } from './guestImport';

describe('Gästeliste per CSV', () => {
  it('liest die eigene Vorlage fehlerfrei', () => {
    const { rows, fileErrors } = parseGuestImport(guestTemplateCsv());
    expect(fileErrors).toEqual([]);
    expect(rows.map((r) => [r.line, r.person.rank, r.person.lastName, r.category, r.companions, r.person.companionNames, r.errors])).toEqual([
      [2, 'Oberst', 'Mustermann', 'VIP', 1, ['Anna Mustermann'], []],
      [3, undefined, 'Musterfrau', 'Gast', 0, undefined, []],
    ]);
  });

  it('abweichende Spaltennamen, Fehler je Zeile, fehlende Pflichtspalte', () => {
    const { rows } = parseGuestImport('Name;Vorname;Firma;Mail\nGast;Felix;Musterzeitung;kaputt\n;;;');
    expect(rows[0]).toMatchObject({ person: { firstName: 'Felix', lastName: 'Gast', company: 'Musterzeitung' }, errors: ['E-Mail „kaputt“ ist ungültig.'] });
    expect(parseGuestImport('Anrede;Firma\nHerr;X').fileErrors[0]).toContain('Vorname');
  });

  it('Begleitpersonen: Anzahl 0–9, Namen durch Komma, Namen ohne Anzahl zählen', () => {
    const { rows } = parseGuestImport('Nachname;Begleitung;Namen Begleitung\nA;2;Tim Test, Ina Test\nB;zwei;\nC;10;\nD;;Ole Probe');
    expect(rows.map((r) => [r.companions, r.person.companionNames, r.errors.length])).toEqual([
      [2, ['Tim Test', 'Ina Test'], 0],
      [0, undefined, 1],
      [0, undefined, 1],
      [1, ['Ole Probe'], 0],
    ]);
  });

  it('Teilnehmerliste mit Status und Uhrzeit', () => {
    const csv = guestsToCsv([
      { id: 'a', occasionId: 'o', number: 1, token: 't', hasPerson: true, createdAt: 0, updatedAt: 0, admittedAt: new Date(2026, 11, 12, 18, 5).getTime(), companions: 2, companionsAdmitted: 1, person: { firstName: 'Max', lastName: 'Mustermann', companionNames: ['Anna Mustermann', 'Tim Mustermann'] } },
      { id: 'b', occasionId: 'o', number: 2, token: 'u', hasPerson: false, createdAt: 0, updatedAt: 0, cancelled: true },
    ]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toBe('1;;;Mustermann;Max;;;;eingelassen;12.12.2026 18:05;;2;1;Anna Mustermann, Tim Mustermann');
    expect(lines[2]).toContain(';storniert;');
  });
});
