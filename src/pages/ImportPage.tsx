import { useState } from 'react';
import { Link } from 'react-router';
import { GroupBadge } from '../components/GroupBadge';
import { executeImport, planImport, type ImportResult, type PlannedRow } from '../db/importCards';
import { decodeCsvBytes, importTemplateCsv, parseImport, TEMPLATE_HEADER, type ImportRow } from '../domain/csvImport';
import { formatIsoDate } from '../domain/dates';
import { holderName } from '../domain/texts';
import { downloadText } from '../lib/download';

/** Personenlisten aus einer CSV-Datei (z. B. Excel) einlesen. */
export function ImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [plan, setPlan] = useState<PlannedRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const replan = async (r: ImportRow[], ow: boolean) => setPlan(await planImport(r, ow));

  const onFile = async (file: File | undefined) => {
    setResult(null);
    setPlan(null);
    setRows(null);
    setFileErrors([]);
    if (!file) return;
    setFileName(file.name);
    const parsed = parseImport(decodeCsvBytes(new Uint8Array(await file.arrayBuffer())));
    setFileErrors(parsed.fileErrors);
    if (parsed.fileErrors.length === 0) {
      setRows(parsed.rows);
      await replan(parsed.rows, overwrite);
    }
  };

  const valid = plan?.filter((r) => r.action.kind !== 'error') ?? [];
  const creates = valid.filter((r) => r.action.kind === 'create').length;
  const unassigned = valid.filter((r) => r.action.kind === 'unassigned').length;
  const assigns = valid.length - creates - unassigned;
  const errors = (plan?.length ?? 0) - valid.length;

  const onImport = async () => {
    if (!plan || valid.length === 0) return;
    const parts = [`${creates} neue Karte(n)`, `${assigns} Zuweisung(en)`];
    if (unassigned) parts.push(`${unassigned} unter „Nicht zugeordnet“`);
    if (!window.confirm(`${valid.length} Zeile(n) importieren? ${parts.join(', ')}.`)) return;
    setBusy(true);
    try {
      setResult(await executeImport(plan));
      setPlan(null);
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1>CSV-Import</h1>
        <Link className="btn btn-ghost" to="/karten">
          Zurück
        </Link>
      </header>

      <section className="card">
        <h2>1. Vorlage ausfüllen</h2>
        <p>
          Die Vorlage in Excel (oder LibreOffice) öffnen, pro Person eine Zeile ausfüllen und wieder als <strong>CSV</strong>{' '}
          speichern („CSV UTF-8“ oder „CSV (Trennzeichen-getrennt)“).
        </p>
        <button type="button" className="btn btn-primary" onClick={() => downloadText(importTemplateCsv(), 'zutritt-import-vorlage.csv')}>
          Vorlage herunterladen
        </button>
        <details className="import-help">
          <summary>Spalten der Vorlage</summary>
          <ul className="info-list">
            <li>
              <strong>Kartennummer</strong> (optional): leer = neue Karte mit der nächsten freien Nummer. Vorhandene Nummer = diese Karte
              bekommt die Person (z. B. bereits gedruckte Besucherkarte). Neue Nummer = Karte wird mit genau dieser Nummer angelegt.
            </li>
            <li>
              <strong>Gruppe</strong>: Name oder Kürzel einer vorhandenen Gruppe, z. B. „Besucher“ oder „B“. Leer oder unbekannt (z. B.
              Tippfehler): Die Person wird trotzdem übernommen und kommt unter <strong>Karten → „Nicht zugeordnet“</strong> – dort
              später einer Gruppe zuordnen. Bei vorhandener Kartennummer ergibt sich die Gruppe aus der Karte.
            </li>
            <li>
              <strong>Vorname</strong>, <strong>Nachname</strong> (mindestens eins), <strong>Firma/Abteilung</strong>, <strong>Notiz</strong>
            </li>
            <li>
              <strong>Zutritt erlaubt</strong>: ja oder nein (leer = ja)
            </li>
            <li>
              <strong>Gültig ab</strong>, <strong>Gültig bis</strong>: Datum als TT.MM.JJJJ (optional)
            </li>
          </ul>
          <p className="muted small">Kopfzeile: {TEMPLATE_HEADER.join(' ; ')}. Fotos können danach an der Karte ergänzt werden.</p>
        </details>
      </section>

      <section className="card form">
        <h2>2. Datei prüfen</h2>
        <label htmlFor="csv-file">CSV-Datei</label>
        <input id="csv-file" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} />
        {fileName && <p className="muted small">Datei: {fileName}</p>}
        {fileErrors.map((e) => (
          <p key={e} className="form-error">
            {e}
          </p>
        ))}
        {rows && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => {
                setOverwrite(e.target.checked);
                void replan(rows, e.target.checked);
              }}
            />
            Bestehende Personendaten auf Karten überschreiben
          </label>
        )}
        {plan && (
          <>
            <div className="summary-chips">
              <span className="chip">
                <strong>{creates}</strong> neue Karte(n)
              </span>
              <span className="chip">
                <strong>{assigns}</strong> Zuweisung(en)
              </span>
              {unassigned > 0 && (
                <span className="chip">
                  <strong>{unassigned}</strong> nicht zugeordnet
                </span>
              )}
              <span className={errors ? 'chip chip-error' : 'chip'}>
                <strong>{errors}</strong> Fehler
              </span>
            </div>
            <div className="table-wrap">
              <table className="data-table import-table">
                <thead>
                  <tr>
                    <th>Zeile</th>
                    <th>Aktion</th>
                    <th>Name</th>
                    <th>Firma</th>
                    <th>Gruppe</th>
                    <th>Gültig</th>
                    <th>Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((r) => (
                    <tr key={r.line} className={r.action.kind === 'error' ? 'row-denied' : ''}>
                      <td>{r.line}</td>
                      <td>
                        {r.action.kind === 'create' && <>Neue Karte {r.action.number}</>}
                        {r.action.kind === 'assign' && <>Zuweisen {r.action.number}</>}
                        {r.action.kind === 'unassigned' && <>→ Nicht zugeordnet</>}
                        {r.action.kind === 'error' && <>✕ Fehler</>}
                      </td>
                      <td>{holderName(r.holder) || '–'}</td>
                      <td>{r.holder.company ?? ''}</td>
                      <td>{r.group ? <GroupBadge group={r.group} /> : r.action.kind === 'unassigned' ? '–' : (r.groupRef ?? '')}</td>
                      <td>
                        {r.validFrom || r.validUntil ? `${formatIsoDate(r.validFrom) || '…'} – ${formatIsoDate(r.validUntil) || '…'}` : ''}
                        {!r.accessGranted && <span className="badge badge-no-permission">kein Zutritt</span>}
                      </td>
                      <td className="result-cell">
                        {r.errors.join(' ')}
                        {r.action.kind === 'assign' && r.action.replaces && `Ersetzt ${r.action.replaces}.`}
                        {r.action.kind === 'unassigned' &&
                          (r.action.groupHint ? `Gruppe „${r.action.groupHint}“ gibt es nicht – später zuordnen.` : 'Ohne Gruppe – später zuordnen.')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">Zeilen mit Fehlern werden übersprungen. Datei korrigieren und erneut wählen, um sie mit zu importieren.</p>
            <button type="button" className="btn btn-primary" disabled={busy || valid.length === 0} onClick={() => void onImport()}>
              {busy ? 'Wird importiert …' : `${valid.length} Zeile(n) importieren`}
            </button>
          </>
        )}
      </section>

      {result && (
        <section className="card success-box">
          <h2>Import abgeschlossen</h2>
          <p>
            {result.created.length} neue Karte(n) angelegt, {result.assigned} Karte(n) zugewiesen
            {result.unassigned > 0 && <>, {result.unassigned} Person(en) unter „Nicht zugeordnet“ abgelegt</>}.
          </p>
          <div className="button-row">
            {result.created.length > 0 && (
              <Link className="btn btn-primary" to={`/druck?ids=${result.created.map((c) => c.id).join(',')}`}>
                Neue Karten drucken
              </Link>
            )}
            {result.unassigned > 0 && (
              <Link className="btn btn-primary" to="/karten?ansicht=nicht-zugeordnet">
                Nicht zugeordnete Personen zuordnen
              </Link>
            )}
            <Link className="btn" to="/karten">
              Zur Kartenliste
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
