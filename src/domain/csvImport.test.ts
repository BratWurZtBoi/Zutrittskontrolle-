import { describe, expect, it } from 'vitest';
import { decodeCsvBytes, importTemplateCsv, mapColumns, parseBoolCell, parseCsv, parseDateCell, parseImport } from './csvImport';

describe('CSV-Parser', () => {
  it('erkennt Semikolon, Komma und Tabulator', () => {
    expect(parseCsv('a;b\r\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('versteht Anführungszeichen, Trennzeichen und Umbrüche in Feldern', () => {
    expect(parseCsv('a;b\n"x;y";"Sag ""Hallo"""\n"Zeile1\nZeile2";z')).toEqual([
      ['a', 'b'],
      ['x;y', 'Sag "Hallo"'],
      ['Zeile1\nZeile2', 'z'],
    ]);
  });

  it('überspringt leere Zeilen', () => {
    expect(parseCsv('a;b\n\n1;2\n;\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('liest UTF-8 mit BOM und Windows-1252 (Excel)', () => {
    const utf8 = new TextEncoder().encode('﻿Grüße');
    expect(decodeCsvBytes(utf8)).toBe('Grüße');
    const win1252 = new Uint8Array([0x47, 0x72, 0xfc, 0xdf, 0x65]); // „Grüße“ in Windows-1252
    expect(decodeCsvBytes(win1252)).toBe('Grüße');
  });
});

describe('Spalten und Werte', () => {
  it('ordnet Spalten auch mit abweichenden Namen zu', () => {
    expect(mapColumns(['Karte', 'Gruppe', 'Vorname', 'Name', 'Firma', 'Bemerkung', 'Zutritt', 'von', 'bis'])).toEqual({
      number: 0, group: 1, firstName: 2, lastName: 3, company: 4, note: 5, access: 6, validFrom: 7, validUntil: 8,
    });
  });

  it('liest Datum und ja/nein', () => {
    expect(parseDateCell('15.11.2026')).toBe('2026-11-15');
    expect(parseDateCell('5.1.2026')).toBe('2026-01-05');
    expect(parseDateCell('2026-11-15')).toBe('2026-11-15');
    expect(parseDateCell('')).toBeUndefined();
    expect(parseDateCell('31.02.2026')).toBeNull();
    expect(parseBoolCell('Ja')).toBe(true);
    expect(parseBoolCell('')).toBe(true);
    expect(parseBoolCell('nein')).toBe(false);
    expect(parseBoolCell('vielleicht')).toBeNull();
  });
});

describe('parseImport', () => {
  it('liest die eigene Vorlage fehlerfrei', () => {
    const { rows, fileErrors } = parseImport(importTemplateCsv().replace(/^﻿/, ''));
    expect(fileErrors).toEqual([]);
    expect(rows.map((r) => [r.line, r.groupRef, r.holder.lastName, r.validUntil, r.errors])).toEqual([
      [2, 'Bestandspersonal', 'Mustermann', undefined, []],
      [3, 'Besucher', 'Musterfrau', '2026-11-15', []],
    ]);
  });

  it('meldet Fehler je Zeile', () => {
    const csv = 'Gruppe;Vorname;Nachname;Zutritt erlaubt;Gültig ab;Gültig bis\nBesucher;;;vielleicht;32.01.2026;01.01.2026\n;Max;Muster;ja;;';
    const { rows } = parseImport(csv);
    expect(rows[0]?.errors).toEqual([
      'Vor- oder Nachname fehlt.',
      '„Zutritt erlaubt“ muss ja oder nein sein.',
      '„Gültig ab“ ist kein gültiges Datum (TT.MM.JJJJ).',
    ]);
    expect(rows[1]?.errors).toEqual(['Gruppe fehlt.']);
  });

  it('erkennt fehlende Pflichtspalten', () => {
    expect(parseImport('Spalte A;Spalte B\n1;2').fileErrors.length).toBe(2);
    expect(parseImport('').fileErrors).toEqual(['Die Datei ist leer.']);
  });

  it('entfernt den Formel-Schutz-Apostroph aus eigenen Exporten', () => {
    const { rows } = parseImport("Gruppe;Vorname;Nachname;Notiz\nBesucher;Max;Muster;'=Hinweis");
    expect(rows[0]?.holder.note).toBe('=Hinweis');
  });
});
