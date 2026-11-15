import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EventTable } from '../components/EventTable';
import { EventFilters, StatusFilters } from '../components/Filters';
import { ResultPanel } from '../components/ScanResult';
import { ScannerControls } from '../components/ScannerControls';
import { StatusTable } from '../components/StatusTable';
import { TestScanPanel } from '../components/TestScanPanel';
import { listGroups } from '../db/groups';
import {
  DEFAULT_EVENT_FILTER,
  DEFAULT_STATUS_FILTER,
  filterStatusRows,
  rangeLabel,
  type EventFilter,
  type EventSortKey,
  type StatusFilter,
  type StatusSortKey,
} from '../domain/overview';
import { useFilteredEvents, useStatusRows } from '../hooks/useOverviewData';
import { useKeepScreenOn, useScanProcessor } from '../hooks/useScanProcessor';
import { useSort } from '../hooks/useSort';
import { CameraScanner } from '../scanner/CameraScanner';

/**
 * Dashboard für Laptop/Tablet: Kamera mit Scan-Ergebnis, Anwesende und Aktionen
 * mit Filtern und Sortierung – alles auf einen Blick, aktualisiert sich live.
 */
export function DashboardPage() {
  const { settings, result, handleText, onCamera } = useScanProcessor();
  const [cameraStarts, setCameraStarts] = useState(0);
  const onStarted = useCallback(() => setCameraStarts((n) => n + 1), []);
  useKeepScreenOn();
  const groups = useLiveQuery(listGroups, [], []);
  const mirror = settings.mirrorPreview && settings.camera !== 'environment';

  return (
    <div className="dashboard">
      <section className="dash-panel dash-camera" aria-label="Scanner">
        <div className="dash-camera-view">
          <CameraScanner camera={settings.camera} mirror={mirror} onCode={onCamera} onStarted={onStarted} />
        </div>
        <ScannerControls settings={settings} cameraStarts={cameraStarts} />
        <ResultPanel result={result} highlightSec={settings.resultDisplaySec} />
        {settings.testMode && <TestScanPanel onScan={(text) => void handleText(text, 'test')} />}
      </section>
      <PresencePanel groups={groups} />
      <EventsPanel groups={groups} />
    </div>
  );
}

function PresencePanel({ groups }: { groups: Awaited<ReturnType<typeof listGroups>> }) {
  const rows = useStatusRows();
  const [filter, setFilter] = useState<StatusFilter>({ ...DEFAULT_STATUS_FILTER, status: 'present' });
  const sort = useSort<StatusSortKey>('time', 'desc', { time: 'desc' });
  const filtered = useMemo(() => (rows ? filterStatusRows(rows, filter) : []), [rows, filter]);
  const presentCount = rows?.filter((r) => r.present).length ?? 0;

  return (
    <section className="dash-panel dash-presence" aria-label="Anwesenheit">
      <header className="dash-head">
        <h2>
          Anwesend <span className="count-pill">{presentCount}</span>
        </h2>
        <Link to="/uebersicht" className="small">
          Alle Details
        </Link>
      </header>
      <StatusFilters value={filter} onChange={setFilter} groups={groups} showIncludeFree={false} />
      {rows && <StatusTable rows={filtered} sort={sort} compact />}
    </section>
  );
}

function EventsPanel({ groups }: { groups: Awaited<ReturnType<typeof listGroups>> }) {
  const [filter, setFilter] = useState<EventFilter>(DEFAULT_EVENT_FILTER);
  const sort = useSort<EventSortKey>('time', 'desc', { time: 'desc' });
  const [limit, setLimit] = useState(50);
  const { events, loading } = useFilteredEvents(filter);
  const denied = events.filter((e) => e.outcome === 'denied').length;

  return (
    <section className="dash-panel dash-events" aria-label="Aktionen">
      <header className="dash-head">
        <h2>
          Aktionen <span className="count-pill">{events.length}</span>
          {denied > 0 && <span className="count-pill count-denied">{denied} abgewiesen</span>}
        </h2>
        <span className="muted small">{rangeLabel(filter, new Date())}</span>
      </header>
      <EventFilters
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setLimit(50);
        }}
        groups={groups}
      />
      {!loading && <EventTable events={events} groups={groups} sort={sort} limit={limit} onMore={() => setLimit((l) => l + 50)} compact />}
    </section>
  );
}
