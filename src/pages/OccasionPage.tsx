import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CardView } from '../components/CardView';
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
import { formatLabel } from '../domain/cardLayout';
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
import {
  INVITATION_SELECTIONS,
  SAMPLE_GUEST,
  defaultInvitation,
  invitationCardData,
  invitationValues,
  mailingListCsv,
  selectInvitationGuests,
  type InvitationSelection,
} from '../domain/invitation';
import { reasonText } from '../domain/texts';
import { useGuests, useOccasion, useOccasionLog } from '../hooks/useOccasion';
import { useSettings } from '../hooks/useSettings';
import { getDesktop } from '../lib/desktop';
import { downloadBlob, downloadText } from '../lib/download';
import { invitationFiles, zipFiles } from '../lib/invitationRender';

type Tab = 'gaeste' | 'einladungen' | 'teilnahme' | 'einstellungen';
const TABS: { id: Tab; label: string }[] = [
  { id: 'gaeste', label: 'Gäste' },
  { id: 'einladungen', label: 'Einladungen' },
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
      {tab === 'einladungen' && <InvitationsTab occasion={occasion} guests={guests} />}
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
                    {g.cardId && (
                      <span className="badge guest-card-badge" title="Kommt mit der vorhandenen Karte (keine Einladung nötig)">
                        Karte {g.cardNumber}
                      </span>
                    )}
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
// Einladungen (Serienbrief, PDF je Gast, Versandliste)
// ---------------------------------------------------------------------------

function InvitationsTab({ occasion, guests }: { occasion: Occasion; guests: Guest[] }) {
  const { orgName } = useSettings();
  const desktop = getDesktop();
  const [selection, setSelection] = useState<InvitationSelection>('all');
  const [category, setCategory] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const layout = occasion.invitation ?? defaultInvitation(occasion.id);
  const chosen = selectInvitationGuests(guests, selection, category);
  const categories = guestCategories(guests);
  const firstGuest: Guest | undefined = chosen[0];
  const first = firstGuest ?? SAMPLE_GUEST;
  const params = new URLSearchParams({ auswahl: selection, ...(category ? { kategorie: category } : {}) }).toString();
  const withoutMail = chosen.filter((g) => !g.person?.email).length;
  const withCard = guests.filter((g) => g.cardId && !g.cancelled).length;
  const locked = chosen.some((g) => g.hasPerson && !g.person);
  const slug = occasion.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'veranstaltung';

  const exportPdfs = async () => {
    setMessage(null);
    try {
      const files = await invitationFiles(layout, occasion, chosen, orgName, (done, total) => setProgress(`PDF ${done} von ${total} …`));
      if (desktop) {
        setProgress('Ordner wählen …');
        const saved = await desktop.saveToFolder(files, 'Ordner für die Einladungen wählen');
        setMessage(saved ? { ok: true, text: `${saved.count} PDFs gespeichert in ${saved.path}` } : null);
      } else {
        downloadBlob(zipFiles(files), `einladungen-${slug}.zip`);
        setMessage({ ok: true, text: `${files.length} PDFs als ZIP-Datei heruntergeladen.` });
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Erstellen fehlgeschlagen.' });
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="invitations">
      <div className="invitation-layout">
        <div className="invitation-preview" aria-label="Vorschau der Einladung">
          <CardView
            layout={layout}
            data={invitationCardData(occasion, first, orgName)}
            values={invitationValues(occasion, first, orgName)}
            token={firstGuest?.token ?? 'BEISPIELEINLADUNGVORSCHAU2'}
            qrKind="guest"
            large
          />
          <p className="muted small">
            {formatLabel(layout)} · Vorschau {firstGuest ? `für Nr. ${firstGuest.number}` : 'mit Beispielgast'}
          </p>
        </div>
        <div className="invitation-actions">
          <Link className="btn btn-primary" to={`/veranstaltungen/${occasion.id}/einladung`}>
            Einladung gestalten
          </Link>
          <div className="form-grid">
            <label>
              Für wen
              <select value={selection} onChange={(e) => setSelection(e.target.value as InvitationSelection)}>
                {INVITATION_SELECTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kategorie
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Alle Kategorien</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            <strong>{chosen.length}</strong> Einladung(en){selection !== 'post' && withoutMail > 0 ? ` – davon ${withoutMail} ohne E-Mail-Adresse` : ''}.
            {withCard > 0 && <span className="muted"> {withCard} Gast/Gäste kommen mit ihrer Karte und brauchen keine Einladung.</span>}
          </p>
          {locked && <p className="hint">Personendaten gesperrt – bitte als Admin anmelden.</p>}
          <div className="button-row">
            <Link className={chosen.length ? 'btn' : 'btn disabled'} aria-disabled={!chosen.length} to={chosen.length ? `/veranstaltungen/${occasion.id}/einladungen/druck?${params}` : '#'}>
              Drucken / ein PDF
            </Link>
            <button type="button" className="btn" disabled={!chosen.length || progress !== null || locked} onClick={() => void exportPdfs()}>
              {desktop ? 'PDF je Gast in Ordner speichern' : 'PDF je Gast (ZIP)'}
            </button>
            <button type="button" className="btn" disabled={!chosen.length} onClick={() => downloadText(mailingListCsv(chosen), `versandliste-${slug}.csv`)}>
              Versandliste (CSV)
            </button>
          </div>
          {progress && (
            <p className="muted" role="status">
              {progress}
            </p>
          )}
          {message && (
            <p className={message.ok ? 'form-success' : 'form-error'} role="status">
              {message.text}
            </p>
          )}
          <details className="mail-help">
            <summary>Per E-Mail verschicken – so geht es</summary>
            <ol>
              <li>„PDF je Gast“ erstellen – jede Datei heißt z. B. „Einladung_012_Mustermann_Max.pdf“.</li>
              <li>„Versandliste (CSV)“ herunterladen: E-Mail, Briefanrede und Dateiname je Gast.</li>
              <li>
                Im E-Mail-Programm (z. B. Outlook) die Einladung an die Adresse aus der Liste schicken und die passende PDF anhängen. Die
                App selbst verschickt nichts – sie arbeitet ohne Internet.
              </li>
            </ol>
            <p className="muted small">Hinweis: PDFs und CSV sind nicht verschlüsselt – nach dem Versand löschen.</p>
          </details>
        </div>
      </div>
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
