import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { HolderPhoto } from '../components/HolderPhoto';
import { listGroups } from '../db/groups';
import { listPresentCards, type PresentCard } from '../db/scans';
import { formatDateTime, formatShortDateTime } from '../domain/dates';
import type { Group } from '../domain/types';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';
import { useSettings } from '../hooks/useSettings';
import { printCurrentPage } from '../lib/device';

/** Anwesende nach Gruppen (Reihenfolge der Gruppen), innerhalb nach Name. */
function byGroup(present: PresentCard[], groups: Group[]): { group: Group | undefined; rows: PresentCard[] }[] {
  const name = (p: PresentCard) => (p.card.holder ? `${p.card.holder.lastName} ${p.card.holder.firstName}` : `~${p.card.number}`);
  const sorted = [...present].sort((a, b) => name(a).localeCompare(name(b), 'de', { numeric: true }));
  const sections = groups.map((g) => ({ group: g as Group | undefined, rows: sorted.filter((p) => p.card.groupId === g.id) }));
  const known = new Set(groups.map((g) => g.id));
  sections.push({ group: undefined, rows: sorted.filter((p) => !known.has(p.card.groupId)) });
  return sections.filter((s) => s.rows.length > 0);
}

/**
 * Notfall- bzw. Evakuierungsliste: alle Anwesenden auf einen Blick, zum Ausdrucken
 * und Abhaken am Sammelplatz. Funktioniert offline.
 */
export function EmergencyListPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const present = useSecureLiveQuery(listPresentCards, []);
  const groups = useLiveQuery(listGroups, [], []);
  const [withPhotos, setWithPhotos] = useState(false);
  const [createdAt] = useState(() => Date.now());
  const sections = useMemo(() => (present ? byGroup(present, groups) : []), [present, groups]);
  if (!present) return null;
  let n = 0;

  return (
    <div className="page page-wide emergency-page">
      <header className="page-header no-print">
        <h1>Notfallliste</h1>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={printCurrentPage} disabled={present.length === 0}>
            Drucken
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Zurück
          </button>
        </div>
      </header>
      <label className="checkbox-inline no-print emergency-photos">
        <input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} /> mit Fotos (hilft beim
        Erkennen, braucht mehr Papier)
      </label>

      <div className="emergency-head">
        <h2>Notfall- / Evakuierungsliste – {settings.orgName}</h2>
        <p>
          Stand: <strong>{formatDateTime(createdAt)} Uhr</strong> · <strong>{present.length}</strong> Person(en) anwesend
        </p>
        <p className="muted small">Vertraulich – enthält Personendaten. Nach Gebrauch vernichten.</p>
      </div>

      {present.length === 0 ? (
        <p className="empty-note">Zurzeit ist niemand eingebucht.</p>
      ) : (
        sections.map(({ group, rows }) => (
          <section key={group?.id ?? 'ohne'} className="emergency-section">
            <h3 style={group ? { borderLeftColor: group.color } : undefined}>
              {group?.name ?? 'Ohne Gruppe'} <span className="muted">({rows.length})</span>
            </h3>
            <table className="data-table emergency-table">
              <thead>
                <tr>
                  <th className="th-plain">Nr.</th>
                  {withPhotos && <th className="th-plain">Foto</th>}
                  <th className="th-plain">Name</th>
                  <th className="th-plain">Firma / Abteilung</th>
                  <th className="th-plain">Karte</th>
                  <th className="th-plain">anwesend seit</th>
                  <th className="th-plain">am Sammelplatz</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ card, since }) => (
                  <tr key={card.id}>
                    <td>{++n}</td>
                    {withPhotos && (
                      <td>
                        <HolderPhoto holder={card.holder} fallback={group?.prefix} className="mini-photo" />
                      </td>
                    )}
                    <td className="cell-strong">
                      {card.holder ? `${card.holder.lastName}, ${card.holder.firstName}` : card.hasHolder ? '🔒 Name gesperrt' : 'Karte ohne Person'}
                    </td>
                    <td>{card.holder?.company ?? ''}</td>
                    <td>{card.number}</td>
                    <td>{formatShortDateTime(since, new Date(createdAt))}</td>
                    <td>
                      <span className="tick-box" aria-label="zum Abhaken" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
