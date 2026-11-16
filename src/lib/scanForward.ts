/**
 * USB-Scanner und zwei Fenster: Ein Scanner im Tastatur-Modus „tippt“ in das Fenster,
 * das gerade aktiv ist. Hat jemand zuletzt auf den Gästebildschirm geklickt, landet der
 * Scan dort. Das Präsentationsfenster reicht ihn deshalb per BroadcastChannel an
 * Dashboard bzw. Kiosk-Scanner weiter (gleiche App, gleicher Browser, kein Netzwerk).
 */
import type { KeyboardScan } from '../hooks/useKeyboardScanner';

const CHANNEL = 'zutrittskontrolle-scanner';

type ForwardMessage = { type: 'keyboard-scan'; scan: KeyboardScan } | { type: 'presentation-focus'; focused: boolean };

let sender: BroadcastChannel | null = null;

function post(message: ForwardMessage): void {
  if (typeof BroadcastChannel !== 'function') return;
  sender ??= new BroadcastChannel(CHANNEL);
  try {
    sender.postMessage(message);
  } catch {
    // Weiterreichen ist optional
  }
}

/** Im Präsentationsfenster: Scan an das Bedienfenster weiterreichen. */
export function forwardKeyboardScan(scan: KeyboardScan): void {
  post({ type: 'keyboard-scan', scan });
}

/** Im Präsentationsfenster: melden, ob es gerade die Tastatureingaben bekommt. */
export function announcePresentationFocus(focused: boolean): void {
  post({ type: 'presentation-focus', focused });
}

/** Im Dashboard/Kiosk: weitergereichte Scans und den Fokus des Gästebildschirms empfangen. */
export function listenForForwardedScans(onScan: (scan: KeyboardScan) => void, onPresentationFocus: (focused: boolean) => void): () => void {
  if (typeof BroadcastChannel !== 'function') return () => undefined;
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e: MessageEvent<ForwardMessage>) => {
    const msg = e.data;
    if (msg?.type === 'keyboard-scan' && typeof msg.scan?.raw === 'string') onScan(msg.scan);
    else if (msg?.type === 'presentation-focus') onPresentationFocus(Boolean(msg.focused));
  };
  return () => ch.close();
}
