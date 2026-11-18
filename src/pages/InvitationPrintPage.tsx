import { Fragment, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { CardView } from '../components/CardView';
import { saveSettings } from '../db/settings';
import { cardSize, formatLabel } from '../domain/cardLayout';
import {
  INVITATION_SELECTIONS,
  defaultInvitation,
  invitationCardData,
  invitationValues,
  selectInvitationGuests,
  type InvitationSelection,
} from '../domain/invitation';
import { layoutSheets, sheetGrid } from '../domain/printLayout';
import { useGuests, useOccasion } from '../hooks/useOccasion';
import { useSettings } from '../hooks/useSettings';
import { printCurrentPage } from '../lib/device';
import { ensurePageSize } from '../lib/printPages';
import { CutMarks } from './PrintPage';

/**
 * Serienbrief: alle ausgewählten Einladungen drucken (oder im Druckdialog als ein PDF speichern).
 * Eine Einladung je Seite im Einladungsformat – kleinere Formate wahlweise mehrere auf A4.
 */
export function InvitationPrintPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const occasion = useOccasion(id);
  const guests = useGuests(id);
  const settings = useSettings();
  const selection = (INVITATION_SELECTIONS.some((s) => s.value === params.get('auswahl')) ? params.get('auswahl') : 'all') as InvitationSelection;
  const category = params.get('kategorie') ?? '';
  const [sheet, setSheet] = useState(false);
  const layout = occasion ? (occasion.invitation ?? defaultInvitation(occasion.id)) : undefined;
  const chosen = useMemo(() => selectInvitationGuests(guests ?? [], selection, category), [guests, selection, category]);
  if (!occasion || !guests || !layout) return null;

  const size = cardSize(layout);
  const perSheet = sheetGrid(size, 'none').count;
  const canSheet = perSheet >= 2;
  const useSheet = sheet && canSheet;
  const sheets = useSheet ? layoutSheets(chosen.map((g) => ({ key: g.id, size, hasBack: false })), 'none') : null;
  const byId = new Map(chosen.map((g) => [g.id, g]));
  const render = (guestId: string) => {
    const g = byId.get(guestId)!;
    return (
      <CardView
        layout={layout}
        data={invitationCardData(occasion, g, settings.orgName)}
        values={invitationValues(occasion, g, settings.orgName)}
        token={g.token}
        qrKind="guest"
        square
      />
    );
  };

  return (
    <div className="page page-wide print-page invitation-print">
      <header className="page-header no-print">
        <h1>Einladungen drucken</h1>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={printCurrentPage} disabled={chosen.length === 0}>
            Drucken / PDF
          </button>
          <Link className="btn btn-ghost" to={`/veranstaltungen/${occasion.id}?ansicht=einladungen`}>
            Zurück
          </Link>
        </div>
      </header>
      <div className="print-options no-print">
        {canSheet && (
          <div className="segmented segmented-light" role="radiogroup" aria-label="Papier">
            <button type="button" role="radio" aria-checked={!useSheet} className={useSheet ? '' : 'active'} onClick={() => setSheet(false)}>
              Eine je Seite
            </button>
            <button type="button" role="radio" aria-checked={useSheet} className={useSheet ? 'active' : ''} onClick={() => setSheet(true)}>
              {perSheet} je A4-Blatt
            </button>
          </div>
        )}
        {useSheet && (
          <label className="checkbox-inline">
            <input type="checkbox" checked={settings.cardPrintCutMarks} onChange={(e) => void saveSettings({ cardPrintCutMarks: e.target.checked })} />
            Schnittmarken
          </label>
        )}
        <Link to={`/veranstaltungen/${occasion.id}/einladung`} className="btn btn-small">
          Einladung gestalten
        </Link>
      </div>
      <p className="muted no-print print-summary">
        {chosen.length} Einladung(en) „{occasion.name}“ · {formatLabel(layout)}
        {useSheet ? ` · ${sheets?.pages.length ?? 0} A4-Seite(n) zum Ausschneiden – im Druckdialog Maßstab 100 % wählen.` : ' · je Einladung eine Seite in diesem Format – im Druckdialog das passende Papier wählen (oder „An Seite anpassen“).'}{' '}
        „Als PDF speichern“ im Druckdialog ergibt eine Datei mit allen Einladungen.
      </p>
      {chosen.length === 0 && <p className="empty-note no-print">Keine Gäste in dieser Auswahl.</p>}
      <div className="print-pages">
        {sheets
          ? sheets.pages.map((page, i) => (
              <Fragment key={i}>
                <p className="no-print sheet-label">Seite {i + 1}</p>
                <section className={`print-sheet sheet-${page.orientation}`} style={{ width: `${page.width}mm`, height: `${page.height}mm` }} aria-label={`Seite ${i + 1}`}>
                  {settings.cardPrintCutMarks && page.cuts.map((c, j) => <CutMarks key={j} {...c} />)}
                  {page.cards.map((placed) => (
                    <div key={placed.key} className="sheet-card" style={{ left: `${placed.x}mm`, top: `${placed.y}mm` }}>
                      {render(placed.key)}
                    </div>
                  ))}
                </section>
              </Fragment>
            ))
          : chosen.map((g) => (
              <div key={g.id} className={`print-cardpage invitation-page ${ensurePageSize(size)}`} style={{ width: `${size.w}mm`, height: `${size.h}mm` }}>
                {render(g.id)}
              </div>
            ))}
      </div>
    </div>
  );
}
