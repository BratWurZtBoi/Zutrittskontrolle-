import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertIcon, CameraSwitchIcon, CheckIcon, CrossIcon, ExitIcon } from '../components/Icons';
import { PersonPhoto } from '../components/PersonPhoto';
import { db } from '../db/db';
import { listPersons } from '../db/persons';
import { processScan, type ScanOutcome } from '../db/scans';
import { saveSettings } from '../db/settings';
import { encodeCardPayload } from '../domain/cardCode';
import { formatTime } from '../domain/dates';
import { ScanDeduper } from '../domain/scanDeduper';
import { directionText, reasonText } from '../domain/texts';
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
  const mirror = settings.mirrorPreview && settings.facingMode === 'user';

  return (
    <div className="scanner-page">
      <div className="scanner-stage">
        <CameraScanner facingMode={settings.facingMode} mirror={mirror} onCode={onCamera} />
        <div className="scanner-hint">Ausweis mit QR-Code vor die Kamera halten</div>
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
        <button
          type="button"
          className="btn"
          onClick={() => void saveSettings({ facingMode: settings.facingMode === 'user' ? 'environment' : 'user' })}
          title="Kamera wechseln"
        >
          <CameraSwitchIcon /> {settings.facingMode === 'user' ? 'Frontkamera' : 'Rückkamera'}
        </button>
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
  const { decision, person } = result;
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
    detail = reasonText(decision.reason, person);
  }

  return (
    <div className={`result-overlay result-${tone}`} role="alert" onClick={onClose}>
      <div className="result-head">
        <Icon className="result-icon" />
        <span className="result-title">{title}</span>
      </div>
      {person && <PersonPhoto person={person} className="result-photo" />}
      {person && (
        <div className="result-name">
          {person.firstName} {person.lastName}
        </div>
      )}
      {person && <div className="result-id">ID {person.personnelNo}</div>}
      <div className="result-detail">{detail}</div>
      <div className="result-dismiss">Tippen zum Schließen</div>
    </div>
  );
}

/** Nur im Testmodus: Scans ohne zweiten Bildschirm oder gedruckten Ausweis simulieren. */
function TestScanPanel({ onScan }: { onScan: (text: string) => void }) {
  const persons = useLiveQuery(listPersons, [], []);
  const [selected, setSelected] = useState('');
  const person = persons.find((p) => p.id === selected) ?? persons[0];

  return (
    <details className="test-panel no-print">
      <summary>Testmodus: Scan simulieren</summary>
      {persons.length === 0 ? (
        <p>Noch keine Personen angelegt. Unter „Personen“ können Testpersonen erzeugt werden.</p>
      ) : (
        <div className="button-row">
          <select value={person?.id ?? ''} onChange={(e) => setSelected(e.target.value)} aria-label="Person für Testscan">
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.lastName}, {p.firstName} ({p.personnelNo})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => person && onScan(encodeCardPayload(person.cardToken))}>
            Ausweis scannen
          </button>
          <button type="button" className="btn" onClick={() => onScan('https://example.com/kein-ausweis')}>
            Fremder QR-Code
          </button>
        </div>
      )}
    </details>
  );
}
