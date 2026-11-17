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
  holdersByCard,
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
import { useSecurity } from '../security/useSecurity';

type Tab = 'anwesenheit' | 'protokoll';

/** Zeiträume, die per Adresse übergeben werden dürfen (z. B. vom Dashboard). */
const RANGE_PARAMS = ['today', 'yesterday', '7d', '30d', 'all'] as const;

/**
 * Auswertung: Anwesenheit und Protokoll mit Suche, Filtern, Sortierung und CSV-Export.
 * Adresse: #/auswertung?ansicht=protokoll&suche=…&gruppe=…&zeitraum=7d
 */
export function OverviewPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('ansicht');
  const tab: Tab = view === 'protokoll' || view === 'aktionen' ? 'protokoll' : 'anwesenheit';
  const range = params.get('zeitraum');
  const initialEvents: EventFilter = {
    ...DEFAULT_EVENT_FILTER,
    query: params.get('suche') ?? '',
    groupId: params.get('gruppe') ?? '',
    range: RANGE_PARAMS.find((r) => r === range) ?? DEFAULT_EVENT_FILTER.range,
  };
  const groups = useLiveQuery(listGroups, [], []);
  // Bediener: ansehen und „Alle ausbuchen“ ja – Export und Kartendetails nur für den Admin
  const { admin } = useSecurity();

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1>Auswertung</h1>
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
          aria-selected={tab === 'protokoll'}
          className={tab === 'protokoll' ? 'tab active' : 'tab'}
          onClick={() => setParams({ ansicht: 'protokoll' }, { replace: true })}
        >
          Protokoll
        </button>
      </div>
      {tab === 'anwesenheit' ? <PresenceTab groups={groups} admin={admin} /> : <EventsTab groups={groups} admin={admin} initial={initialEvents} />}
    </div>
  );
}

function PresenceTab({ groups, admin }: { groups: Awaited<ReturnType<typeof listGroups>>; admin: boolean }) {
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
      <StatusFilters value={filter} onChange={setFilter} groups={groups} holders={rows?.map((r) => r.card.holder) ?? []} />
      <div className="list-toolbar">
        <p className="muted small">
          {filtered.length} Person(en) · Spaltenköpfe antippen zum Sortieren{admin ? ' · Zeile antippen öffnet die Karte' : ''}
        </p>
        {admin && (
          <CsvButton
            disabled={filtered.length === 0}
            onExport={() => downloadText(statusToCsv(sortStatusRows(filtered, sort.key, sort.dir)), csvFilename('anwesenheit'))}
          />
        )}
      </div>
      <StatusTable rows={filtered} sort={sort} linkRows={admin} />
    </section>
  );
}

function EventsTab({ groups, admin, initial }: { groups: Awaited<ReturnType<typeof listGroups>>; admin: boolean; initial: EventFilter }) {
  const [filter, setFilter] = useState<EventFilter>(initial);
  const sort = useSort<EventSortKey>('time', 'desc', { time: 'desc' });
  const [limit, setLimit] = useState(100);
  const rows = useStatusRows();
  const holders = useMemo(() => (rows ? holdersByCard(rows) : undefined), [rows]);
  const { events, loading } = useFilteredEvents(filter, holders);
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
        holders={[...(holders?.values() ?? [])]}
      />
      <div className="list-toolbar">
        <p className="muted small">
          {loading ? 'Lädt …' : `${events.length} Eintrag/Einträge · ${rangeLabel(filter, new Date())}${denied ? ` · davon ${denied} abgewiesen` : ''}`}
        </p>
        {admin && (
          <CsvButton
            disabled={events.length === 0}
            onExport={() => downloadText(eventsToCsv(sortEvents(events, sort.key, sort.dir)), csvFilename('protokoll'))}
          />
        )}
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
