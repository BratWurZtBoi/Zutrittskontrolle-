import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importTemplateCsv } from './csvImport';

describe('CSV-Vorlage im Repository', () => {
  it('stimmt mit der Vorlage in der App überein', () => {
    const file = readFileSync(new URL('../../vorlagen/zutritt-import-vorlage.csv', import.meta.url), 'utf8');
    expect(file).toBe(importTemplateCsv());
  });
});
