import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraSelect } from '../components/CameraSelect';
import { DashStatusBar } from '../components/DashStatusBar';
import { EventTable } from '../components/EventTable';
import { GroupChips } from '../components/GroupChips';
import { PendingPanel, usePendingShortcuts } from '../components/PendingPanel';
import { ResultPanel } from '../components/ScanResult';
import { ScannerInactiveNote } from '../components/ScannerStatus';
import { StatusTable } from '../components/StatusTable';
import { TestScanPanel } from '../components/TestScanPanel';
import { VisitorDialog } from '../components/VisitorDialog';
import { returnCard } from '../db/cards';
import { listGroups } from '../db/groups';
import { saveSettings, type AppSettings, type DashCameraSize, type ScanInput } from '../db/settings';
import {
  countByGroupId,
  DEFAULT_EVENT_FILTER,
  filterEvents,
  filterStatusRows,
  holdersByCard,
  type EventFilter,
  type EventSortKey,
  type RangePreset,
  type StatusFilter,
  type StatusSortKey,
  undoableSeqs,
} from '../domain/overview';
import { holderName } from '../domain/texts';
import type { Direction, Group } from '../domain/types';
import { useDashboardStats } from '../hooks/useDashboardData';
import { useRangeEvents, useStatusRows } from '../hooks/useOverviewData';
import { useScannerInput, type KeyboardScan } from '../hooks/useKeyboardScanner';
import { useKeepScreenOn, useScanProcessor } from '../hooks/useScanProcessor';
import { useLoadedSettings } from '../hooks/useSettings';
import { useSort } from '../hooks/useSort';
import { CameraScanner } from '../scanner/CameraScanner';
import { useSecurity } from '../security/useSecurity';

type DashTab = 'presence' | 'events' | 'denied';

/**
 * Dashboard für den Empfang (Windows-Rechner): Statusleiste, kleine Kamera mit
 * Scan-Ergebnis links, rechts eine Liste mit Reitern. Nur die Seite scrollt.
 */
export function DashboardPage() {
  const { settings, result, handleText, onCamera, onScanner, pending, resolvePending, bookCard, undo } = useScanProcessor({ confirm: true });
  const [visitorOpen, setVisitorOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  usePendingShortcuts(pending, resolvePending, !visitorOpen);
  // Während der Besucher-Erfassung gehen Kamera-Scans an das Fenster (Karte auswählen)
  const scanTarget = useRef<((text: string) => void) | null>(null);
  const registerScanTarget = useCallback((h: ((text: string) => void) | null) => {
    scanTarget.current = h;
  }, []);
  const onCameraRouted = useCallback((text: string) => (scanTarget.current ? scanTarget.current(text) : onCamera(text)), [onCamera]);
  const onScannerRouted = useCallback(
    (scan: KeyboardScan) => (scanTarget.current ? scanTarget.current(scan.payload ?? scan.raw) : onScanner(scan)),
    [onScanner],
  );
  // Kamera erst starten, wenn feststeht, dass sie gebraucht wird
  const scanInput = useLoadedSettings()?.scanInput;
  const scanner = useScannerInput(onScannerRouted, {
    enabled: scanInput !== 'camera', // schon während des Ladens – sonst gehen frühe Scans verloren
    speed: settings.scannerSpeed,
  });
  useKeepScreenOn();
  const { admin } = useSecurity();
  const [undoError, setUndoError] = useState<string | null>(null);
  const onUndo = async (seq: number) => setUndoError(await undo(seq));
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(t);
  }, [notice]);
  useEffect(() => setUndoError(null), [result]);
  const groups = useLiveQuery(listGroups, [], []);
  const stats = useDashboardStats();
  const [tab, setTab] = useState<DashTab>('presence');

  return (
    <div className={`dashboard dash-cam-${settings.dashCamera}`}>
      <DashStatusBar settings={settings} stats={stats} groups={groups} onShow={setTab} onRegisterVisitor={() => setVisitorOpen(true)} />
      {visitorOpen && (
        <VisitorDialog
          groups={groups}
          registerScanTarget={registerScanTarget}
          onClose={() => setVisitorOpen(false)}
          onDone={(cardId, checkIn, label) => {
            setVisitorOpen(false);
            setNotice(`Besucher angemeldet: ${label}`);
            if (checkIn) void bookCard(cardId, 'in');
          }}
        />
      )}
      <aside className="dash-side" aria-label="Scanner">
        {scanInput === 'scanner' ? (
          <DashScanner reachable={scanner.inputReachable} />
        ) : (
          <DashCamera
            settings={settings}
            scanInput={scanInput}
            onCode={onCameraRouted}
            scannerWarning={scanInput === 'both' && scanner.seen && !scanner.inputReachable}
          />
        )}
        <PendingPanel pending={pending} onResolve={(id, action) => void resolvePending(id, action)} />
        {notice && (
          <p className="dash-notice" role="status">
            {notice}
          </p>
        )}
        <ResultPanel result={result} highlightSec={settings.resultDisplaySec} onUndo={(seq) => void onUndo(seq)} undoError={undoError} />
        {settings.testMode && admin && <TestScanPanel onScan={(text) => void handleText(text, 'test')} />}
      </aside>
      <DashList
        tab={tab}
        onTab={setTab}
        groups={groups}
        linkRows={admin}
        onBook={(cardId, direction) => void bookCard(cardId, direction)}
        onUndo={(seq) => void onUndo(seq)}
        onReturn={(cardId, label) => {
          if (!window.confirm(`Karte von ${label} zurückgeben? Die Person wird ausgebucht und die Personendaten werden entfernt.`)) return;
          void returnCard(cardId).then(() => setNotice(`Karte zurückgegeben: ${label}`));
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kamera
// ---------------------------------------------------------------------------

const CAMERA_SIZES: { value: DashCameraSize; label: string }[] = [
  { value: 'small', label: 'Klein' },
  { value: 'large', label: 'Groß' },
  { value: 'hidden', label: 'Vorschau aus' },
];

interface DashCameraProps {
  settings: AppSettings;
  /** undefined = Einstellungen werden noch geladen (Kamera noch nicht starten). */
  scanInput: ScanInput | undefined;
  onCode: (text: string) => void;
  /** Ein USB-Scanner wird benutzt, aber das Fenster bekommt gerade keine Eingaben. */
  scannerWarning: boolean;
}

function DashCamera({ settings, scanInput, onCode, scannerWarning }: DashCameraProps) {
  const [cameraStarts, setCameraStarts] = useState(0);
  const onStarted = useCallback(() => setCameraStarts((n) => n + 1), []);
  const mirror = settings.mirrorPreview && settings.camera !== 'environment';
  const hidden = settings.dashCamera === 'hidden';

  return (
    <section className="dash-cam" aria-label="Kamera">
      <div className="dash-cam-view">
        {scanInput && <CameraScanner camera={settings.camera} mirror={mirror} onCode={onCode} onStarted={onStarted} />}
        {/* Vorschau nur abdecken – das Video läuft weiter, damit die Erkennung aktiv bleibt */}
        {hidden && (
          <div className="dash-cam-cover">
            <span className="status-dot present" /> Kamera aktiv – Vorschau ausgeblendet
          </div>
        )}
      </div>
      <div className="dash-cam-tools">
        <CameraSelect
          value={settings.camera}
          onChange={(camera) => void saveSettings({ camera })}
          refreshKey={cameraStarts}
          className="camera-select"
        />
        <div className="segmented segmented-small" role="radiogroup" aria-label="Kameravorschau">
          {CAMERA_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={settings.dashCamera === s.value}
              className={settings.dashCamera === s.value ? 'active' : ''}
              onClick={() => void saveSettings({ dashCamera: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {scannerWarning && <ScannerInactiveNote className="dash-scanner-note" />}
    </section>
  );
}

/** Nur USB-Scanner (Kamera aus): kompakte Statusanzeige. */
function DashScanner({ reachable }: { reachable: boolean }) {
  return (
    <section className="dash-cam dash-scanner" aria-label="Scanner">
      {reachable ? (
        <p className="dash-scanner-ready" role="status">
          <span className="status-dot present" /> USB-Scanner bereit – Karte vor den Scanner halten
        </p>
      ) : (
        <ScannerInactiveNote className="dash-scanner-note" />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Liste mit Reitern
// ---------------------------------------------------------------------------

/** Dashboard = laufender Betrieb; ältere Einträge stehen in der Auswertung. */
const RANGES: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Heute' },
  { value: 'yesterday', label: 'Gestern' },
];

interface DashListProps {
  tab: DashTab;
  onTab: (t: DashTab) => void;
  groups: Group[];
  /** Zeilen öffnen die Karte (nur für den Admin). */
  linkRows: boolean;
  /** Manuell buchen (Karte vergessen). */
  onBook: (cardId: string, direction: Direction) => void;
  /** Fehlbuchung rückgängig machen. */
  onUndo: (seq: number) => void;
  /** Besucherkarte zurückgeben (ausbuchen + Personendaten entfernen). */
  onReturn: (cardId: string, label: string) => void;
}

function DashList({ tab, onTab, groups, linkRows, onBook, onUndo, onReturn }: DashListProps) {
  // Suche und Gruppe gelten für alle Reiter
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [presenceStatus, setPresenceStatus] = useState<StatusFilter['status']>('present');
  const [events, setEvents] = useState<Pick<EventFilter, 'range' | 'direction' | 'outcome'>>({
    range: DEFAULT_EVENT_FILTER.range,
    direction: 'all',
    outcome: 'all',
  });
  const [limit, setLimit] = useState(100);

  const rows = useStatusRows();
  const holders = useMemo(() => (rows ? holdersByCard(rows) : undefined), [rows]);
  // Bei der Suche auch Abwesende zeigen – z. B. um jemanden ohne Karte manuell einzubuchen
  const effectiveStatus: StatusFilter['status'] = query.trim() ? 'all' : presenceStatus;
  // Erst ohne Gruppe filtern (für die Anzahl je Gruppe auf den Knöpfen), dann nach Gruppe
  const ungroupedRows = useMemo(
    () => (rows ? filterStatusRows(rows, { query, groupId: '', status: effectiveStatus, includeFree: false }) : []),
    [rows, query, effectiveStatus],
  );
  const presenceRows = useMemo(() => (groupId ? ungroupedRows.filter((r) => r.card.groupId === groupId) : ungroupedRows), [ungroupedRows, groupId]);
  const presentCount = presenceRows.filter((r) => r.present).length;

  const raw = useRangeEvents({ range: events.range });
  const ungroupedEvents = useMemo(
    () =>
      raw ? filterEvents(raw, { query, groupId: '', range: events.range, direction: events.direction, outcome: 'all' }, new Date(), holders) : [],
    [raw, query, events.range, events.direction, holders],
  );
  const baseEvents = groupId ? ungroupedEvents.filter((e) => e.groupId === groupId) : ungroupedEvents;
  const allEvents = events.outcome === 'all' ? baseEvents : baseEvents.filter((e) => e.outcome === events.outcome);
  const deniedEvents = baseEvents.filter((e) => e.outcome === 'denied');

  // Anzahl je Gruppe für den aktuellen Reiter
  const chipBase: { groupId?: string }[] =
    tab === 'presence'
      ? ungroupedRows.map((r) => ({ groupId: r.card.groupId }))
      : ungroupedEvents.filter((e) => (tab === 'denied' ? e.outcome === 'denied' : events.outcome === 'all' || e.outcome === events.outcome));
  const chipCounts = countByGroupId(chipBase.map((x) => x.groupId));
  const undoable = useMemo(() => undoableSeqs(raw ?? []), [raw]);

  const presenceSort = useSort<StatusSortKey>('time', 'desc', { time: 'desc' });
  const eventSort = useSort<EventSortKey>('time', 'desc', { time: 'desc' });

  const extraActive =
    tab === 'presence' ? effectiveStatus !== 'present' : events.range !== 'today' || events.direction !== 'all' || (tab === 'events' && events.outcome !== 'all');
  const rangeName = RANGES.find((r) => r.value === events.range)?.label ?? '';

  const tabs: { id: DashTab; label: string; count: number; danger?: boolean }[] = [
    { id: 'presence', label: 'Anwesend', count: presentCount },
    { id: 'events', label: events.range === 'today' ? 'Aktionen heute' : `Aktionen (${rangeName})`, count: allEvents.length },
    { id: 'denied', label: 'Abgewiesen', count: deniedEvents.length, danger: true },
  ];

  return (
    <section className="dash-list" aria-label="Listen">
      <div className="tabs dash-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => {
              onTab(t.id);
              setLimit(100);
            }}
          >
            {t.label}
            <span className={t.danger && t.count > 0 ? 'count-pill count-denied' : 'count-pill'}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="dash-toolbar">
        <div className="dash-toolbar-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen: Name, Dienstgrad, Einheit, Raum, Karte …"
            aria-label="Suchen"
          />
          <GroupChips groups={groups} counts={chipCounts} total={chipBase.length} value={groupId} onChange={setGroupId} />
          <button
            type="button"
            className={extraActive ? 'btn btn-small filter-toggle active' : 'btn btn-small filter-toggle'}
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
          >
            Weitere Filter {extraActive ? '●' : ''} {showMore ? '▴' : '▾'}
          </button>
        </div>
      </div>

      {showMore && (
        <div className="dash-more-filters">
          {tab === 'presence' ? (
            <select value={presenceStatus} onChange={(e) => setPresenceStatus(e.target.value as StatusFilter['status'])} aria-label="Status">
              <option value="present">Nur anwesend</option>
              <option value="all">Anwesend und abwesend</option>
              <option value="absent">Nur abwesend</option>
            </select>
          ) : (
            <>
              <select value={events.range} onChange={(e) => setEvents({ ...events, range: e.target.value as RangePreset })} aria-label="Zeitraum">
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {tab === 'events' && (
                <select
                  value={events.outcome}
                  onChange={(e) => setEvents({ ...events, outcome: e.target.value as EventFilter['outcome'] })}
                  aria-label="Ergebnis"
                >
                  <option value="all">Alle Ergebnisse</option>
                  <option value="granted">Nur erfolgreich</option>
                  <option value="denied">Nur abgewiesen</option>
                </select>
              )}
              <select
                value={events.direction}
                onChange={(e) => setEvents({ ...events, direction: e.target.value as EventFilter['direction'] })}
                aria-label="Richtung"
              >
                <option value="all">Ein- und Ausgang</option>
                <option value="in">Nur Eingang</option>
                <option value="out">Nur Ausgang</option>
              </select>
            </>
          )}
          <Link
            className="dash-more-link"
            to={`/auswertung?${new URLSearchParams({
              ansicht: tab === 'presence' ? 'anwesenheit' : 'protokoll',
              ...(query.trim() ? { suche: query.trim() } : {}),
              ...(groupId ? { gruppe: groupId } : {}),
              ...(tab === 'presence' ? {} : { zeitraum: '7d' }),
            }).toString()}`}
          >
            Ältere Einträge und CSV-Export in der Auswertung →
          </Link>
        </div>
      )}

      <div role="tabpanel" className="dash-list-body">
        {tab === 'presence' ? (
          rows && <StatusTable
              rows={presenceRows}
              sort={presenceSort}
              compact
              showStatus={effectiveStatus !== 'present'}
              linkRows={linkRows}
              onBook={(row) => {
                const direction: Direction = row.present ? 'out' : 'in';
                const name = row.card.holder ? holderName(row.card.holder) : `Karte ${row.card.number}`;
                if (window.confirm(`${name} manuell ${direction === 'in' ? 'einbuchen' : 'ausbuchen'}?`)) onBook(row.card.id, direction);
              }}
              onReturn={(row) =>
                onReturn(row.card.id, row.card.holder ? (holderName(row.card.holder) ?? '') : `Karte ${row.card.number}`)
              }
            />
        ) : (
          raw && (
            <EventTable
              events={tab === 'denied' ? deniedEvents : allEvents}
              groups={groups}
              sort={eventSort}
              limit={limit}
              onMore={() => setLimit((l) => l + 100)}
              compact
              undoable={undoable}
              onUndo={(seq) => {
                if (window.confirm('Diese Buchung rückgängig machen? Es wird eine Gegenbuchung („Korrektur“) eingetragen.')) onUndo(seq);
              }}
            />
          )
        )}
      </div>
    </section>
  );
}
