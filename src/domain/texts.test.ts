import { describe, expect, it } from 'vitest';
import { holderListName, holderName, holderUnitLine, personKey } from './texts';

describe('Namen mit Dienstgrad', () => {
  const h = { rank: 'Hptm', firstName: 'Max', lastName: 'Muster', company: '1./Btl 1', position: 'Kompaniechef' };

  it('Dienstgrad steht vor dem Namen', () => {
    expect(holderName(h)).toBe('Hptm Max Muster');
    expect(holderListName(h)).toBe('Hptm Muster, Max');
    expect(holderName({ firstName: 'Erika', lastName: 'Musterfrau' })).toBe('Erika Musterfrau');
    expect(holderListName({ firstName: '', lastName: 'Musterfrau' })).toBe('Musterfrau');
  });

  it('Beförderung ist kein Personenwechsel', () => {
    expect(personKey({ ...h, rank: 'Maj' })).toBe(personKey(h));
    expect(personKey({ ...h, firstName: 'Moritz' })).not.toBe(personKey(h));
  });

  it('Einheit und Stellung/Posten in einer Zeile', () => {
    expect(holderUnitLine(h)).toBe('1./Btl 1 · Kompaniechef');
    expect(holderUnitLine({ firstName: 'A', lastName: 'B', position: 'S4' })).toBe('S4');
    expect(holderUnitLine(undefined)).toBe('');
  });
});
