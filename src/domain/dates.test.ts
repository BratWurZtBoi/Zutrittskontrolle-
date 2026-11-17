import { describe, expect, it } from 'vitest';
import { addDays, daysAgoLabel, formatIsoDate, isValidIsoDate, toLocalDateString } from './dates';

describe('dates', () => {
  it('formatiert lokale Daten', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(formatIsoDate('2026-01-05')).toBe('05.01.2026');
    expect(toLocalDateString(addDays(new Date(2026, 1, 28), 1))).toBe('2026-03-01');
  });

  it('prüft ISO-Daten', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('28.02.2026')).toBe(false);
  });

  it('beschreibt, wie viele Tage etwas her ist', () => {
    const now = new Date(2026, 2, 10, 8, 0);
    expect(daysAgoLabel(new Date(2026, 2, 10, 0, 5).getTime(), now)).toBe('heute');
    expect(daysAgoLabel(new Date(2026, 2, 9, 23, 59).getTime(), now)).toBe('gestern');
    expect(daysAgoLabel(new Date(2026, 2, 1, 12, 0).getTime(), now)).toBe('vor 9 Tagen');
  });
});
