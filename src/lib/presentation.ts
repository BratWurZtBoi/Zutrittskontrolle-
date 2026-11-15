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

/** Öffnet die Präsentationsansicht in einem eigenen Fenster (zum Verschieben auf den zweiten Bildschirm). */
export function openPresentationWindow(): void {
  const url = `${location.pathname}${location.search}#/praesentation`;
  const win = window.open(url, 'zutrittskontrolle-praesentation', 'popup,width=1280,height=720');
  win?.focus();
}
