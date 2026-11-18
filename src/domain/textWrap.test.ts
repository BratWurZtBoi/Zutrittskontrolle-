import { describe, expect, it } from 'vitest';
import { wrapLines } from './textWrap';

const chars = (s: string) => s.length; // 1 Zeichen = 1 Einheit

describe('Zeilenumbruch wie in der Vorschau (pre-line)', () => {
  it('bricht an Leerzeichen um, behält Zeilenumbrüche und Leerzeilen', () => {
    expect(wrapLines('Sehr geehrte Frau Musterfrau,\n\nwir laden Sie ein', 12, chars)).toEqual([
      'Sehr geehrte',
      'Frau',
      'Musterfrau,',
      '',
      'wir laden',
      'Sie ein',
    ]);
  });

  it('fasst Leerzeichen zusammen und trennt überlange Wörter', () => {
    expect(wrapLines('  A   B  ', 10, chars)).toEqual(['A B']);
    expect(wrapLines('Donaudampfschifffahrt', 8, chars)).toEqual(['Donaudam', 'pfschiff', 'fahrt']);
  });
});
