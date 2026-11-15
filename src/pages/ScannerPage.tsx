import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraSelect } from '../components/CameraSelect';
import { GroupBadge } from '../components/GroupBadge';
import { HolderPhoto } from '../components/HolderPhoto';
import { AlertIcon, CheckIcon, CrossIcon, ExitIcon } from '../components/Icons';
import { listCards } from '../db/cards';
import { db } from '../db/db';
import { processScan, type ScanOutcome } from '../db/scans';
import { saveSettings } from '../db/settings';
import { encodeCardPayload } from '../domain/cardCode';
import { formatTime } from '../domain/dates';
import { ScanDeduper } from '../domain/scanDeduper';
import { directionText, holderName, reasonText } from '../domain/texts';
import type { AccessEvent, ScanMode } from '../domain/types';
import { useSettings } from '../hooks/useSettings';
import { setKeepScreenOn } from '../lib/device';
import { playFeedback, type FeedbackKind } from '../lib/feedback';
import { CameraScanner } from '../scanner/CameraScanner';

/** Derselbe Code gilt erst wieder als neu, wenn er so lange nicht im Bild war. */
const SAME_CODE_HOLD_MS = 2500;

const MODES: { value: ScanMode; label: string }[] = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'in', label: 'Nur Eingang' },
  { value: 'out', label: 'Nur Ausgang' },
];

function feedbackKind(o: ScanOutcome): FeedbackKind {
  if (o.decision.outcome === 'duplicate') return 'duplicate';
  if (o.decision.outcome === 'denied') return 'denied';
  return o.decision.direction === 'out' ? 'granted-out' : 'granted-in';
}

export function ScannerPage() {
  const settings = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [result, setResult] = useState<ScanOutcome | null>(null);
  const busy = useRef(false);
  const deduper = useRef(new ScanDeduper(SAME_CODE_HOLD_MS));
  const presentCount = useLiveQuery(() => db.presence.where('status').equals('in').count(), [], 0);
  const [cameraStarts, setCameraStarts] = useState(0);

  useEffect(() => {
    void setKeepScreenOn(true);
    return () => void setKeepScreenOn(false);
  }, []);

  const handleText = useCallback(async (text: string, source: AccessEvent['source']) => {
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

  // Ergebnis nach der eingestellten Zeit ausblenden
  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), settings.resultDisplaySec * 1000);
    return () => window.clearTimeout(t);
  }, [result, settings.resultDisplaySec]);

  const onCamera = useCallback((text: string) => void handleText(text, 'camera'), [handleText]);
  const mirror = settings.mirrorPreview && settings.camera !== 'environment';
  const onStarted = useCallback(() => setCameraStarts((n) => n + 1), []);

  return (
    <div className="scanner-page">
      <div className="scanner-stage">
        <CameraScanner camera={settings.camera} mirror={mirror} onCode={onCamera} onStarted={onStarted} />
        <div className="scanner-hint">Karte mit QR-Code vor die Kamera halten</div>
      </div>

      <div className="scanner-bar no-print">
        <div className="segmented" role="radiogroup" aria-label="Scan-Modus">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={settings.scanMode === m.value}
              className={settings.scanMode === m.value ? 'active' : ''}
              onClick={() => void saveSettings({ scanMode: m.value })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <CameraSelect
          value={settings.camera}
          onChange={(camera) => void saveSettings({ camera })}
          refreshKey={cameraStarts}
          className="camera-select"
        />
        <span className="present-count">
          Anwesend: <strong>{presentCount}</strong>
        </span>
      </div>

      {settings.testMode && <TestScanPanel onScan={(text) => void handleText(text, 'test')} />}

      {result && <ResultOverlay result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function ResultOverlay({ result, onClose }: { result: ScanOutcome; onClose: () => void }) {
  const { decision, card, group } = result;
  const holder = card?.holder;
  let tone: string;
  let title: string;
  let Icon = CheckIcon;
  if (decision.outcome === 'duplicate') {
    tone = 'warn';
    title = 'Bereits erfasst';
    Icon = AlertIcon;
  } else if (decision.outcome === 'denied') {
    tone = 'deny';
    title = 'Kein Zutritt';
    Icon = CrossIcon;
  } else if (decision.direction === 'out') {
    tone = 'out';
    title = 'Auf Wiedersehen';
    Icon = ExitIcon;
  } else {
    tone = 'ok';
    title = 'Willkommen';
  }

  let detail: string;
  if (decision.outcome === 'granted') {
    detail = `${directionText(decision.direction)} gebucht · ${formatTime(result.at)} Uhr`;
  } else if (decision.outcome === 'duplicate') {
    detail = `${directionText(decision.direction)} wurde vor ${decision.secondsSinceLast ?? 0} s gebucht – Scan ignoriert.`;
  } else {
    detail = reasonText(decision.reason, card);
  }

  return (
    <div className={`result-overlay result-${tone}`} role="alert" onClick={onClose}>
      <div className="result-head">
        <Icon className="result-icon" />
        <span className="result-title">{title}</span>
      </div>
      {card && <HolderPhoto holder={holder} fallback={card.number} className="result-photo" />}
      {card && <div className="result-name">{holder ? holderName(holder) : `Karte ${card.number}`}</div>}
      {card && (
        <div className="result-id">
          <GroupBadge group={group} className="result-group" /> {holder ? `Karte ${card.number}` : ''}
          {holder?.company ? ` · ${holder.company}` : ''}
        </div>
      )}
      <div className="result-detail">{detail}</div>
      <div className="result-dismiss">Tippen zum Schließen</div>
    </div>
  );
}

/** Nur im Testmodus: Scans ohne zweiten Bildschirm oder gedruckten Ausweis simulieren. */
function TestScanPanel({ onScan }: { onScan: (text: string) => void }) {
  const cards = useLiveQuery(listCards, [], []);
  const [selected, setSelected] = useState('');
  const current = cards.find(({ card }) => card.id === selected) ?? cards[0];

  return (
    <details className="test-panel no-print">
      <summary>Testmodus: Scan simulieren</summary>
      {cards.length === 0 ? (
        <p>Noch keine Karten vorhanden. Unter „Karten“ können Testkarten erzeugt werden.</p>
      ) : (
        <div className="button-row">
          <select value={current?.card.id ?? ''} onChange={(e) => setSelected(e.target.value)} aria-label="Karte für Testscan">
            {cards.map(({ card, group }) => (
              <option key={card.id} value={card.id}>
                {card.number} – {card.holder ? holderName(card.holder) : 'frei'} ({group?.name ?? '?'})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => current && onScan(encodeCardPayload(current.card.token))}>
            Karte scannen
          </button>
          <button type="button" className="btn" onClick={() => onScan('https://example.com/kein-ausweis')}>
            Fremder QR-Code
          </button>
        </div>
      )}
    </details>
  );
}
