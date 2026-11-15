import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EventTable } from '../components/EventTable';
import { EventFilters, StatusFilters } from '../components/Filters';
import { StatusTable } from '../components/StatusTable';
import { checkOutAll } from '../db/cards';
import { csvFilename, eventsToCsv, statusToCsv } from '../domain/csv';
import { downloadText } from '../lib/download';
import { listGroups } from '../db/groups';
import {
  DEFAULT_EVENT_FILTER,
  DEFAULT_STATUS_FILTER,
  filterStatusRows,
  rangeLabel,
  sortEvents,
  sortStatusRows,
  type EventFilter,
  type EventSortKey,
  type StatusFilter,
  type StatusSortKey,
} from '../domain/overview';
import { useFilteredEvents, useStatusRows } from '../hooks/useOverviewData';
import { useSort } from '../hooks/useSort';

type Tab = 'anwesenheit' | 'aktionen';

export function OverviewPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('ansicht') === 'aktionen' ? 'aktionen' : 'anwesenheit';
  const groups = useLiveQuery(listGroups, [], []);

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1>Übersicht</h1>
      </header>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'anwesenheit'}
          className={tab === 'anwesenheit' ? 'tab active' : 'tab'}
          onClick={() => setParams({}, { replace: true })}
        >
          Anwesenheit
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'aktionen'}
          className={tab === 'aktionen' ? 'tab active' : 'tab'}
          onClick={() => setParams({ ansicht: 'aktionen' }, { replace: true })}
        >
          Aktionen
        </button>
      </div>
      {tab === 'anwesenheit' ? <PresenceTab groups={groups} /> : <EventsTab groups={groups} />}
    </div>
  );
}

function PresenceTab({ groups }: { groups: Awaited<ReturnType<typeof listGroups>> }) {
  const rows = useStatusRows();
  const [filter, setFilter] = useState<StatusFilter>(DEFAULT_STATUS_FILTER);
  const sort = useSort<StatusSortKey>('status', 'asc', { time: 'desc' });
  const filtered = useMemo(() => (rows ? filterStatusRows(rows, filter) : []), [rows, filter]);
  const [message, setMessage] = useState<string | null>(null);
  if (!rows) return null;

  const assigned = rows.filter((r) => r.card.hasHolder || r.present);
  const presentCount = assigned.filter((r) => r.present).length;

  const onCheckOutAll = async () => {
    if (!window.confirm(`Alle ${presentCount} anwesenden Personen jetzt ausbuchen?`)) return;
    const n = await checkOutAll();
    setMessage(`${n} Person(en) ausgebucht.`);
  };

  return (
    <section>
      <div className="summary-chips">
        <button type="button" className={filter.status === 'present' ? 'chip chip-present active' : 'chip chip-present'} onClick={() => setFilter({ ...filter, status: filter.status === 'present' ? 'all' : 'present' })}>
          <strong>{presentCount}</strong> anwesend
        </button>
        <button type="button" className={filter.status === 'absent' ? 'chip active' : 'chip'} onClick={() => setFilter({ ...filter, status: filter.status === 'absent' ? 'all' : 'absent' })}>
          <strong>{assigned.length - presentCount}</strong> abwesend
        </button>
        {presentCount > 0 && (
          <button type="button" className="btn btn-small chip-action" onClick={() => void onCheckOutAll()}>
            Alle ausbuchen
          </button>
        )}
      </div>
      {message && <p className="form-success">{message}</p>}
      <StatusFilters value={filter} onChange={setFilter} groups={groups} />
      <div className="list-toolbar">
        <p className="muted small">{filtered.length} Person(en) · Spaltenköpfe antippen zum Sortieren · Zeile antippen öffnet die Karte</p>
        <CsvButton
          disabled={filtered.length === 0}
          onExport={() => downloadText(statusToCsv(sortStatusRows(filtered, sort.key, sort.dir)), csvFilename('anwesenheit'))}
        />
      </div>
      <StatusTable rows={filtered} sort={sort} />
    </section>
  );
}

function EventsTab({ groups }: { groups: Awaited<ReturnType<typeof listGroups>> }) {
  const [filter, setFilter] = useState<EventFilter>(DEFAULT_EVENT_FILTER);
  const sort = useSort<EventSortKey>('time', 'desc', { time: 'desc' });
  const [limit, setLimit] = useState(100);
  const { events, loading } = useFilteredEvents(filter);
  const denied = events.filter((e) => e.outcome === 'denied').length;

  return (
    <section>
      <EventFilters
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setLimit(100);
        }}
        groups={groups}
      />
      <div className="list-toolbar">
        <p className="muted small">
          {loading ? 'Lädt …' : `${events.length} Aktion(en) · ${rangeLabel(filter, new Date())}${denied ? ` · davon ${denied} abgewiesen` : ''}`}
        </p>
        <CsvButton
          disabled={events.length === 0}
          onExport={() => downloadText(eventsToCsv(sortEvents(events, sort.key, sort.dir)), csvFilename('aktionen'))}
        />
      </div>
      {!loading && <EventTable events={events} groups={groups} sort={sort} limit={limit} onMore={() => setLimit((l) => l + 100)} />}
    </section>
  );
}

/** Exportiert die aktuell gefilterte und sortierte Liste als CSV (für Excel). */
function CsvButton({ onExport, disabled }: { onExport: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className="btn btn-small"
      disabled={disabled}
      onClick={onExport}
      title="Exportiert die angezeigte Liste. Achtung: CSV-Dateien sind nicht verschlüsselt."
    >
      CSV-Export (Excel)
    </button>
  );
}
