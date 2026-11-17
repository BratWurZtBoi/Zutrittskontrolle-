import { describe, expect, it } from 'vitest';
import { clampCopies, directPrintDone, emergencyPrintPlan, printErrorText } from './emergencyPrint';

const settings = { emergencyDirectPrint: true, emergencyPrinter: 'Büro-Laser', emergencyCopies: 2 };

describe('Notfallliste drucken', () => {
  it('im Browser immer mit Druckdialog', () => {
    expect(emergencyPrintPlan(settings, false)).toEqual({ mode: 'dialog' });
  });

  it('im Programm nur ohne Dialog, wenn eingeschaltet', () => {
    expect(emergencyPrintPlan({ ...settings, emergencyDirectPrint: false }, true)).toEqual({ mode: 'dialog' });
    expect(emergencyPrintPlan(settings, true)).toEqual({ mode: 'direct', printer: 'Büro-Laser', copies: 2 });
    expect(emergencyPrintPlan({ ...settings, emergencyPrinter: '' }, true)).toMatchObject({ printer: '' }); // Standarddrucker
  });

  it('begrenzt die Anzahl der Ausdrucke', () => {
    expect(clampCopies(0)).toBe(1);
    expect(clampCopies(2.4)).toBe(2);
    expect(clampCopies(99)).toBe(5);
    expect(clampCopies(Number.NaN)).toBe(1);
  });

  it('meldet, wohin gedruckt wurde', () => {
    expect(directPrintDone('Büro-Laser', 1)).toBe('Notfallliste an „Büro-Laser“ gesendet.');
    expect(directPrintDone('', 3)).toBe('Notfallliste an den Standarddrucker gesendet (3 Ausdrucke).');
  });

  it('übersetzt Fehlermeldungen des Programms', () => {
    expect(printErrorText('Invalid deviceName provided')).toBe('Der eingestellte Drucker wurde nicht gefunden');
    expect(printErrorText('Failed to enumerate printers')).toBe('Es wurde kein Drucker gefunden');
    expect(printErrorText('Print job canceled')).toBe('Der Druck wurde abgebrochen');
    expect(printErrorText('Papierstau')).toBe('Fehler: Papierstau');
    expect(printErrorText(undefined)).toBe('Unbekannter Fehler');
  });
});
