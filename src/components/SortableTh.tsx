import type { SortState } from '../hooks/useSort';

interface Props<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  className?: string;
}

/** Tabellenkopf, der per Klick nach dieser Spalte sortiert. */
export function SortableTh<K extends string>({ label, sortKey, sort, className }: Props<K>) {
  const active = sort.key === sortKey;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={active ? 'th-sort active' : 'th-sort'} onClick={() => sort.toggle(sortKey)}>
        {label}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
