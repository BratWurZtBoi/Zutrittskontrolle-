import { useCallback, useEffect, useRef, useState } from 'react';
import { processScan, resolvePendingScan, type PendingAction, type ScanOutcome } from '../db/scans';
import { ScanDeduper } from '../domain/scanDeduper';
import type { AccessEventRecord } from '../domain/types';
import { setKeepScreenOn } from '../lib/device';
import { playFeedback, type FeedbackKind } from '../lib/feedback';
import { broadcastScan } from '../lib/presentation';
import { staffRole } from '../security/session';
import { useSettings } from './useSettings';

/** Derselbe Code gilt erst wieder als neu, wenn er so lange nicht im Bild war. */
const SAME_CODE_HOLD_MS = 2500;

function feedbackKind(o: ScanOutcome): FeedbackKind {
  if (o.decision.outcome === 'duplicate') return 'duplicate';
  if (o.decision.outcome === 'pending') return 'attention';
  if (o.decision.outcome === 'denied') return 'denied';
  return o.decision.direction === 'out' ? 'granted-out' : 'granted-in';
}

/** Ein Eintritt, der auf Bestätigung durch Admin/Bediener wartet. */
export interface PendingEntry {
  id: string;
  outcome: ScanOutcome;
  source: AccessEventRecord['source'];
  expiresAt: number;
}

interface Options {
  /** Hier kann jemand Eintritte bestätigen (Dashboard). Sonst werden solche Eintritte abgewiesen. */
  confirm?: boolean;
}

/**
 * Gemeinsame Scan-Verarbeitung für Kiosk-Scanner und Dashboard:
 * Doppelerkennung unterdrücken, buchen, Ton/Vibration, letztes Ergebnis merken.
 * Im Dashboard zusätzlich: Warteschlange für Eintritte mit Bestätigungspflicht.
 */
export function useScanProcessor({ confirm = false }: Options = {}) {
  const settings = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [result, setResult] = useState<ScanOutcome | null>(null);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const pendingRef = useRef<PendingEntry[]>([]);
  const busy = useRef(false);
  const deduper = useRef(new ScanDeduper(SAME_CODE_HOLD_MS));

  const updatePending = useCallback((next: PendingEntry[]) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const showFinal = useCallback((outcome: ScanOutcome) => {
    const s = settingsRef.current;
    setResult(outcome);
    playFeedback(feedbackKind(outcome), s.sound);
    broadcastScan(outcome, s.resultDisplaySec);
  }, []);

  const handleText = useCallback(
    async (text: string, source: AccessEventRecord['source']) => {
      if (source === 'camera' && !deduper.current.accept(text, Date.now())) return;
      if (busy.current) return;
      busy.current = true;
      try {
        const s = settingsRef.current;
        const outcome = await processScan(text, {
          mode: s.scanMode,
          cooldownMs: s.cooldownSec * 1000,
          source,
          confirmation: confirm ? 'operator' : 'none',
        });
        if (outcome.decision.outcome === 'pending') {
          const cardId = outcome.card?.id;
          // Wartet diese Karte schon? Dann nicht doppelt einreihen.
          if (pendingRef.current.some((p) => p.outcome.card?.id === cardId)) return;
          const entry: PendingEntry = { id: `${cardId}-${outcome.at}`, outcome, source, expiresAt: outcome.at + s.confirmTimeoutSec * 1000 };
          updatePending([...pendingRef.current, entry]);
          playFeedback('attention', s.sound);
          broadcastScan(outcome, s.confirmTimeoutSec);
          return;
        }
        showFinal(outcome);
      } catch (err) {
        console.error('Scan fehlgeschlagen', err);
      } finally {
        busy.current = false;
      }
    },
    [confirm, showFinal, updatePending],
  );

  /** Wartenden Eintritt bestätigen, abweisen oder verfallen lassen. */
  const resolvePending = useCallback(
    async (id: string, action: PendingAction) => {
      const entry = pendingRef.current.find((p) => p.id === id);
      if (!entry) return;
      updatePending(pendingRef.current.filter((p) => p.id !== id));
      try {
        const final = await resolvePendingScan(entry.outcome, action, { by: staffRole() ?? 'operator', source: entry.source });
        showFinal(final);
      } catch (err) {
        console.error('Bestätigung fehlgeschlagen', err);
      }
    },
    [showFinal, updatePending],
  );

  // Abgelaufene Anfragen automatisch verfallen lassen (wird protokolliert)
  useEffect(() => {
    if (pending.length === 0) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      for (const p of pendingRef.current) if (p.expiresAt <= now) void resolvePending(p.id, 'timeout');
    }, 1000);
    return () => window.clearInterval(t);
  }, [pending.length, resolvePending]);

  // Seite verlassen (z. B. Abmelden): offene Anfragen als verfallen protokollieren
  useEffect(
    () => () => {
      for (const p of pendingRef.current) {
        void resolvePendingScan(p.outcome, 'timeout', { by: 'operator', source: p.source }).catch(() => undefined);
      }
      pendingRef.current = [];
    },
    [],
  );

  const onCamera = useCallback((text: string) => void handleText(text, 'camera'), [handleText]);
  const clearResult = useCallback(() => setResult(null), []);

  return { settings, result, clearResult, handleText, onCamera, pending, resolvePending };
}

/** Hält den Bildschirm an, solange die Komponente angezeigt wird. */
export function useKeepScreenOn(): void {
  useEffect(() => {
    void setKeepScreenOn(true);
    return () => void setKeepScreenOn(false);
  }, []);
}
