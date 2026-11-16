import { useEffect, useRef, useState } from 'react';
import {
  KeyboardScanDetector,
  SCANNER_MAX_GAP_MS,
  scannedCardPayload,
  type DetectedScan,
  type ScannerSpeed,
} from '../domain/keyboardScan';
import { announcePresentationFocus, forwardKeyboardScan, listenForForwardedScans } from '../lib/scanForward';

export interface KeyboardScan extends DetectedScan {
  /** Gültiger Karten-Code (ggf. mit korrigiertem Tastaturlayout) oder null. */
  payload: string | null;
  layoutFixed: boolean;
}

interface Options {
  enabled: boolean;
  speed: ScannerSpeed;
}

const SEEN_KEY = 'zk-scanner-seen';

function loadSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number']);

type TextField = HTMLInputElement | HTMLTextAreaElement;

function textField(el: Element | null): TextField | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type)) return el;
  return null;
}

/** Zustand des fokussierten Feldes zu Beginn eines möglichen Scans – zum Zurücksetzen. */
interface FocusSnapshot {
  el: TextField | HTMLSelectElement;
  value: string;
  selStart: number | null;
  selEnd: number | null;
}

function snapshot(el: Element | null): FocusSnapshot | null {
  const field = textField(el);
  if (field) {
    let selStart: number | null = null;
    let selEnd: number | null = null;
    try {
      selStart = field.selectionStart;
      selEnd = field.selectionEnd;
    } catch {
      // Feldtyp ohne Markierung (z. B. number)
    }
    return { el: field, value: field.value, selStart, selEnd };
  }
  if (el instanceof HTMLSelectElement) return { el, value: el.value, selStart: null, selEnd: null };
  return null;
}

/** Feld auf den Stand vor dem Scan setzen – so, dass React die Änderung mitbekommt. */
function restore(s: FocusSnapshot): void {
  if (s.el.value === s.value) return;
  const proto = s.el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : s.el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(s.el, s.value);
  s.el.dispatchEvent(new Event(s.el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  if (!(s.el instanceof HTMLSelectElement) && s.selStart !== null) {
    try {
      s.el.setSelectionRange(s.selStart, s.selEnd ?? s.selStart);
    } catch {
      // ignorieren
    }
  }
}

/**
 * USB-Scanner im Tastatur-Modus: Tastendrücke im ganzen Fenster beobachten und Scans melden.
 *
 * - Karten-Codes werden immer erkannt – auch wenn gerade ein Textfeld aktiv ist; die
 *   dort hineingetippten Zeichen werden wieder entfernt.
 * - Fremde Codes werden nur gemeldet, wenn kein Textfeld aktiv ist.
 * - Das Enter/Tab am Ende eines Scans wird verschluckt, damit es keine Schaltfläche auslöst
 *   (z. B. „Einlassen“ bei wartenden Eintritten).
 *
 * Liefert, ob das Fenster gerade Tastatureingaben bekommt (sonst kommen Scans nicht an)
 * und ob an diesem Gerät schon einmal ein Scanner benutzt wurde.
 */
export function useKeyboardScanner(
  onScan: (scan: KeyboardScan) => void,
  { enabled, speed }: Options,
): { windowActive: boolean; seen: boolean } {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [windowActive, setWindowActive] = useState(() => document.hasFocus());
  const [seen, setSeen] = useState(loadSeen);
  const seenRef = useRef(seen);

  useEffect(() => {
    if (!enabled) return;
    const detector = new KeyboardScanDetector(SCANNER_MAX_GAP_MS[speed]);
    let start: FocusSnapshot | null = null;
    let startedInTextField = false;

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return;
      // Tastenkürzel (Strg+C …) sind kein Scan; AltGr meldet Windows als Strg+Alt – das sind normale Zeichen
      const altGraph = e.key === 'AltGraph' || e.getModifierState('AltGraph');
      if (!altGraph && (e.ctrlKey || e.metaKey || e.altKey)) {
        detector.reset();
        return;
      }
      const action = detector.key(e.key, e.timeStamp);
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      switch (action.kind) {
        case 'none':
          return;
        case 'char':
          if (action.first) {
            start = snapshot(document.activeElement);
            startedInTextField = Boolean(textField(document.activeElement));
          }
          // Außerhalb von Textfeldern: Tastenstoß nicht an Schaltflächen/Auswahllisten weitergeben
          if (action.inBurst && !startedInTextField) e.preventDefault();
          return;
        case 'swallow':
          stop();
          return;
        case 'scan': {
          const { payload, layoutFixed } = scannedCardPayload(action.scan.raw);
          if (!payload && startedInTextField) return; // jemand tippt schnell in ein Feld – nicht stören
          stop();
          if (start) restore(start);
          start = null;
          if (!seenRef.current) {
            seenRef.current = true;
            setSeen(true);
            try {
              localStorage.setItem(SEEN_KEY, '1');
            } catch {
              // ohne Speicher: nur für diese Sitzung merken
            }
          }
          onScanRef.current({ ...action.scan, payload, layoutFixed });
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enabled, speed]);

  useEffect(() => {
    const update = () => setWindowActive(document.hasFocus());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    const t = window.setInterval(update, 2000); // falls ein Ereignis verloren geht
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      window.clearInterval(t);
    };
  }, []);

  return { windowActive, seen };
}

/** Gästebildschirm meldet seinen Fokus regelmäßig; ohne Meldung gilt er nach dieser Zeit als nicht aktiv. */
const PRESENTATION_FOCUS_TTL_MS = 7000;

/**
 * Für Dashboard und Kiosk-Scanner: Scanner im eigenen Fenster und Scans, die der
 * Gästebildschirm weiterreicht. `inputReachable` = Scans kommen gerade an (eigenes
 * Fenster oder Gästebildschirm aktiv).
 */
export function useScannerInput(
  onScan: (scan: KeyboardScan) => void,
  options: Options,
): { inputReachable: boolean; seen: boolean } {
  const { windowActive, seen } = useKeyboardScanner(onScan, options);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [presentationFocusAt, setPresentationFocusAt] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!options.enabled) return;
    return listenForForwardedScans(
      (scan) => {
        // nur ein sichtbares Bedienfenster bucht (nicht zusätzlich ein Tab im Hintergrund)
        if (document.visibilityState === 'visible') onScanRef.current(scan);
      },
      (focused) => setPresentationFocusAt(focused ? Date.now() : 0),
    );
  }, [options.enabled]);

  // Ablauf der Fokus-Meldung bemerken
  useEffect(() => {
    if (!presentationFocusAt) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), PRESENTATION_FOCUS_TTL_MS + 100);
    return () => window.clearTimeout(t);
  }, [presentationFocusAt]);

  const presentationFocused = presentationFocusAt > 0 && Date.now() - presentationFocusAt < PRESENTATION_FOCUS_TTL_MS;
  return { inputReachable: windowActive || presentationFocused, seen };
}

/** Für den Gästebildschirm: Scans an das Bedienfenster weiterreichen und den eigenen Fokus melden. */
export function useScanForwarding(options: Options): void {
  const { windowActive } = useKeyboardScanner(forwardKeyboardScan, options);
  useEffect(() => {
    if (!options.enabled) return;
    announcePresentationFocus(windowActive);
    if (!windowActive) return;
    const t = window.setInterval(() => announcePresentationFocus(true), 3000);
    const gone = () => announcePresentationFocus(false);
    window.addEventListener('pagehide', gone);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pagehide', gone);
    };
  }, [windowActive, options.enabled]);
}
