import { describe, expect, it } from 'vitest';
import { addDays, formatIsoDate, isValidIsoDate, toLocalDateString } from './dates';

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
});
