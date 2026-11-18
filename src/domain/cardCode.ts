/**
 * Inhalt der QR-Codes auf den Ausweisen und Einladungen.
 *
 * Format Ausweis: "ZK1:" + 26 Zeichen Base32 (128 Bit Zufall).
 * Format Einladung (Veranstaltung, nur einmal gültig): "ZE1:" + 26 Zeichen Base32.
 * Der Code enthält keine personenbezogenen Daten – er verweist nur auf
 * den Ausweis in der lokalen Datenbank. Wird ein neuer Ausweis ausgestellt,
 * bekommt die Person ein neues Token und der alte Code wird ungültig.
 * Großbuchstaben + Ziffern nutzen den kompakten QR-Alphanumerik-Modus.
 */

export const CARD_PREFIX = 'ZK1:';
export const GUEST_PREFIX = 'ZE1:';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOKEN_PATTERN = /^[A-Z2-7]{26}$/;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function generateCardToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function encodeCardPayload(token: string): string {
  return CARD_PREFIX + token;
}

/** Liefert das Token oder null, wenn der Text kein Ausweis dieser Anwendung ist. */
export function parseCardPayload(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CARD_PREFIX)) return null;
  const token = trimmed.slice(CARD_PREFIX.length);
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function encodeGuestPayload(token: string): string {
  return GUEST_PREFIX + token;
}

/** Token einer Einladung oder null. */
export function parseGuestPayload(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(GUEST_PREFIX)) return null;
  const token = trimmed.slice(GUEST_PREFIX.length);
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** Ausweis oder Einladung dieser Anwendung? */
export type AppCode = { kind: 'card'; token: string } | { kind: 'guest'; token: string };

export function parseAppCode(text: string): AppCode | null {
  const card = parseCardPayload(text);
  if (card) return { kind: 'card', token: card };
  const guest = parseGuestPayload(text);
  return guest ? { kind: 'guest', token: guest } : null;
}
