/**
 * USB-Scanner im Tastatur-Modus (HID): Der Scanner „tippt“ den Inhalt des QR-Codes
 * sehr schnell und meist mit Enter (oder Tab) am Ende. Hier wird aus einzelnen
 * Tastendrücken erkannt, ob gerade ein Scanner oder ein Mensch tippt.
 *
 * Merkmale eines Scans: viele Zeichen kurz hintereinander (Abstand ≤ maxGapMs).
 * Menschen schaffen das höchstens für zwei, drei Zeichen.
 *
 * Reine Logik ohne DOM – getestet in keyboardScan.test.ts.
 */
import { CARD_PREFIX, parseCardPayload } from './cardCode';

export type ScannerSpeed = 'fast' | 'slow';

/** Größter Abstand zwischen zwei Zeichen eines Scans. „Langsam“ für Bluetooth- oder gedrosselte Scanner. */
export const SCANNER_MAX_GAP_MS: Record<ScannerSpeed, number> = { fast: 40, slow: 110 };

/** So viele Zeichen muss ein schneller Tastenstoß mindestens haben, um als Scan zu gelten. */
export const SCAN_MIN_LENGTH = 6;

/** Nach einem vollständigen Karten-Code: so lange auf das abschließende Enter/Tab warten (wird verschluckt). */
const SUFFIX_GRACE_MS = 250;

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'CapsLock', 'Meta', 'NumLock', 'Fn', 'Dead', 'Unidentified']);

export type Terminator = 'Enter' | 'Tab' | null;

export interface DetectedScan {
  /** Zeichen genau so, wie der Scanner sie getippt hat. */
  raw: string;
  /** Durchschnittlicher Abstand zwischen zwei Zeichen (Millisekunden). */
  msPerChar: number;
  /** Abschlusstaste des Scanners (null = Karten-Code war vollständig, bevor eine kam). */
  terminator: Terminator;
}

export type KeyAction =
  /** Normale Taste – nichts tun. */
  | { kind: 'none' }
  /** Zeichen gepuffert; `first` = erstes Zeichen eines möglichen Scans. `inBurst` = Teil eines schnellen Tastenstoßes. */
  | { kind: 'char'; first: boolean; inBurst: boolean }
  /** Abschlusstaste eines eben erkannten Scans – Standardaktion verhindern. */
  | { kind: 'swallow' }
  /** Scan erkannt. `swallow` = die aktuelle Taste (Enter/Tab) gehört dazu. */
  | { kind: 'scan'; scan: DetectedScan; swallow: boolean };

export class KeyboardScanDetector {
  private chars: string[] = [];
  private times: number[] = [];
  /** Zeitpunkt eines Scans, der ohne Abschlusstaste erkannt wurde (wartet ggf. noch auf Enter/Tab). */
  private openSuffixUntil = 0;

  constructor(private maxGapMs: number = SCANNER_MAX_GAP_MS.fast) {}

  setMaxGap(ms: number): void {
    this.maxGapMs = ms;
  }

  reset(): void {
    this.chars = [];
    this.times = [];
  }

  /** Eine Taste verarbeiten (`key` wie KeyboardEvent.key, `time` in Millisekunden). */
  key(key: string, time: number): KeyAction {
    if (MODIFIER_KEYS.has(key)) return { kind: 'none' };

    if (key === 'Enter' || key === 'Tab') {
      if (this.openSuffixUntil && time <= this.openSuffixUntil && this.chars.length === 0) {
        this.openSuffixUntil = 0;
        return { kind: 'swallow' };
      }
      this.openSuffixUntil = 0;
      const last = this.times[this.times.length - 1];
      const fast = last !== undefined && time - last <= this.maxGapMs * 3;
      if (fast && this.chars.length >= SCAN_MIN_LENGTH) {
        const scan = this.take(key);
        return { kind: 'scan', scan, swallow: true };
      }
      this.reset();
      return { kind: 'none' };
    }

    if (key.length !== 1) {
      // Pfeiltasten, Rücktaste … → kein Scan
      this.reset();
      this.openSuffixUntil = 0;
      return { kind: 'none' };
    }

    const last = this.times[this.times.length - 1];
    if (last !== undefined && time - last > this.maxGapMs) this.reset();
    this.openSuffixUntil = 0;
    this.chars.push(key);
    this.times.push(time);
    const first = this.chars.length === 1;

    // Karten-Code vollständig? Dann sofort melden – auch Scanner ohne Enter am Ende funktionieren.
    if (this.chars.length >= CARD_PREFIX.length + 26 && scannedCardPayload(this.chars.join('')).payload) {
      const scan = this.take(null);
      this.openSuffixUntil = time + SUFFIX_GRACE_MS;
      return { kind: 'scan', scan, swallow: false };
    }
    return { kind: 'char', first, inBurst: this.chars.length >= 2 };
  }

  private take(terminator: Terminator): DetectedScan {
    const raw = this.chars.join('');
    const span = (this.times.at(-1) ?? 0) - (this.times[0] ?? 0);
    const msPerChar = this.times.length > 1 ? span / (this.times.length - 1) : 0;
    this.reset();
    return { raw, msPerChar: Math.round(msPerChar * 10) / 10, terminator };
  }
}

export interface ScannedPayload {
  /** Gültiger Karten-Code („ZK1:…“) oder null. */
  payload: string | null;
  /** Das Tastaturlayout des Scanners passte nicht zum Rechner – automatisch korrigiert. */
  layoutFixed: boolean;
}

/**
 * Karten-Code aus Scanner-Eingabe lesen. Verkraftet die häufigsten Fehleinstellungen:
 * - Feststelltaste an → Kleinbuchstaben
 * - Scanner auf US-Tastatur, Rechner auf Deutsch: Y/Z vertauscht, „:“ kommt als „Ö“
 * - Scanner auf Deutsch, Rechner auf US-Tastatur: Y/Z vertauscht, „:“ kommt als „>“
 * Erkennbar am Präfix: „ZK1:“ wird dann zu „YK1Ö“ bzw. „YK1>“.
 */
export function scannedCardPayload(raw: string): ScannedPayload {
  const upper = raw.trim().toUpperCase();
  if (parseCardPayload(upper)) return { payload: upper, layoutFixed: false };
  let fixed = upper.replace(/^([YZ]K1)[Ö>]/, '$1:');
  if (fixed.startsWith('YK1:')) fixed = swapYZ(fixed);
  if (parseCardPayload(fixed)) return { payload: fixed, layoutFixed: true };
  return { payload: null, layoutFixed: false };
}

function swapYZ(text: string): string {
  return text.replace(/[YZ]/g, (c) => (c === 'Y' ? 'Z' : 'Y'));
}
