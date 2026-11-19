import { useMemo, useState } from 'react';
import { undoAdmission, undoCardAdmission } from '../../db/occasions';
import type { AppSettings } from '../../db/settings';
import { splitTopGroups } from '../../domain/overview';
import {
  cardAdmissions,
  NO_CATEGORY,
  filterGuests,
  guestCategories,
  guestListName,
  occasionStats,
  sortGuestsByName,
  type Guest,
  type Occasion,
  type OccasionLogEntry,
} from '../../domain/occasion';
import { formatIsoDate, formatTime } from '../../domain/dates';
import { reasonText } from '../../domain/texts';
import { StatusActions } from '../DashStatusBar';

export type EntryTab = 'admitted' | 'open' | 'denied';

interface StatusProps {
  occasion: Occasion;
  settings: AppSettings;
  guests: Guest[] | undefined;
  deniedCount: number;
  onShow: (tab: EntryTab) => void;
  onAddGuest: () => void;
}

/** Statusleiste im Einlass-Modus – gleiche starre Plätze wie die normale Statusleiste. */
export function EntryStatusBar({ occasion, settings, guests, deniedCount, onShow, onAddGuest }: StatusProps) {
  const stats = occasionStats(guests ?? []);
  const { shown, rest } = splitTopGroups(
    stats.perCategory.filter((c) => c.admitted > 0).map((c) => ({ ...c, count: c.admitted })),
    3,
  );
  const breakdown = stats.perCategory.map((c) => `${c.category}: ${c.admitted}/${c.invited}`).join(', ');
  return (
    <div className="dash-status entry-status no-print">
      <div className="ds-mode entry-name" style={{ borderColor: occasion.color }} title={occasion.name}>
        <span className="occasion-color" style={{ background: occasion.color }} />
        <span className="entry-name-text">
          <strong>{occasion.name}</strong>
          <span className="muted">{formatIsoDate(occasion.date)}</span>
        </span>
      </div>

      <button type="button" className="kpi ds-present" onClick={() => onShow('admitted')} title={breakdown || undefined}>
        <span className="kpi-label">Eingelassen</span>
        <strong className="kpi-value" data-testid="kpi-admitted">
          {guests ? stats.admitted : '–'}
        </strong>
        <span className="kpi-label">
          von {guests ? stats.invited : '–'} · {stats.rate} %
        </span>
        <span className="kpi-groups">
          {shown.map((c) => (
            <span key={c.category} className="kpi-group">
              <span className="kpi-group-count">{c.admitted}</span>
              <span className="kpi-group-name">{c.category}</span>
            </span>
          ))}
          {rest.length > 0 && (
            <span className="kpi-more">
              +{rest.length}
              <span className="kpi-more-word"> weitere</span>
            </span>
          )}
        </span>
      </button>

      <button type="button" className="kpi ds-today" onClick={() => onShow('open')}>
        <span className="kpi-label">Noch offen</span>
        <strong className="kpi-value" data-testid="kpi-open">
          {guests ? stats.open : '–'}
        </strong>
      </button>

      <button type="button" className={deniedCount > 0 ? 'kpi ds-denied kpi-denied' : 'kpi ds-denied'} onClick={() => onShow('denied')}>
        <strong className="kpi-value">{deniedCount}</strong>
        <span className="kpi-label">abgewiesen</span>
      </button>

      <button type="button" className="btn btn-primary btn-small ds-visitor" onClick={onAddGuest}>
        + Gast nachtragen
      </button>

      <StatusActions settings={settings} />
    </div>
  );
}

interface ListProps {
  occasion: Occasion;
  tab: EntryTab;
  onTab: (tab: EntryTab) => void;
  guests: Guest[] | undefined;
  log: OccasionLogEntry[] | undefined;
  onAdmit: (guest: Guest) => void;
}

/** Liste im Einlass-Modus: Eingelassen | Noch offen | Abgewiesen. Suche und Kategorie gelten für alle Reiter. */
export function EntryList({ occasion, tab, onTab, guests, log, onAdmit }: ListProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const all = guests ?? [];
  const categories = guestCategories(all);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => filterGuests(all, { query, status: 'all', category }), [all, query, category]);
  const admitted = filtered.filter((g) => g.admittedAt !== undefined && !g.cancelled).sort((a, b) => b.admittedAt! - a.admittedAt!);
  const open = sortGuestsByName(filtered.filter((g) => g.admittedAt === undefined && !g.cancelled));
  // Mit Dienstausweis eingelassen (ohne Gästeliste): je Karte der aktuelle Einlass, neueste zuerst
  const cardEntries = useMemo(() => [...cardAdmissions(log ?? []).values()].sort((a, b) => b.timestamp - a.timestamp), [log]);
  const cards = category ? [] : cardEntries.filter((e) => !q || `${e.name ?? ''} ${e.cardNumber ?? ''} ${e.category ?? ''}`.toLowerCase().includes(q));
  const denied = (log ?? []).filter(
    (e) =>
      e.outcome === 'denied' &&
      (!category || (e.category?.trim() || NO_CATEGORY) === category) &&
      (!q || `${e.name ?? ''} ${e.cardNumber ?? ''} ${e.guestNumber ?? ''}`.toLowerCase().includes(q)),
  );
  const tabs: { id: EntryTab; label: string; count: number; danger?: boolean }[] = [
    { id: 'admitted', label: 'Eingelassen', count: admitted.length + cards.length },
    { id: 'open', label: 'Noch offen', count: open.length },
    { id: 'denied', label: 'Abgewiesen', count: denied.length, danger: true },
  ];

  return (
    <section className="dash-list" aria-label="Einlass">
      <div className="tabs dash-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => onTab(t.id)}>
            {t.label}
            <span className={t.danger && t.count > 0 ? 'count-pill count-denied' : 'count-pill'}>{t.count}</span>
          </button>
        ))}
      </div>
      <div className="dash-toolbar">
        <div className="dash-toolbar-row entry-toolbar">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen: Name, Einheit/Firma, Nr. …" aria-label="Gäste suchen" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategorie">
            <option value="">Alle Kategorien</option>
            {[...categories, ...(all.some((g) => !g.category) ? [NO_CATEGORY] : [])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div role="tabpanel" className="dash-list-body">
        {!guests ? null : tab === 'admitted' ? (
          admitted.length + cards.length === 0 ? (
            <p className="muted empty-note">Noch niemand eingelassen.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table compact one-line">
                <thead>
                  <tr>
                    <th aria-label="Kategorie" className="group-bar-cell" />
                    <th className="th-plain">Zeit</th>
                    <th className="th-plain">Name</th>
                    <th className="th-plain col-optional">Einheit/Firma</th>
                    <th className="th-plain">Kategorie</th>
                    <th className="th-plain" aria-label="Aktion" />
                  </tr>
                </thead>
                <tbody>
                  {admitted.map((g) => (
                    <tr key={g.id}>
                      <td className="group-bar-cell">
                        <span className="group-bar" style={{ background: occasion.color }} />
                      </td>
                      <td>{formatTime(g.admittedAt!)}</td>
                      <td className="cell-strong">{guestListName(g)}</td>
                      <td className="muted cell-ellipsis col-optional">{g.person?.company ?? ''}</td>
                      <td>{g.category ?? ''}</td>
                      <td className="cell-action">
                        <button
                          type="button"
                          className="btn btn-small"
                          title="Fehlbedienung: Einladung gilt danach wieder"
                          onClick={() => window.confirm(`Einlass von ${guestListName(g)} zurücknehmen?`) && void undoAdmission(g.id)}
                        >
                          Zurücknehmen
                        </button>
                      </td>
                    </tr>
                  ))}
                  {cards.map((e) => (
                    <tr key={`card-${e.cardId}`}>
                      <td className="group-bar-cell">
                        <span className="group-bar" />
                      </td>
                      <td>{formatTime(e.timestamp)}</td>
                      <td className="cell-strong">{e.name ?? (e.nameLocked ? '🔒 Name gesperrt' : `Karte ${e.cardNumber}`)}</td>
                      <td className="muted col-optional">Karte {e.cardNumber}</td>
                      <td>Dienstausweis</td>
                      <td className="cell-action">
                        <button
                          type="button"
                          className="btn btn-small"
                          title="Fehlbedienung: Ausweis gilt danach wieder"
                          onClick={() =>
                            window.confirm(`Einlass von ${e.name ?? `Karte ${e.cardNumber}`} zurücknehmen?`) && void undoCardAdmission(occasion.id, e.cardId!)
                          }
                        >
                          Zurücknehmen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'open' ? (
          open.length === 0 ? (
            <p className="muted empty-note">Alle Gäste sind da.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table compact one-line">
                <thead>
                  <tr>
                    <th className="th-plain">Nr.</th>
                    <th className="th-plain">Name</th>
                    <th className="th-plain col-optional">Einheit/Firma</th>
                    <th className="th-plain">Kategorie</th>
                    <th className="th-plain" aria-label="Aktion" />
                  </tr>
                </thead>
                <tbody>
                  {open.map((g) => (
                    <tr key={g.id}>
                      <td>{g.number}</td>
                      <td className="cell-strong">{guestListName(g)}</td>
                      <td className="muted cell-ellipsis col-optional">{g.person?.company ?? ''}</td>
                      <td>{g.category ?? ''}</td>
                      <td className="cell-action">
                        <button
                          type="button"
                          className="btn btn-small"
                          title="Einladung vergessen: von Hand einlassen"
                          onClick={() => window.confirm(`${guestListName(g)} von Hand einlassen?`) && onAdmit(g)}
                        >
                          Einlassen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : denied.length === 0 ? (
          <p className="muted empty-note">Keine Abweisungen.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table compact one-line">
              <thead>
                <tr>
                  <th className="th-plain">Zeit</th>
                  <th className="th-plain">Wer</th>
                  <th className="th-plain">Grund</th>
                </tr>
              </thead>
              <tbody>
                {denied.map((e) => (
                  <tr key={e.seq} className="row-denied">
                    <td>{formatTime(e.timestamp)}</td>
                    <td className="cell-strong">
                      {e.name ?? (e.nameLocked ? '🔒 Name gesperrt' : e.guestNumber ? `Gast Nr. ${e.guestNumber}` : e.cardNumber ? `Karte ${e.cardNumber}` : 'unbekannter Code')}
                    </td>
                    <td className="cell-ellipsis">{reasonText(e.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
