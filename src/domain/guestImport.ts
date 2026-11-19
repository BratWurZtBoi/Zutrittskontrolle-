/**
 * Gästeliste per CSV (z. B. aus Excel): Anrede, Dienstgrad, Vorname, Nachname, Einheit/Firma,
 * Kategorie, E-Mail, Notiz, Begleitpersonen (Anzahl) und deren Namen (durch Komma getrennt).
 * Gleicher Parser wie beim Karten-Import (Trennzeichen, Windows-1252).
 */
import { toCsv } from './csv';
import { parseCsv } from './csvImport';
import { GUEST_STATUS_LABEL, MAX_COMPANIONS, guestStatus, normalizeCompanionNames, type Guest, type GuestPerson } from './occasion';
import { formatDateTime } from './dates';

export const GUEST_TEMPLATE_HEADER = ['Anrede', 'Dienstgrad', 'Vorname', 'Nachname', 'Einheit/Firma', 'Kategorie', 'E-Mail', 'Notiz', 'Begleitpersonen', 'Namen der Begleitpersonen'];

/** Vorlage mit fiktiven Beispielzeilen. */
export function guestTemplateCsv(): string {
  return toCsv([
    GUEST_TEMPLATE_HEADER,
    ['Herr', 'Oberst', 'Max', 'Mustermann', 'Musterkommando', 'VIP', 'max.mustermann@example.com', '', '1', 'Anna Mustermann'],
    ['Frau', '', 'Erika', 'Musterfrau', 'Beispiel GmbH', 'Gast', 'erika.musterfrau@example.com', 'Vegetarisch', '0', ''],
  ]);
}

type Column = 'salutation' | 'rank' | 'firstName' | 'lastName' | 'company' | 'category' | 'email' | 'note' | 'companions' | 'companionNames';

const ALIASES: Record<Column, string[]> = {
  salutation: ['anrede'],
  rank: ['dienstgrad', 'dgr', 'rang', 'titel'],
  firstName: ['vorname'],
  lastName: ['nachname', 'name', 'familienname'],
  company: ['einheit/firma', 'einheit', 'firma', 'einheit/abteilung', 'firma/abteilung', 'abteilung', 'dienststelle', 'organisation'],
  category: ['kategorie', 'gruppe', 'gästegruppe'],
  email: ['e-mail', 'email', 'mail', 'e-mail-adresse'],
  note: ['notiz', 'bemerkung', 'hinweis', 'kommentar'],
  companions: ['begleitpersonen', 'begleitung', 'anzahl begleitpersonen', 'anzahl begleitung', 'begleiter'],
  companionNames: ['namen der begleitpersonen', 'namen begleitpersonen', 'namen begleitung', 'begleitung namen', 'begleitpersonen namen'],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export interface GuestImportRow {
  line: number;
  person: GuestPerson;
  category?: string;
  companions: number;
  errors: string[];
}

export function parseGuestImport(text: string): { rows: GuestImportRow[]; fileErrors: string[] } {
  const table = parseCsv(text.replace(/^﻿/, ''));
  if (table.length === 0) return { rows: [], fileErrors: ['Die Datei ist leer.'] };
  const map: Partial<Record<Column, number>> = {};
  table[0]!.forEach((h, i) => {
    for (const [col, aliases] of Object.entries(ALIASES) as [Column, string[]][]) {
      if (map[col] === undefined && aliases.includes(norm(h))) map[col] = i;
    }
  });
  if (map.firstName === undefined && map.lastName === undefined) {
    return { rows: [], fileErrors: ['Spalte „Vorname“ oder „Nachname“ fehlt – bitte die Vorlage verwenden.'] };
  }
  const cell = (r: string[], c: Column) => {
    const v = map[c] === undefined ? '' : (r[map[c]!] ?? '').trim();
    return v.startsWith("'") && /^'[=+\-@]/.test(v) ? v.slice(1) : v; // Formel-Schutz aus eigenen Exporten
  };
  const rows = table.slice(1).map((r, i): GuestImportRow => {
    const person: GuestPerson = {
      salutation: cell(r, 'salutation') || undefined,
      rank: cell(r, 'rank') || undefined,
      firstName: cell(r, 'firstName'),
      lastName: cell(r, 'lastName'),
      company: cell(r, 'company') || undefined,
      email: cell(r, 'email') || undefined,
      note: cell(r, 'note') || undefined,
      companionNames: normalizeCompanionNames(cell(r, 'companionNames').split(/[,\n]/)),
    };
    const errors: string[] = [];
    if (!person.firstName && !person.lastName) errors.push('Vor- oder Nachname fehlt.');
    if (person.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) errors.push(`E-Mail „${person.email}“ ist ungültig.`);
    const rawCompanions = cell(r, 'companions');
    let companions = 0;
    if (rawCompanions) {
      if (!/^\d+$/.test(rawCompanions) || Number(rawCompanions) > MAX_COMPANIONS) errors.push(`Begleitpersonen „${rawCompanions}“: bitte eine Zahl von 0 bis ${MAX_COMPANIONS}.`);
      else companions = Number(rawCompanions);
    }
    // Namen ohne Anzahl: so viele Begleitpersonen wie Namen
    if (!rawCompanions && person.companionNames) companions = Math.min(MAX_COMPANIONS, person.companionNames.length);
    return { line: i + 2, person, category: cell(r, 'category') || undefined, companions, errors };
  });
  return { rows, fileErrors: [] };
}

/** Teilnehmerliste als CSV (für Excel). */
export function guestsToCsv(guests: Guest[]): string {
  return toCsv([
    ['Nr.', 'Anrede', 'Dienstgrad', 'Nachname', 'Vorname', 'Einheit/Firma', 'Kategorie', 'E-Mail', 'Status', 'Eingelassen um', 'Notiz', 'Begleitpersonen', 'davon eingelassen', 'Namen der Begleitpersonen'],
    ...guests.map((g) => [
      g.number,
      g.person?.salutation ?? '',
      g.person?.rank ?? '',
      g.person?.lastName ?? '',
      g.person?.firstName ?? '',
      g.person?.company ?? '',
      g.category ?? '',
      g.person?.email ?? '',
      GUEST_STATUS_LABEL[guestStatus(g)],
      g.admittedAt ? formatDateTime(g.admittedAt) : '',
      g.person?.note ?? '',
      g.companions ?? 0,
      g.admittedAt !== undefined ? (g.companionsAdmitted ?? 0) : '',
      (g.person?.companionNames ?? []).join(', '),
    ]),
  ]);
}
