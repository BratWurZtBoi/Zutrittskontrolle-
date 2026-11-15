import { describe, expect, it } from 'vitest';
import { ScanDeduper } from './scanDeduper';

describe('ScanDeduper', () => {
  it('unterdrückt denselben Code, solange er im Bild bleibt', () => {
    const d = new ScanDeduper(2000);
    expect(d.accept('A', 0)).toBe(true);
    expect(d.accept('A', 500)).toBe(false);
    expect(d.accept('A', 2400)).toBe(false); // weiterhin sichtbar -> Zeitfenster verlängert
    expect(d.accept('A', 4500)).toBe(true); // > 2 s nicht gesehen -> neuer Scan
  });

  it('lässt einen anderen Code sofort durch', () => {
    const d = new ScanDeduper(2000);
    expect(d.accept('A', 0)).toBe(true);
    expect(d.accept('B', 100)).toBe(true);
    expect(d.accept('A', 200)).toBe(true);
  });

  it('kann zurückgesetzt werden', () => {
    const d = new ScanDeduper(2000);
    d.accept('A', 0);
    d.reset();
    expect(d.accept('A', 10)).toBe(true);
  });
});
