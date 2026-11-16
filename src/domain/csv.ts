/**
 * CSV-Export für Excel (deutsche Einstellungen):
 * Semikolon als Trennzeichen, UTF-8 mit BOM (damit Umlaute stimmen), CRLF.
 * Schutz vor Formel-Injektion: Zellen, die mit = + - @ beginnen, werden mit
 * einem Apostroph entschärft, damit Excel sie nicht als Formel ausführt.
 */
import { formatIsoDate, toLocalDateString } from './dates';
import type { StatusRow } from './overview';
import { directionText, reasonText } from './texts';
import type { AccessEvent } from './types';

const BOM = '﻿';

export function csvCell(value: string | number | undefined | null): string {
  let s = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

const pad = (n: number) => String(n).padStart(2, '0');
const date = (ts: number) => formatIsoDate(toLocalDateString(new Date(ts)));
const time = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const SOURCE: Record<AccessEvent['source'], string> = { camera: 'Kamera', scanner: 'Scanner', test: 'Test', system: 'automatisch', manual: 'manuell' };

export function eventsToCsv(events: AccessEvent[]): string {
  return toCsv([
    ['Datum', 'Uhrzeit', 'Karte', 'Name', 'Gruppe', 'Richtung', 'Ergebnis', 'Grund', 'Quelle', 'Bestätigt von'],
    ...events.map((e) => [
      date(e.timestamp),
      time(e.timestamp),
      e.cardNumber ?? '',
      e.holderName ?? (e.holderLocked ? '(gesperrt)' : ''),
      e.groupName ?? '',
      e.direction ? directionText(e.direction) : '',
      e.reason === 'CORRECTION' ? 'Korrektur' : e.outcome === 'granted' ? (e.correctedBy ? 'rückgängig gemacht' : 'erfasst') : 'abgewiesen',
      e.outcome === 'granted' ? '' : reasonText(e.reason),
      SOURCE[e.source],
      e.confirmedBy === 'admin' ? 'Admin' : e.confirmedBy === 'operator' ? 'Bediener' : '',
    ]),
  ]);
}

export function statusToCsv(rows: StatusRow[]): string {
  return toCsv([
    ['Karte', 'Gruppe', 'Nachname', 'Vorname', 'Firma/Abteilung', 'Status', 'Seit/zuletzt', 'Zutritt erlaubt', 'Gesperrt', 'Gültig ab', 'Gültig bis', 'Verloren gemeldet'],
    ...rows.map(({ card, group, present, lastBookingAt }) => [
      card.number,
      group?.name ?? '',
      card.holder?.lastName ?? '',
      card.holder?.firstName ?? '',
      card.holder?.company ?? '',
      present ? 'anwesend' : 'abwesend',
      lastBookingAt ? `${date(lastBookingAt)} ${time(lastBookingAt)}` : '',
      card.accessGranted ? 'ja' : 'nein',
      card.blocked ? 'ja' : 'nein',
      formatIsoDate(card.validFrom),
      formatIsoDate(card.validUntil),
      card.lostAt ? date(card.lostAt) : '',
    ]),
  ]);
}

/** Dateiname mit Datum, z. B. „zutritt-protokoll-2026-11-15.csv“. */
export function csvFilename(kind: string, now = new Date()): string {
  return `zutritt-${kind}-${toLocalDateString(now)}.csv`;
}
