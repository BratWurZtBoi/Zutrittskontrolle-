import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { GuestDialog } from '../components/occasion/GuestDialog';
import { OccasionForm } from '../components/occasion/OccasionForm';
import { OccasionBadge } from '../components/OccasionBadge';
import {
  addGuests,
  admitGuestManually,
  deleteOccasion,
  endEntry,
  eraseGuestData,
  startEntry,
  undoAdmission,
  updateOccasion,
} from '../db/occasions';
import { csvFilename } from '../domain/csv';
import { decodeCsvBytes } from '../domain/csvImport';
import { formatIsoDate, formatTime } from '../domain/dates';
import { guestTemplateCsv, guestsToCsv, parseGuestImport, type GuestImportRow } from '../domain/guestImport';
import {
  GUEST_STATUS_LABEL,
  NO_CATEGORY,
  admissionTimeline,
  filterGuests,
  guestCategories,
  guestListName,
  guestStatus,
  occasionStats,
  sortGuestsByName,
  type Guest,
  type GuestStatusFilter,
  type Occasion,
} from '../domain/occasion';
import { reasonText } from '../domain/texts';
import { useGuests, useOccasion, useOccasionLog } from '../hooks/useOccasion';
import { useSettings } from '../hooks/useSettings';
import { downloadText } from '../lib/download';

type Tab = 'gaeste' | 'teilnahme' | 'einstellungen';
const TABS: { id: Tab; label: string }[] = [
  { id: 'gaeste', label: 'Gäste' },
  { id: 'teilnahme', label: 'Teilnahme' },
  { id: 'einstellungen', label: 'Einstellungen' },
];

/** Eine Veranstaltung: Gästeliste, Teilnahme, Einstellungen – und Einlass starten/beenden. */
export function OccasionPage() {
  const { id = '' } = useParams();
  const occasion = useOccasion(id);
  const guests = useGuests(id);
  const { activeOccasionId } = useSettings();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.id === params.get('ansicht')) ? (params.get('ansicht') as Tab) : 'gaeste';
  if (occasion === undefined || guests === undefined) return null;
  if (occasion === null) {
    return (
      <div className="page">
        <p>Diese Veranstaltung gibt es nicht (mehr).</p>
        <Link to="/veranstaltungen">Zu den Veranstaltungen</Link>
      </div>
    );
  }
  const live = activeOccasionId === occasion.id;

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1 className="occasion-title">
          <span className="occasion-color" style={{ background: occasion.color }} />
          {occasion.name}
        </h1>
        <div className="button-row">
          {live ? (
            <button type="button" className="btn" onClick={() => window.confirm('Einlass auf diesem Gerät beenden?') && void endEntry()}>
              Einlass beenden
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const other = activeOccasionId && activeOccasionId !== occasion.id;
                if (other && !window.confirm('Auf diesem Gerät läuft schon der Einlass einer anderen Veranstaltung. Wechseln?')) return;
                void startEntry(occasion.id);
              }}
            >
              Einlass starten
            </button>
          )}
          <Link className="btn btn-ghost" to="/veranstaltungen">
            Alle Veranstaltungen
          </Link>
        </div>
      </header>
      <p className="muted">
        {formatIsoDate(occasion.date)}
        {occasion.location ? ` · ${occasion.location}` : ''}
        {occasion.entryFrom ? ` · Einlass ab ${occasion.entryFrom}${occasion.entryUntil ? ` bis ${occasion.entryUntil}` : ''} Uhr` : ''}
        {occasion.cardsAllowed ? ' · Dienstausweise gelten zusätzlich' : ''}
        {live && (
          <>
            {' · '}
            <strong>Einlass läuft auf diesem Gerät</strong> – <Link to="/dashboard">zum Einlass</Link>
          </>
        )}
      </p>
      <nav className="tabs card-tabs" aria-label="Veranstaltung">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? 'tab active' : 'tab'}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => setParams(t.id === 'gaeste' ? {} : { ansicht: t.id }, { replace: true })}
          >
            {t.label}
            {t.id === 'gaeste' && <span className="count-pill">{guests.filter((g) => !g.cancelled).length}</span>}
          </button>
        ))}
      </nav>
      {tab === 'gaeste' && <GuestsTab occasion={occasion} guests={guests} />}
      {tab === 'teilnahme' && <ParticipationTab occasion={occasion} guests={guests} />}
      {tab === 'einstellungen' && <SettingsTab occasion={occasion} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gäste
// ---------------------------------------------------------------------------

function GuestsTab({ occasion, guests }: { occasion: Occasion; guests: Guest[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<GuestStatusFilter>('all');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Guest | 'new' | null>(null);
  const [importing, setImporting] = useState<{ rows: GuestImportRow[]; fileErrors: string[]; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const categories = guestCategories(guests);
  const shown = useMemo(() => sortGuestsByName(filterGuests(guests, { query, status, category })), [guests, query, status, category]);
  const current = editing && editing !== 'new' ? guests.find((g) => g.id === editing.id) : undefined;

  const readFile = async (file: File) => {
    const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    setImporting({ ...parseGuestImport(text), name: file.name });
    setMessage(null);
  };
  const runImport = async () => {
    if (!importing) return;
    const valid = importing.rows.filter((r) => r.errors.length === 0);
    try {
      await addGuests(
        occasion.id,
        valid.map((r) => ({ person: r.person, category: r.category })),
      );
      setMessage(`${valid.length} Gäste importiert.`);
      setImporting(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import fehlgeschlagen.');
    }
  };

  return (
    <section>
      <div className="filter-bar">
        <input type="search" placeholder="Suchen: Name, Einheit/Firma, E-Mail, Nr. …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Gäste suchen" />
        <select value={status} onChange={(e) => setStatus(e.target.value as GuestStatusFilter)} aria-label="Status">
          <option value="all">Alle</option>
          <option value="open">Noch offen</option>
          <option value="admitted">Eingelassen</option>
          <option value="cancelled">Storniert</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategorie">
          <option value="">Alle Kategorien</option>
          {[...categories, ...(guests.some((g) => !g.category) ? [NO_CATEGORY] : [])].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="button-row guest-actions">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          + Gast
        </button>
        <label className="btn file-button">
          CSV-Import …
          <input
            type="file"
            accept=".csv,text/csv,.txt"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void readFile(file);
            }}
          />
        </label>
        <button type="button" className="btn btn-ghost" onClick={() => downloadText(guestTemplateCsv(), 'gaesteliste-vorlage.csv')}>
          Vorlage herunterladen
        </button>
      </div>
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {importing && (
        <div className="card import-preview guest-import">
          <h3>Import: {importing.name}</h3>
          {importing.fileErrors.map((e) => (
            <p key={e} className="form-error">
              {e}
            </p>
          ))}
          {importing.fileErrors.length === 0 && (
            <>
              <p>
                <strong>{importing.rows.filter((r) => r.errors.length === 0).length}</strong> Gäste werden übernommen
                {importing.rows.some((r) => r.errors.length) ? `, ${importing.rows.filter((r) => r.errors.length).length} Zeilen mit Fehlern werden übersprungen` : ''}.
              </p>
              <ul className="import-errors">
                {importing.rows
                  .filter((r) => r.errors.length)
                  .map((r) => (
                    <li key={r.line}>
                      Zeile {r.line}: {r.errors.join(' ')}
                    </li>
                  ))}
              </ul>
            </>
          )}
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={importing.fileErrors.length > 0 || !importing.rows.some((r) => r.errors.length === 0)}
              onClick={() => void runImport()}
            >
              Gäste importieren
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setImporting(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      <p className="muted small">
        {shown.length} von {guests.length} Gästen
      </p>
      {guests.length === 0 ? (
        <p className="empty-note">Noch keine Gäste. Einzeln hinzufügen oder per CSV importieren (Vorlage mit allen Spalten).</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table guest-table">
            <thead>
              <tr>
                <th className="th-plain">Nr.</th>
                <th className="th-plain">Name</th>
                <th className="th-plain">Einheit/Firma</th>
                <th className="th-plain">Kategorie</th>
                <th className="th-plain">E-Mail</th>
                <th className="th-plain">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => (
                <tr key={g.id} className="clickable" onClick={() => setEditing(g)}>
                  <td>{g.number}</td>
                  <td className="cell-strong">
                    {g.person?.salutation ? <span className="muted">{g.person.salutation} </span> : null}
                    {guestListName(g)}
                  </td>
                  <td>{g.person?.company ?? ''}</td>
                  <td>{g.category ?? ''}</td>
                  <td className="cell-ellipsis">{g.person?.email ?? ''}</td>
                  <td>
                    <span className={`guest-status guest-status-${guestStatus(g)}`}>{GUEST_STATUS_LABEL[guestStatus(g)]}</span>
                    {g.admittedAt ? <span className="muted"> {formatTime(g.admittedAt)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <GuestDialog
          occasionId={occasion.id}
          guest={editing === 'new' ? undefined : current}
          categories={categories}
          onClose={() => setEditing(null)}
          onAdmit={(g) => void admitGuestManually(g.id).then(() => setEditing(null))}
          onUndoAdmission={(g) => {
            if (window.confirm('Einlass zurücknehmen? Die Einladung gilt dann wieder.')) void undoAdmission(g.id).then(() => setEditing(null));
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Teilnahme
// ---------------------------------------------------------------------------

function ParticipationTab({ occasion, guests }: { occasion: Occasion; guests: Guest[] }) {
  const log = useOccasionLog(occasion.id) ?? [];
  const stats = occasionStats(guests);
  const timeline = admissionTimeline(guests.flatMap((g) => (g.admittedAt !== undefined && !g.cancelled ? [g.admittedAt] : [])));
  const peak = Math.max(1, ...timeline.map((b) => b.count));
  const denied = log.filter((e) => e.outcome === 'denied');
  const viaCard = new Set(log.filter((e) => e.outcome === 'admitted' && e.cardId).map((e) => e.cardId)).size;

  return (
    <section className="participation">
      <div className="summary-chips">
        <span className="chip">
          <strong>{stats.invited}</strong> eingeladen
        </span>
        <span className="chip chip-present">
          <strong>{stats.admitted}</strong> eingelassen ({stats.rate} %)
        </span>
        <span className="chip">
          <strong>{stats.open}</strong> noch offen
        </span>
        {stats.cancelled > 0 && (
          <span className="chip">
            <strong>{stats.cancelled}</strong> storniert
          </span>
        )}
        {viaCard > 0 && (
          <span className="chip">
            <strong>{viaCard}</strong> mit Dienstausweis
          </span>
        )}
        <span className="chip chip-error">
          <strong>{denied.length}</strong> abgewiesen
        </span>
        <button
          type="button"
          className="btn btn-small chip-action"
          disabled={guests.length === 0}
          onClick={() => downloadText(guestsToCsv(sortGuestsByName(guests)), csvFilename('teilnehmer'))}
          title="Achtung: CSV-Dateien sind nicht verschlüsselt."
        >
          Teilnehmerliste (CSV)
        </button>
      </div>

      {stats.perCategory.length > 0 && (
        <div className="card">
          <h3>Nach Kategorie</h3>
          <table className="data-table compact">
            <thead>
              <tr>
                <th className="th-plain">Kategorie</th>
                <th className="th-plain">eingeladen</th>
                <th className="th-plain">eingelassen</th>
              </tr>
            </thead>
            <tbody>
              {stats.perCategory.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>{c.invited}</td>
                  <td>{c.admitted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Einlass im Zeitverlauf (je 15 Minuten)</h3>
        {timeline.length === 0 ? (
          <p className="muted">Noch niemand eingelassen.</p>
        ) : (
          <ol className="timeline" aria-label="Einlass im Zeitverlauf">
            {timeline.map((b) => (
              <li key={b.from}>
                <span className="timeline-time">{formatTime(b.from)}</span>
                <span className="timeline-bar" style={{ width: `${(b.count / peak) * 100}%`, background: occasion.color }} />
                <span className="timeline-count">{b.count}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="card">
        <h3>Einlass-Protokoll</h3>
        {log.length === 0 ? (
          <p className="muted">Noch keine Einträge.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th className="th-plain">Zeit</th>
                  <th className="th-plain">Wer</th>
                  <th className="th-plain">Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 300).map((e) => (
                  <tr key={e.seq} className={e.outcome === 'denied' ? 'row-denied' : ''}>
                    <td>{formatTime(e.timestamp)}</td>
                    <td>
                      {e.name ?? (e.nameLocked ? '🔒 Name gesperrt' : e.guestNumber ? `Gast Nr. ${e.guestNumber}` : e.cardNumber ? `Karte ${e.cardNumber}` : 'unbekannter Code')}
                      {e.cardNumber ? <span className="muted"> · Dienstausweis {e.cardNumber}</span> : null}
                      {e.guestNumber ? <span className="muted"> · Nr. {e.guestNumber}</span> : null}
                    </td>
                    <td>
                      {e.outcome === 'admitted' ? `eingelassen${e.source === 'manual' ? ' (von Hand)' : ''}` : e.outcome === 'undone' ? 'Einlass zurückgenommen' : reasonText(e.reason)}
                    </td>
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

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

function SettingsTab({ occasion }: { occasion: Occasion }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const { id: _id, createdAt: _c, updatedAt: _u, ...initial } = occasion;
  return (
    <section>
      <OccasionForm key={occasion.id} initial={initial} submitLabel="Speichern" onSubmit={async (input) => void (await updateOccasion(occasion.id, input))} />
      <div className="card danger-zone">
        <h3>Nach der Veranstaltung</h3>
        <p className="muted">
          Personendaten der Gäste löschen (Datenschutz): Namen, Einheit, E-Mail und Notizen werden entfernt. Anzahl, Kategorien und Einlasszeiten
          bleiben für die Auswertung erhalten.
        </p>
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        <div className="button-row">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (!window.confirm(`Personendaten aller Gäste von „${occasion.name}“ endgültig löschen?`)) return;
              void eraseGuestData(occasion.id).then((n) => setMessage(`Personendaten von ${n} Gästen gelöscht.`));
            }}
          >
            Gästedaten löschen
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (!window.confirm(`„${occasion.name}“ mit Gästeliste und Einlass-Protokoll endgültig löschen? Alle Einladungen werden ungültig.`)) return;
              void deleteOccasion(occasion.id).then(() => navigate('/veranstaltungen', { replace: true }));
            }}
          >
            Veranstaltung löschen
          </button>
        </div>
      </div>
      <p className="muted small">
        <OccasionBadge name={occasion.name} color={occasion.color} /> So erscheint die Veranstaltung im Einlass.
      </p>
    </section>
  );
}
