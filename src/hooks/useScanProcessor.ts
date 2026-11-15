import { useCallback, useEffect, useRef, useState } from 'react';
import { processScan, type ScanOutcome } from '../db/scans';
import { ScanDeduper } from '../domain/scanDeduper';
import type { AccessEventRecord } from '../domain/types';
import { setKeepScreenOn } from '../lib/device';
import { playFeedback, type FeedbackKind } from '../lib/feedback';
import { useSettings } from './useSettings';

/** Derselbe Code gilt erst wieder als neu, wenn er so lange nicht im Bild war. */
const SAME_CODE_HOLD_MS = 2500;

function feedbackKind(o: ScanOutcome): FeedbackKind {
  if (o.decision.outcome === 'duplicate') return 'duplicate';
  if (o.decision.outcome === 'denied') return 'denied';
  return o.decision.direction === 'out' ? 'granted-out' : 'granted-in';
}

/**
 * Gemeinsame Scan-Verarbeitung für Kiosk-Scanner und Dashboard:
 * Doppelerkennung unterdrücken, buchen, Ton/Vibration, letztes Ergebnis merken.
 */
export function useScanProcessor() {
  const settings = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [result, setResult] = useState<ScanOutcome | null>(null);
  const busy = useRef(false);
  const deduper = useRef(new ScanDeduper(SAME_CODE_HOLD_MS));

  const handleText = useCallback(async (text: string, source: AccessEventRecord['source']) => {
    if (source === 'camera' && !deduper.current.accept(text, Date.now())) return;
    if (busy.current) return;
    busy.current = true;
    try {
      const s = settingsRef.current;
      const outcome = await processScan(text, { mode: s.scanMode, cooldownMs: s.cooldownSec * 1000, source });
      setResult(outcome);
      playFeedback(feedbackKind(outcome), s.sound);
    } catch (err) {
      console.error('Scan fehlgeschlagen', err);
    } finally {
      busy.current = false;
    }
  }, []);

  const onCamera = useCallback((text: string) => void handleText(text, 'camera'), [handleText]);
  const clearResult = useCallback(() => setResult(null), []);

  return { settings, result, clearResult, handleText, onCamera };
}

/** Hält den Bildschirm an, solange die Komponente angezeigt wird. */
export function useKeepScreenOn(): void {
  useEffect(() => {
    void setKeepScreenOn(true);
    return () => void setKeepScreenOn(false);
  }, []);
}
