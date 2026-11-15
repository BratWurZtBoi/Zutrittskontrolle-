import { describe, expect, it } from 'vitest';
import { isHexColor, textColorOn } from './color';

describe('color', () => {
  it('prüft Hex-Farben', () => {
    expect(isHexColor('#2563eb')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('blau')).toBe(false);
  });

  it('wählt eine lesbare Schriftfarbe', () => {
    expect(textColorOn('#0f172a')).toBe('#ffffff');
    expect(textColorOn('#2563eb')).toBe('#ffffff');
    expect(textColorOn('#facc15')).toBe('#000000');
    expect(textColorOn('#ffffff')).toBe('#000000');
  });
});
