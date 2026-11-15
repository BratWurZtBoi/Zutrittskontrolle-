import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useState } from 'react';
import { CameraSelect } from '../components/CameraSelect';
import { DashStatusBar } from '../components/DashStatusBar';
import { EventTable } from '../components/EventTable';
import { PendingPanel, usePendingShortcuts } from '../components/PendingPanel';
import { ResultPanel } from '../components/ScanResult';
import { StatusTable } from '../components/StatusTable';
import { TestScanPanel } from '../components/TestScanPanel';
import { listGroups } from '../db/groups';
import { saveSettings, type AppSettings, type DashCameraSize } from '../db/settings';
import { formatTime } from '../domain/dates';
import {
  DEFAULT_EVENT_FILTER,
  filterEvents,
  filterStatusRows,
  type EventFilter,
  type EventSortKey,
  type RangePreset,
  type StatusFilter,
  type StatusSortKey,
} from '../domain/overview';
import { reasonText } from '../domain/texts';
import type { Group } from '../domain/types';
import { useDashboardStats, useRecentScans } from '../hooks/useDashboardData';
import { useRangeEvents, useStatusRows } from '../hooks/useOverviewData';
import { useKeepScreenOn, useScanProcessor } from '../hooks/useScanProcessor';
import { useSort } from '../hooks/useSort';
import { CameraScanner } from '../scanner/CameraScanner';
import { useSecurity } from '../security/useSecurity';

type DashTab = 'presence' | 'events' | 'denied';

/**
 * Dashboard für den Empfang (Windows-Rechner): Statusleiste, kleine Kamera mit
 * Scan-Ergebnis links, rechts eine Liste mit Reitern. Nur die Seite scrollt.
 */
export function DashboardPage() {
  const { settings, result, handleText, onCamera, pending, resolvePending } = useScanProcessor({ confirm: true });
  usePendingShortcuts(pending, resolvePending);
  useKeepScreenOn();
  const { admin } = useSecurity();
  const groups = useLiveQuery(listGroups, [], []);
  const stats = useDashboardStats();
  const [tab, setTab] = useState<DashTab>('presence');

  return (
    <div className={`dashboard dash-cam-${settings.dashCamera}`}>
      <DashStatusBar settings={settings} stats={stats} groups={groups} onShow={setTab} />
      <aside className="dash-side" aria-label="Scanner">
        <DashCamera settings={settings} onCode={onCamera} />
        <PendingPanel pending={pending} onResolve={(id, action) => void resolvePending(id, action)} />
        <ResultPanel result={result} highlightSec={settings.resultDisplaySec} />
        <RecentScans />
        {settings.testMode && admin && <TestScanPanel onScan={(text) => void handleText(text, 'test')} />}
      </aside>
      <DashList tab={tab} onTab={setTab} groups={groups} linkRows={admin} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kamera
// ---------------------------------------------------------------------------

const CAMERA_SIZES: { value: DashCameraSize; label: string }[] = [
  { value: 'small', label: 'Klein' },
  { value: 'large', label: 'Groß' },
  { value: 'hidden', label: 'Aus' },
];

function DashCamera({ settings, onCode }: { settings: AppSettings; onCode: (text: string) => void }) {
  const [cameraStarts, setCameraStarts] = useState(0);
  const onStarted = useCallback(() => setCameraStarts((n) => n + 1), []);
  const mirror = settings.mirrorPreview && settings.camera !== 'environment';
  const hidden = settings.dashCamera === 'hidden';

  return (
    <section className="dash-cam" aria-label="Kamera">
      <div className="dash-cam-view">
        <CameraScanner camera={settings.camera} mirror={mirror} onCode={onCode} onStarted={onStarted} />
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Letzte Scans
// ---------------------------------------------------------------------------

function RecentScans() {
  const events = useRecentScans(5);
  if (events.length === 0) return null;
  return (
    <section className="dash-recent" aria-label="Letzte Scans">
      <h2>Letzte Scans</h2>
      <ul>
        {events.map((e) => {
          const denied = e.outcome === 'denied';
          const label = denied ? '✕' : e.direction === 'out' ? '← Aus' : '→ Ein';
          const who = e.holderName ?? (e.cardNumber ? `Karte ${e.cardNumber}` : 'Unbekannter Code');
          return (
            <li key={e.seq}>
              <time>{formatTime(e.timestamp)}</time>
              <span className={denied ? 'recent-deny' : e.direction === 'out' ? 'recent-out' : 'recent-in'}>{label}</span>
              <span className="recent-text">
                {who}
                {denied && <span className="muted"> – {reasonText(e.reason)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Liste mit Reitern
// ---------------------------------------------------------------------------

const RANGES: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Heute' },
  { value: 'yesterday', label: 'Gestern' },
  { value: '7d', label: 'Letzte 7 Tage' },
  { value: '30d', label: 'Letzte 30 Tage' },
  { value: 'all', label: 'Gesamter Zeitraum' },
];

interface DashListProps {
  tab: DashTab;
  onTab: (t: DashTab) => void;
  groups: Group[];
  /** Zeilen öffnen die Karte (nur für den Admin). */
  linkRows: boolean;
}

function DashList({ tab, onTab, groups, linkRows }: DashListProps) {
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
  const presenceRows = useMemo(
    () => (rows ? filterStatusRows(rows, { query, groupId, status: presenceStatus, includeFree: false }) : []),
    [rows, query, groupId, presenceStatus],
  );
  const presentCount = presenceRows.filter((r) => r.present).length;

  const raw = useRangeEvents({ range: events.range });
  const baseEvents = useMemo(
    () => (raw ? filterEvents(raw, { query, groupId, range: events.range, direction: events.direction, outcome: 'all' }, new Date()) : []),
    [raw, query, groupId, events.range, events.direction],
  );
  const allEvents = events.outcome === 'all' ? baseEvents : baseEvents.filter((e) => e.outcome === events.outcome);
  const deniedEvents = baseEvents.filter((e) => e.outcome === 'denied');

  const presenceSort = useSort<StatusSortKey>('time', 'desc', { time: 'desc' });
  const eventSort = useSort<EventSortKey>('time', 'desc', { time: 'desc' });

  const extraActive =
    tab === 'presence' ? presenceStatus !== 'present' : events.range !== 'today' || events.direction !== 'all' || (tab === 'events' && events.outcome !== 'all');
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
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen: Name, Firma, Karte …"
          aria-label="Suchen"
        />
        <div className="group-chips" role="radiogroup" aria-label="Gruppe">
          <button type="button" role="radio" aria-checked={groupId === ''} className={groupId === '' ? 'chip active' : 'chip'} onClick={() => setGroupId('')}>
            Alle
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={groupId === g.id}
              className={groupId === g.id ? 'chip active' : 'chip'}
              onClick={() => setGroupId(groupId === g.id ? '' : g.id)}
            >
              <span className="color-dot" style={{ background: g.color }} />
              {g.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={extraActive ? 'btn btn-small filter-toggle active' : 'btn btn-small filter-toggle'}
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
        >
          Weitere Filter {extraActive ? '●' : ''} {showMore ? '▴' : '▾'}
        </button>
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
          <span className="muted small">Ausführliche Auswertung und CSV-Export unter „Übersicht“.</span>
        </div>
      )}

      <div role="tabpanel" className="dash-list-body">
        {tab === 'presence' ? (
          rows && <StatusTable rows={presenceRows} sort={presenceSort} compact showStatus={presenceStatus !== 'present'} linkRows={linkRows} />
        ) : (
          raw && (
            <EventTable
              events={tab === 'denied' ? deniedEvents : allEvents}
              groups={groups}
              sort={eventSort}
              limit={limit}
              onMore={() => setLimit((l) => l + 100)}
              compact
            />
          )
        )}
      </div>
    </section>
  );
}
