/**
 * CSV-Import von Personenlisten (z. B. aus Excel).
 * Erkennt Trennzeichen (; , Tab), Anführungszeichen, Zeilenumbrüche in Feldern,
 * UTF-8 (mit/ohne BOM) und Windows-1252 (Excel „CSV (Trennzeichen-getrennt)“).
 */
import { isValidIsoDate } from './dates';
import { toCsv } from './csv';
import type { CardHolder } from './types';

export const TEMPLATE_HEADER = [
  'Kartennummer',
  'Gruppe',
  'Vorname',
  'Nachname',
  'Firma/Abteilung',
  'Notiz',
  'Zutritt erlaubt',
  'Gültig ab',
  'Gültig bis',
];

/** Vorlage mit fiktiven Beispielzeilen. */
export function importTemplateCsv(): string {
  return toCsv([
    TEMPLATE_HEADER,
    ['', 'Bestandspersonal', 'Max', 'Mustermann', 'Verwaltung', '', 'ja', '', ''],
    ['', 'Besucher', 'Erika', 'Musterfrau', 'Beispiel GmbH', 'Termin bei Max Mustermann', 'ja', '15.11.2026', '15.11.2026'],
  ]);
}

/** Bytes → Text: UTF-8, sonst Windows-1252 (ältere Excel-Exporte). BOM wird entfernt. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^﻿/, '');
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [';', ',', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0] && counts[0].n > 0 ? counts[0].d : ';';
}

/** Zerlegt CSV-Text in Zeilen und Felder (RFC 4180, Trennzeichen automatisch). */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // leere Zeilen entfernen
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

type Column = 'number' | 'group' | 'firstName' | 'lastName' | 'company' | 'note' | 'access' | 'validFrom' | 'validUntil';

const ALIASES: Record<Column, string[]> = {
  number: ['kartennummer', 'karte', 'kartennr', 'nummer', 'nr', 'karten-nr'],
  group: ['gruppe', 'kartengruppe'],
  firstName: ['vorname'],
  lastName: ['nachname', 'name', 'familienname'],
  company: ['firma/abteilung', 'firma', 'abteilung', 'unternehmen', 'funktion'],
  note: ['notiz', 'bemerkung', 'hinweis', 'kommentar'],
  access: ['zutritt erlaubt', 'zutritt', 'berechtigt'],
  validFrom: ['gültig ab', 'gueltig ab', 'gültig von', 'von', 'ab'],
  validUntil: ['gültig bis', 'gueltig bis', 'bis'],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function mapColumns(header: string[]): Partial<Record<Column, number>> {
  const map: Partial<Record<Column, number>> = {};
  header.forEach((h, i) => {
    const key = norm(h);
    for (const [col, aliases] of Object.entries(ALIASES) as [Column, string[]][]) {
      if (map[col] === undefined && aliases.includes(key)) map[col] = i;
    }
  });
  return map;
}

/** „15.11.2026“, „5.1.2026“ oder „2026-11-15“ → „2026-11-15“; leer → undefined; ungültig → null. */
export function parseDateCell(value: string): string | undefined | null {
  const v = value.trim();
  if (!v) return undefined;
  let iso = v;
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (de) iso = `${de[3]}-${de[2]!.padStart(2, '0')}-${de[1]!.padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** ja/nein, 1/0, x, true/false; leer → ja. Ungültig → null. */
export function parseBoolCell(value: string): boolean | null {
  const v = norm(value);
  if (['', 'ja', 'j', 'yes', 'y', '1', 'x', 'true', 'wahr'].includes(v)) return true;
  if (['nein', 'n', 'no', '0', 'false', 'falsch', '-'].includes(v)) return false;
  return null;
}

/** Entfernt den Schutz-Apostroph, den der eigene CSV-Export vor Formeln setzt. */
function clean(value: string | undefined): string {
  const v = (value ?? '').trim();
  return /^'[=+\-@]/.test(v) ? v.slice(1) : v;
}

export interface ImportRow {
  /** Zeilennummer in der Datei (1 = Kopfzeile). */
  line: number;
  cardNumber?: string;
  groupRef?: string;
  holder: CardHolder;
  accessGranted: boolean;
  validFrom?: string;
  validUntil?: string;
  errors: string[];
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Fehler, die die ganze Datei betreffen (z. B. fehlende Spalten). */
  fileErrors: string[];
}

export function parseImport(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], fileErrors: ['Die Datei ist leer.'] };
  const map = mapColumns(table[0]!);
  const fileErrors: string[] = [];
  if (map.firstName === undefined && map.lastName === undefined) {
    fileErrors.push('Spalte „Vorname“ oder „Nachname“ fehlt. Bitte die Vorlage verwenden.');
  }
  // Ohne Spalte „Gruppe“ landen alle Personen unter „Nicht zugeordnet“ (Liste nur mit Namen)
  if (table.length === 1) fileErrors.push('Die Datei enthält nur die Kopfzeile.');
  if (fileErrors.length) return { rows: [], fileErrors };

  const cell = (r: string[], col: Column) => (map[col] === undefined ? '' : clean(r[map[col]!]));
  const rows = table.slice(1).map((r, i): ImportRow => {
    const errors: string[] = [];
    const firstName = cell(r, 'firstName');
    const lastName = cell(r, 'lastName');
    if (!firstName && !lastName) errors.push('Vor- oder Nachname fehlt.');
    const access = parseBoolCell(cell(r, 'access'));
    if (access === null) errors.push('„Zutritt erlaubt“ muss ja oder nein sein.');
    const validFrom = parseDateCell(cell(r, 'validFrom'));
    const validUntil = parseDateCell(cell(r, 'validUntil'));
    if (validFrom === null) errors.push('„Gültig ab“ ist kein gültiges Datum (TT.MM.JJJJ).');
    if (validUntil === null) errors.push('„Gültig bis“ ist kein gültiges Datum (TT.MM.JJJJ).');
    if (validFrom && validUntil && validFrom > validUntil) errors.push('„Gültig bis“ liegt vor „Gültig ab“.');
    const cardNumber = cell(r, 'number') || undefined;
    const groupRef = cell(r, 'group') || undefined;
    if (cardNumber && cardNumber.length > 20) errors.push('Kartennummer ist zu lang (max. 20 Zeichen).');
    return {
      line: i + 2,
      cardNumber,
      groupRef,
      holder: {
        firstName,
        lastName,
        company: cell(r, 'company') || undefined,
        note: cell(r, 'note') || undefined,
      },
      accessGranted: access ?? true,
      validFrom: validFrom ?? undefined,
      validUntil: validUntil ?? undefined,
      errors,
    };
  });
  return { rows, fileErrors };
}
