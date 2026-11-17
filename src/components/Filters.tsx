import type { EventFilter, RangePreset, StatusFilter } from '../domain/overview';
import type { CardHolder, Group } from '../domain/types';
import { HolderFieldSelects } from './HolderFieldSelects';

interface StatusProps {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
  groups: Group[];
  /** Personen für die Auswahlfilter Einheit, Stellung/Posten, Raum. */
  holders: (CardHolder | undefined)[];
  showIncludeFree?: boolean;
}

export function StatusFilters({ value, onChange, groups, holders, showIncludeFree = true }: StatusProps) {
  const set = (patch: Partial<StatusFilter>) => onChange({ ...value, ...patch });
  return (
    <div className="filter-bar filter-bar-status">
      <input
        type="search"
        placeholder="Suchen: Name, Dienstgrad, Einheit, Raum, Karte …"
        value={value.query}
        onChange={(e) => set({ query: e.target.value })}
        aria-label="Personen suchen"
      />
      <select value={value.status} onChange={(e) => set({ status: e.target.value as StatusFilter['status'] })} aria-label="Status">
        <option value="all">Anwesend und abwesend</option>
        <option value="present">Nur anwesend</option>
        <option value="absent">Nur abwesend</option>
      </select>
      <select value={value.groupId} onChange={(e) => set({ groupId: e.target.value })} aria-label="Gruppe">
        <option value="">Alle Gruppen</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <HolderFieldSelects holders={holders} value={value} onChange={(f) => set(f)} />
      {showIncludeFree && (
        <label className="checkbox-inline">
          <input type="checkbox" checked={value.includeFree} onChange={(e) => set({ includeFree: e.target.checked })} />
          freie Karten zeigen
        </label>
      )}
    </div>
  );
}

const RANGES: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Heute' },
  { value: 'yesterday', label: 'Gestern' },
  { value: '7d', label: 'Letzte 7 Tage' },
  { value: '30d', label: 'Letzte 30 Tage' },
  { value: 'all', label: 'Gesamter Zeitraum' },
  { value: 'custom', label: 'Zeitraum wählen …' },
];

interface EventProps {
  value: EventFilter;
  onChange: (value: EventFilter) => void;
  groups: Group[];
  /** Personen für die Auswahlfilter Einheit, Stellung/Posten, Raum. */
  holders: (CardHolder | undefined)[];
}

export function EventFilters({ value, onChange, groups, holders }: EventProps) {
  const set = (patch: Partial<EventFilter>) => onChange({ ...value, ...patch });
  return (
    <div className="filter-bar filter-bar-events">
      <input
        type="search"
        placeholder="Suchen: Name, Dienstgrad, Einheit, Raum, Karte …"
        value={value.query}
        onChange={(e) => set({ query: e.target.value })}
        aria-label="Aktionen suchen"
      />
      <select value={value.range} onChange={(e) => set({ range: e.target.value as RangePreset })} aria-label="Zeitraum">
        {RANGES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {value.range === 'custom' && (
        <div className="date-range">
          <input type="date" value={value.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="von" />
          <span>bis</span>
          <input type="date" value={value.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} aria-label="bis" />
        </div>
      )}
      <select value={value.outcome} onChange={(e) => set({ outcome: e.target.value as EventFilter['outcome'] })} aria-label="Ergebnis">
        <option value="all">Alle Ergebnisse</option>
        <option value="granted">Nur erfolgreich</option>
        <option value="denied">Nur abgewiesen</option>
      </select>
      <select value={value.direction} onChange={(e) => set({ direction: e.target.value as EventFilter['direction'] })} aria-label="Richtung">
        <option value="all">Ein- und Ausgang</option>
        <option value="in">Nur Eingang</option>
        <option value="out">Nur Ausgang</option>
      </select>
      <select value={value.groupId} onChange={(e) => set({ groupId: e.target.value })} aria-label="Gruppe der Aktion">
        <option value="">Alle Gruppen</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <HolderFieldSelects holders={holders} value={value} onChange={(f) => set(f)} />
    </div>
  );
}
