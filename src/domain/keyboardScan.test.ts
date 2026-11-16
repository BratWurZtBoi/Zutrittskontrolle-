import { describe, expect, it } from 'vitest';
import { KeyboardScanDetector, SCANNER_MAX_GAP_MS, scannedCardPayload, type KeyAction } from './keyboardScan';

const CODE = 'ZK1:ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TOKEN_WITH_YZ = 'ZK1:YYZZABCDEFGHIJKLMNOPQRSTUV';

/** Tippt einen Text mit festem Abstand und liefert alle Aktionen. */
function type(detector: KeyboardScanDetector, keys: string[], start: number, gap: number): KeyAction[] {
  return keys.map((k, i) => detector.key(k, start + i * gap));
}

const chars = (text: string) => [...text];

describe('scannedCardPayload', () => {
  it('erkennt korrekte Codes', () => {
    expect(scannedCardPayload(CODE)).toEqual({ payload: CODE, layoutFixed: false });
  });

  it('verkraftet die Feststelltaste', () => {
    expect(scannedCardPayload(CODE.toLowerCase()).payload).toBe(CODE);
  });

  it('korrigiert US-Scanner an deutscher Tastatur (Y/Z vertauscht, „:“ als „Ö“)', () => {
    const typed = 'YK1Ö' + 'ZZYYABCDEFGHIJKLMNOPQRSTUV';
    expect(scannedCardPayload(typed)).toEqual({ payload: TOKEN_WITH_YZ, layoutFixed: true });
    expect(scannedCardPayload(typed.toLowerCase()).payload).toBe(TOKEN_WITH_YZ);
  });

  it('korrigiert deutschen Scanner an US-Tastatur („:“ als „>“)', () => {
    expect(scannedCardPayload('YK1>ZZYYABCDEFGHIJKLMNOPQRSTUV').payload).toBe(TOKEN_WITH_YZ);
  });

  it('lehnt fremde Codes ab', () => {
    expect(scannedCardPayload('https://example.com/abc').payload).toBeNull();
    expect(scannedCardPayload('4006381333931').payload).toBeNull();
    expect(scannedCardPayload('ZK1:ZU-KURZ').payload).toBeNull();
  });
});

describe('KeyboardScanDetector', () => {
  it('erkennt einen Scan mit Enter am Ende und verschluckt das Enter', () => {
    const d = new KeyboardScanDetector();
    const actions = type(d, [...chars('4006381333931'), 'Enter'], 1000, 8);
    const last = actions[actions.length - 1];
    expect(last).toEqual({ kind: 'scan', swallow: true, scan: { raw: '4006381333931', msPerChar: 8, terminator: 'Enter' } });
    expect(actions[0]).toEqual({ kind: 'char', first: true, inBurst: false });
    expect(actions[1]).toEqual({ kind: 'char', first: false, inBurst: true });
  });

  it('meldet Karten-Codes sofort und verschluckt das folgende Enter', () => {
    const d = new KeyboardScanDetector();
    const last = type(d, chars(CODE), 0, 5).pop();
    expect(last).toMatchObject({ kind: 'scan', swallow: false, scan: { raw: CODE, terminator: null } });
    expect(d.key('Enter', CODE.length * 5 + 3)).toEqual({ kind: 'swallow' });
    // ein späteres Enter (Mensch) bleibt unberührt
    expect(d.key('Enter', 5000)).toEqual({ kind: 'none' });
  });

  it('funktioniert mit Tab als Abschluss und ignoriert Umschalttasten', () => {
    const d = new KeyboardScanDetector();
    const keys = ['Shift', 'A', 'Shift', 'B', 'C', 'D', 'E', 'F', 'Tab'];
    const actions = type(d, keys, 0, 4);
    expect(actions[actions.length - 1]).toMatchObject({ kind: 'scan', scan: { raw: 'ABCDEF', terminator: 'Tab' } });
  });

  it('wertet menschliches Tippen nicht als Scan', () => {
    const d = new KeyboardScanDetector();
    const actions = type(d, [...chars('Hallo Welt'), 'Enter'], 0, 120);
    expect(actions.every((a) => a.kind === 'char' || a.kind === 'none')).toBe(true);
    expect(actions[actions.length - 1]).toEqual({ kind: 'none' });
    expect(actions.filter((a) => a.kind === 'char' && a.inBurst)).toHaveLength(0);
  });

  it('zu kurze schnelle Tastenstöße sind kein Scan', () => {
    const d = new KeyboardScanDetector();
    const actions = type(d, ['a', 's', 'Enter'], 0, 10);
    expect(actions[2]).toEqual({ kind: 'none' });
  });

  it('eine Pause beginnt einen neuen Scan (vorher Getipptes zählt nicht mit)', () => {
    const d = new KeyboardScanDetector();
    type(d, chars('xy'), 0, 100);
    const actions = type(d, [...chars('123456'), 'Enter'], 1000, 5);
    expect(actions[0]).toEqual({ kind: 'char', first: true, inBurst: false });
    expect(actions[actions.length - 1]).toMatchObject({ kind: 'scan', scan: { raw: '123456' } });
  });

  it('andere Tasten brechen ab', () => {
    const d = new KeyboardScanDetector();
    type(d, chars('12345'), 0, 5);
    expect(d.key('Backspace', 30)).toEqual({ kind: 'none' });
    expect(d.key('6', 35)).toEqual({ kind: 'char', first: true, inBurst: false });
  });

  it('langsame Scanner brauchen die Einstellung „langsam“', () => {
    const fast = new KeyboardScanDetector(SCANNER_MAX_GAP_MS.fast);
    const slow = new KeyboardScanDetector(SCANNER_MAX_GAP_MS.slow);
    const keys = [...chars('ABCDEFGH'), 'Enter'];
    expect(type(fast, keys, 0, 70).pop()).toEqual({ kind: 'none' });
    expect(type(slow, keys, 0, 70).pop()).toMatchObject({ kind: 'scan', scan: { raw: 'ABCDEFGH', msPerChar: 70 } });
  });

  it('erkennt Karten-Codes mit falschem Tastaturlayout sofort', () => {
    const d = new KeyboardScanDetector();
    const typed = 'YK1Ö' + 'ZZYYABCDEFGHIJKLMNOPQRSTUV';
    const last = type(d, chars(typed), 0, 3).pop();
    expect(last?.kind).toBe('scan');
    expect(last?.kind === 'scan' && scannedCardPayload(last.scan.raw).payload).toBe(TOKEN_WITH_YZ);
  });
});
