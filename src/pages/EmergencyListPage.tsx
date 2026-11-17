import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { HolderPhoto } from '../components/HolderPhoto';
import { listGroups } from '../db/groups';
import { listPresentCards, type PresentCard } from '../db/scans';
import { DEFAULT_SETTINGS } from '../db/settings';
import { formatDateTime, formatShortDateTime } from '../domain/dates';
import { directPrintDone, emergencyPrintPlan, printErrorText } from '../domain/emergencyPrint';
import type { Group } from '../domain/types';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';
import { useLoadedSettings } from '../hooks/useSettings';
import { getDesktop } from '../lib/desktop';
import { printCurrentPage } from '../lib/device';
import type { EmergencyNavState } from '../lib/emergency';

/** Anwesende nach Gruppen (Reihenfolge der Gruppen), innerhalb nach Name. */
function byGroup(present: PresentCard[], groups: Group[]): { group: Group | undefined; rows: PresentCard[] }[] {
  const name = (p: PresentCard) => (p.card.holder ? `${p.card.holder.lastName} ${p.card.holder.firstName}` : `~${p.card.number}`);
  const sorted = [...present].sort((a, b) => name(a).localeCompare(name(b), 'de', { numeric: true }));
  const sections = groups.map((g) => ({ group: g as Group | undefined, rows: sorted.filter((p) => p.card.groupId === g.id) }));
  const known = new Set(groups.map((g) => g.id));
  sections.push({ group: undefined, rows: sorted.filter((p) => !known.has(p.card.groupId)) });
  return sections.filter((s) => s.rows.length > 0);
}

/** Warten, bis die Seite gezeichnet ist und Fotos geladen sind (sonst fehlen sie auf dem Papier). */
async function pageReady(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
  const images = [...document.querySelectorAll<HTMLImageElement>('.emergency-page img')].filter((img) => !img.complete);
  await Promise.all(
    images.map(
      (img) =>
        new Promise((done) => {
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }),
    ),
  );
}

type PrintStatus = { kind: 'info' | 'ok' | 'error'; text: string };

/**
 * Notfall- bzw. Evakuierungsliste: alle Anwesenden auf einen Blick, zum Ausdrucken
 * und Abhaken am Sammelplatz. Funktioniert offline.
 *
 * Mit `?drucken=1` (roter Knopf „Notfallliste“/„Notfall“) wird sofort gedruckt: im Browser
 * über den Druckdialog, im Windows-/Linux-Programm auf Wunsch ohne Dialog. Danach geht es zurück.
 */
export function EmergencyListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const loaded = useLoadedSettings();
  const settings = loaded ?? DEFAULT_SETTINGS;
  const present = useSecureLiveQuery(listPresentCards, []);
  const groups = useLiveQuery(listGroups, []);
  const [photoChoice, setPhotoChoice] = useState<boolean>();
  const withPhotos = photoChoice ?? settings.emergencyPhotos;
  const [createdAt] = useState(() => Date.now());
  const [status, setStatus] = useState<PrintStatus | null>(null);
  const sections = useMemo(() => (present ? byGroup(present, groups ?? []) : []), [present, groups]);
  const autoPrint = params.get('drucken') === '1';
  const started = useRef(false);
  const from = useRef((location.state as EmergencyNavState | null)?.from);

  const goBack = () => (from.current ? navigate(-1) : navigate('/dashboard', { replace: true }));

  useEffect(() => {
    if (!autoPrint || started.current || !present || !groups || !loaded) return;
    started.current = true;
    // Parameter entfernen: Zurück/Neuladen druckt nicht noch einmal
    navigate('/notfallliste', { replace: true, state: location.state });
    if (present.length === 0) {
      setStatus({ kind: 'info', text: 'Zurzeit ist niemand eingebucht – es wurde nichts gedruckt.' });
      return;
    }
    const plan = emergencyPrintPlan(loaded, Boolean(getDesktop()));
    void (async () => {
      await pageReady();
      if (plan.mode === 'direct') {
        setStatus({ kind: 'info', text: 'Notfallliste wird gedruckt …' });
        const result = await getDesktop()!
          .printDirect({ printer: plan.printer, copies: plan.copies })
          .catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        if (result.ok) {
          setStatus({ kind: 'ok', text: directPrintDone(plan.printer, plan.copies) });
          window.setTimeout(goBack, 2500);
        } else {
          setStatus({ kind: 'error', text: `Nicht gedruckt: ${printErrorText(result.error)}. Bitte oben über „Drucken“ mit Druckdialog drucken.` });
        }
        return;
      }
      const t0 = performance.now();
      printCurrentPage();
      // Am Computer wartet print(), bis der Dialog geschlossen ist → zurück. Auf Handy/Tablet kehrt
      // print() sofort zurück (Druckansicht läuft noch) – dann bleibt die Liste stehen.
      if (performance.now() - t0 > 400) goBack();
    })();
    // nur einmal, sobald Liste, Gruppen und Einstellungen geladen sind (started verhindert Wiederholung)
  }, [autoPrint, present, groups, loaded]);

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
          <button type="button" className="btn btn-ghost" onClick={goBack}>
            Zurück
          </button>
        </div>
      </header>
      {status && (
        <p className={`no-print emergency-status emergency-status-${status.kind}`} role="status">
          {status.text}
        </p>
      )}
      <label className="checkbox-inline no-print emergency-photos">
        <input type="checkbox" checked={withPhotos} onChange={(e) => setPhotoChoice(e.target.checked)} /> mit Fotos (hilft beim
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
