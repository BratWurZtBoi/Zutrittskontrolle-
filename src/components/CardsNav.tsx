import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { db } from '../db/db';
import { countUnassigned } from '../db/unassigned';

export type CardsTab = 'cards' | 'unassigned' | 'import' | 'print';

/** Reiter des Karten-Bereichs: Karten | Nicht zugeordnet | CSV-Import | Drucken. */
export function CardsNav({ active }: { active: CardsTab }) {
  const cards = useLiveQuery(() => db.cards.count(), [], 0);
  const unassigned = useLiveQuery(countUnassigned, [], 0);
  const tabs: { id: CardsTab; to: string; label: string; count?: number; danger?: boolean; hidden?: boolean }[] = [
    { id: 'cards', to: '/karten', label: 'Karten', count: cards },
    { id: 'unassigned', to: '/karten?ansicht=nicht-zugeordnet', label: 'Nicht zugeordnet', count: unassigned, danger: unassigned > 0, hidden: unassigned === 0 && active !== 'unassigned' },
    { id: 'import', to: '/karten/import', label: 'CSV-Import' },
    { id: 'print', to: '/druck', label: 'Drucken' },
  ];
  return (
    <nav className="tabs card-tabs no-print" aria-label="Karten-Bereich">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <Link key={t.id} to={t.to} className={t.id === active ? 'tab active' : 'tab'} aria-current={t.id === active ? 'page' : undefined}>
            {t.label}
            {t.count !== undefined && <span className={t.danger ? 'count-pill count-denied' : 'count-pill'}>{t.count}</span>}
          </Link>
        ))}
    </nav>
  );
}
