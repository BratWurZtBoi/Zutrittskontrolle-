/**
 * Präsentationsansicht auf einem zweiten Bildschirm.
 * Scanner/Dashboard senden jedes Ergebnis per BroadcastChannel an andere Fenster
 * derselben App im selben Browser – ohne Server, ohne Internet.
 */
import type { ScanOutcome } from '../db/scans';
import { describeOutcome, displayName, type ResultTone } from './resultText';

const CHANNEL = 'zutrittskontrolle-praesentation';

export interface PresentationScan {
  type: 'scan';
  tone: ResultTone;
  title: string;
  /** Name der Person (oder Kartennummer, wenn gesperrt / keine Person). */
  name?: string;
  photo?: string;
  groupName?: string;
  groupColor?: string;
  /** Kurzer Hinweis für den Gast (bei Ablehnung der Grund). */
  detail: string;
  at: number;
  displaySec: number;
}

let sender: BroadcastChannel | null = null;

function channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== 'function') return null;
  sender ??= new BroadcastChannel(CHANNEL);
  return sender;
}

export function broadcastScan(result: ScanOutcome, displaySec: number): void {
  const text = describeOutcome(result);
  const message: PresentationScan = {
    type: 'scan',
    tone: text.tone,
    title: text.title,
    name: displayName(result),
    photo: result.card?.holder?.photo,
    groupName: result.group?.name,
    groupColor: result.group?.color,
    detail: text.tone === 'deny' ? `${text.detail} Bitte wenden Sie sich an den Empfang.` : text.detail,
    at: result.at,
    displaySec,
  };
  try {
    channel()?.postMessage(message);
  } catch {
    /* Präsentation ist optional */
  }
}

/** Empfängt Ergebnisse im Präsentationsfenster. Liefert eine Abmeldefunktion. */
export function listenForScans(onScan: (msg: PresentationScan) => void): () => void {
  if (typeof BroadcastChannel !== 'function') return () => undefined;
  const receiver = new BroadcastChannel(CHANNEL);
  receiver.onmessage = (e: MessageEvent<PresentationScan>) => {
    if (e.data?.type === 'scan') onScan(e.data);
  };
  return () => receiver.close();
}

// ---------------------------------------------------------------------------
// Verbindungsanzeige: Das Präsentationsfenster meldet sich regelmäßig.
// ---------------------------------------------------------------------------

const HEARTBEAT_MS = 4000;
const TIMEOUT_MS = 10_000;

interface ControlMessage {
  type: 'ping' | 'alive' | 'gone';
}

/** Im Präsentationsfenster: regelmäßig „ich bin da“ melden. Liefert eine Abmeldefunktion. */
export function announcePresentation(): () => void {
  if (typeof BroadcastChannel !== 'function') return () => undefined;
  const ch = new BroadcastChannel(CHANNEL);
  const post = (type: ControlMessage['type']) => {
    try {
      ch.postMessage({ type } satisfies ControlMessage);
    } catch {
      /* Kanal bereits geschlossen */
    }
  };
  ch.onmessage = (e: MessageEvent<ControlMessage>) => {
    if (e.data?.type === 'ping') post('alive');
  };
  post('alive');
  const timer = window.setInterval(() => post('alive'), HEARTBEAT_MS);
  const onHide = () => post('gone');
  window.addEventListener('pagehide', onHide);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('pagehide', onHide);
    post('gone');
    ch.close();
  };
}

/** Im Dashboard: meldet, ob gerade ein Präsentationsfenster geöffnet ist. */
export function watchPresentation(onChange: (connected: boolean) => void): () => void {
  if (typeof BroadcastChannel !== 'function') return () => undefined;
  const ch = new BroadcastChannel(CHANNEL);
  let lastSeen = 0;
  let connected = false;
  const update = () => {
    const now = Date.now() - lastSeen < TIMEOUT_MS;
    if (now !== connected) {
      connected = now;
      onChange(now);
    }
  };
  ch.onmessage = (e: MessageEvent<ControlMessage>) => {
    if (e.data?.type === 'alive') lastSeen = Date.now();
    else if (e.data?.type === 'gone') lastSeen = 0;
    else return;
    update();
  };
  ch.postMessage({ type: 'ping' } satisfies ControlMessage);
  const timer = window.setInterval(update, 2000);
  return () => {
    window.clearInterval(timer);
    ch.close();
  };
}

// ---------------------------------------------------------------------------
// Fenster öffnen – wenn möglich direkt auf dem zweiten Bildschirm
// ---------------------------------------------------------------------------

const WINDOW_NAME = 'zutrittskontrolle-praesentation';

interface ScreenArea {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
}
interface ScreenDetailsLike {
  screens: ScreenArea[];
  currentScreen: ScreenArea;
}

/**
 * Fensterposition auf einem anderen Bildschirm (Chrome/Edge: Fensterverwaltung,
 * fragt beim ersten Mal nach Erlaubnis). null = kein zweiter Bildschirm / nicht möglich.
 */
async function otherScreenFeatures(): Promise<string | null> {
  const w = window as Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> };
  const extended = (window.screen as Screen & { isExtended?: boolean }).isExtended;
  if (!w.getScreenDetails || !extended) return null;
  try {
    const details = await w.getScreenDetails();
    const other = details.screens.find((s) => s !== details.currentScreen);
    if (!other) return null;
    return `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
  } catch {
    return null; // Erlaubnis verweigert
  }
}

export type PresentationOpenResult = 'other-screen' | 'window' | 'blocked';

/** Öffnet die Präsentationsansicht in einem eigenen Fenster – bevorzugt auf dem zweiten Bildschirm. */
export async function openPresentationWindow(): Promise<PresentationOpenResult> {
  const url = `${location.pathname}${location.search}#/praesentation`;
  const placed = await otherScreenFeatures();
  const win = window.open(url, WINDOW_NAME, placed ?? 'popup,width=1280,height=720');
  if (!win) return 'blocked';
  win.focus();
  return placed ? 'other-screen' : 'window';
}
