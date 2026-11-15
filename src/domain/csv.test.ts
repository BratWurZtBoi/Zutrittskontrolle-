import { describe, expect, it } from 'vitest';
import { csvCell, eventsToCsv, statusToCsv, toCsv } from './csv';
import type { StatusRow } from './overview';
import type { AccessEvent } from './types';

describe('CSV', () => {
  it('maskiert Trennzeichen, Anführungszeichen und Zeilenumbrüche', () => {
    expect(csvCell('einfach')).toBe('einfach');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('Sag "Hallo"')).toBe('"Sag ""Hallo"""');
    expect(csvCell('Zeile1\nZeile2')).toBe('"Zeile1\nZeile2"');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('entschärft Formeln (Schutz vor CSV-Injektion)', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+49 123')).toBe("'+49 123");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUMME(A1)')).toBe("'@SUMME(A1)");
  });

  it('erzeugt Excel-taugliche Dateien (BOM, Semikolon, CRLF)', () => {
    const csv = toCsv([
      ['A', 'B'],
      ['ä', 'ö'],
    ]);
    expect(csv).toBe('﻿A;B\r\nä;ö\r\n');
  });

  it('exportiert Aktionen', () => {
    const e: AccessEvent = {
      timestamp: new Date(2026, 5, 15, 8, 5, 9).getTime(),
      outcome: 'denied',
      reason: 'CARD_BLOCKED',
      direction: 'in',
      cardNumber: 'M-006',
      holderName: 'Paul Platzhalter',
      groupName: 'Bestandspersonal',
      source: 'camera',
    };
    const lines = eventsToCsv([e]).slice(1).split('\r\n');
    expect(lines[0]).toBe('Datum;Uhrzeit;Karte;Name;Gruppe;Richtung;Ergebnis;Grund;Quelle;Bestätigt von');
    expect(lines[1]).toBe('15.06.2026;08:05:09;M-006;Paul Platzhalter;Bestandspersonal;Eingang;abgewiesen;Diese Karte ist gesperrt.;Kamera;');
    const confirmed = eventsToCsv([{ ...e, outcome: 'granted', reason: 'OK', confirmedBy: 'operator' }]).slice(1).split('\r\n');
    expect(confirmed[1]?.endsWith(';erfasst;;Kamera;Bediener')).toBe(true);
  });

  it('exportiert den Anwesenheitsstatus', () => {
    const row: StatusRow = {
      card: {
        id: 'a', number: 'M-001', groupId: 'g', token: 't', tokenIssuedAt: 0, blocked: false, accessGranted: true,
        validUntil: '2026-12-31', createdAt: 0, updatedAt: 0, hasHolder: true,
        holder: { firstName: 'Max', lastName: 'Mustermann', company: 'Technik' },
      },
      group: { name: 'Bestandspersonal' } as StatusRow['group'],
      present: true,
      lastBookingAt: new Date(2026, 5, 15, 7, 30, 0).getTime(),
    };
    const lines = statusToCsv([row]).slice(1).split('\r\n');
    expect(lines[1]).toBe('M-001;Bestandspersonal;Mustermann;Max;Technik;anwesend;15.06.2026 07:30:00;ja;nein;;31.12.2026;');
  });
});
