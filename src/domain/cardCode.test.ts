import { describe, expect, it } from 'vitest';
import { base32Encode, encodeCardPayload, generateCardToken, parseCardPayload } from './cardCode';

describe('cardCode', () => {
  it('kodiert Base32 nach RFC 4648 (ohne Padding)', () => {
    expect(base32Encode(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Encode(new Uint8Array([]))).toBe('');
  });

  it('erzeugt zufällige 26-stellige Token', () => {
    const a = generateCardToken();
    const b = generateCardToken();
    expect(a).toMatch(/^[A-Z2-7]{26}$/);
    expect(a).not.toBe(b);
  });

  it('liest erzeugte Codes wieder ein', () => {
    const token = generateCardToken();
    expect(parseCardPayload(encodeCardPayload(token))).toBe(token);
    expect(parseCardPayload(`  ${encodeCardPayload(token)}\n`)).toBe(token);
  });

  it('weist fremde oder beschädigte Codes zurück', () => {
    expect(parseCardPayload('https://example.com')).toBeNull();
    expect(parseCardPayload('ZK1:')).toBeNull();
    expect(parseCardPayload('ZK1:abc')).toBeNull();
    expect(parseCardPayload('ZK1:' + 'A'.repeat(25))).toBeNull();
    expect(parseCardPayload('ZK1:' + 'A'.repeat(25) + '1')).toBeNull();
    expect(parseCardPayload('ZK2:' + 'A'.repeat(26))).toBeNull();
  });
});
