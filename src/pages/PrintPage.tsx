import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CardView } from '../components/CardView';
import { CardsNav } from '../components/CardsNav';
import { PrintTestSheets } from '../components/PrintTestSheets';
import { listCardLayouts } from '../db/cardLayouts';
import { listCards, markCardsPrinted } from '../db/cards';
import { listGroups } from '../db/groups';
import { saveSettings, type AppSettings } from '../db/settings';
import { STANDARD_CARD_LAYOUT, cardSize, pickCardLayout, type CardData, type CardLayout } from '../domain/cardLayout';
import { layoutCardPrinter, layoutSheets, type BackMode, type PlacedCard, type SheetPage } from '../domain/printLayout';
import type { Card, Group } from '../domain/types';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';
import { useSettings } from '../hooks/useSettings';
import { printCurrentPage } from '../lib/device';
import { ensurePageSize } from '../lib/printPages';

/** Daten für den Druck: Name/Foto nur, wenn die Gruppe das erlaubt und eine Person zugeordnet ist. */
export function cardDataFor(card: Card, group: Group | undefined, orgName: string): CardData {
  const holder = group?.printHolder && card.holder ? card.holder : undefined;
  return {
    number: card.number,
    groupName: group?.name ?? 'Karte',
    groupColor: group?.color ?? '#0f172a',
    orgName,
    validFrom: card.validFrom,
    validUntil: card.validUntil,
    holder: holder
      ? {
          rank: holder.rank,
          firstName: holder.firstName,
          lastName: holder.lastName,
          company: holder.company,
          position: holder.position,
          room: holder.room,
          photo: holder.photo,
        }
      : undefined,
  };
}

interface Entry {
  card: Card;
  layout: CardLayout;
  data: CardData;
}

const SIDE_LABEL: Record<SheetPage['side'], string> = { front: 'Vorderseiten', back: 'Rückseiten (gespiegelt angeordnet)', fold: 'Rück- und Vorderseite zum Falten' };

/**
 * Druckansicht nach dem Kartenlayout der Gruppe: A4-Bögen (zum Ausschneiden, auf Wunsch
 * beidseitig oder zum Falten) oder je Karte eine Seite für Kartendrucker.
 */
export function PrintPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = params.get('ids')?.split(',').filter(Boolean);
  const settings = useSettings();
  const cards = useSecureLiveQuery(listCards, []);
  const layouts = useLiveQuery(listCardLayouts, [], [STANDARD_CARD_LAYOUT]);
  const groups = useLiveQuery(listGroups, [], []);
  const [onlyNew, setOnlyNew] = useState(params.get('nur') === 'neu');
  const [groupFilter, setGroupFilter] = useState(params.get('gruppe') ?? '');
  const [probe, setProbe] = useState(false);
  const [askPrinted, setAskPrinted] = useState<string[] | null>(null);
  const [printedMsg, setPrintedMsg] = useState<string | null>(null);

  const base = useMemo(() => (cards ? (ids ? cards.filter(({ card }) => ids.includes(card.id)) : cards) : []), [cards, ids]);
  const groupIds = new Set(base.map(({ card }) => card.groupId));
  const chosen = useMemo(() => (groupFilter ? base.filter(({ card }) => card.groupId === groupFilter) : base), [base, groupFilter]);
  const notPrinted = chosen.filter(({ card }) => !card.printedAt && !card.blocked).length;
  const selected = useMemo(() => (onlyNew ? chosen.filter(({ card }) => !card.printedAt) : chosen), [chosen, onlyNew]);
  const entries = useMemo(
    () =>
      new Map<string, Entry>(
        selected
          .filter(({ card }) => !card.blocked)
          .map(({ card, group }) => [
            card.id,
            { card, layout: pickCardLayout(layouts, { group: group?.cardLayoutId, fallback: settings.defaultCardLayoutId }), data: cardDataFor(card, group, settings.orgName) },
          ]),
      ),
    [selected, layouts, settings.defaultCardLayoutId, settings.orgName],
  );
  if (!cards) return null;

  const cardPrinter = settings.cardPrintFormat === 'card-printer';
  const list = [...entries.values()];
  const anyBack = list.some((e) => e.layout.back);
  const backMode: BackMode = !anyBack ? 'none' : cardPrinter ? (settings.cardPrintBack === 'none' ? 'none' : 'duplex') : settings.cardPrintBack;
  const items = list.map((e) => ({ key: e.card.id, size: cardSize(e.layout), hasBack: Boolean(e.layout.back) }));
  const sheets = cardPrinter ? null : layoutSheets(items, backMode, settings.cardPrintFlip);
  const cardPages = cardPrinter ? layoutCardPrinter(items, backMode !== 'none') : [];
  const skipped = selected.length - list.length;
  const pageCount = sheets ? sheets.pages.length : cardPages.length;
  const save = (patch: Partial<AppSettings>) => void saveSettings(patch);
  const print = () => {
    setPrintedMsg(null);
    printCurrentPage();
    // Danach fragen, ob wirklich gedruckt wurde (der Druckdialog verrät das nicht)
    if (!probe && list.length > 0) setAskPrinted(list.map((e) => e.card.id));
  };
  const confirmPrinted = async () => {
    if (!askPrinted) return;
    const n = await markCardsPrinted(askPrinted);
    setAskPrinted(null);
    setPrintedMsg(`${n} Karte(n) als gedruckt markiert.`);
  };

  const renderCard = (placed: PlacedCard, square: boolean) => {
    const entry = entries.get(placed.key);
    if (!entry || placed.blank) return null;
    return <CardView layout={entry.layout} face={placed.face} data={entry.data} token={entry.card.token} square={square} />;
  };

  return (
    <div className={`page print-page${cardPrinter ? ' print-card-printer' : ''}`}>
      <header className="page-header no-print">
        <h1>Karten drucken</h1>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={print} disabled={!probe && list.length === 0}>
            {probe ? 'Probeseite drucken' : 'Drucken / PDF'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Zurück
          </button>
        </div>
      </header>

      <CardsNav active="print" />

      {askPrinted && (
        <div className="print-ask no-print" role="status">
          <span>Wurden die {askPrinted.length} Karte(n) gedruckt?</span>
          <button type="button" className="btn btn-primary btn-small" onClick={() => void confirmPrinted()}>
            Ja, als gedruckt markieren
          </button>
          <button type="button" className="btn btn-small" onClick={() => setAskPrinted(null)}>
            Nein
          </button>
        </div>
      )}
      {printedMsg && (
        <p className="form-success no-print" role="status">
          {printedMsg}
        </p>
      )}

      <div className="print-options no-print">
        <div className="segmented segmented-light" role="radiogroup" aria-label="Druckformat">
          <button type="button" role="radio" aria-checked={!cardPrinter} className={cardPrinter ? '' : 'active'} onClick={() => save({ cardPrintFormat: 'sheet' })}>
            A4-Bogen
          </button>
          <button type="button" role="radio" aria-checked={cardPrinter} className={cardPrinter ? 'active' : ''} onClick={() => save({ cardPrintFormat: 'card-printer' })}>
            Kartendrucker
          </button>
        </div>
        {anyBack && (
          <div className="segmented segmented-light" role="radiogroup" aria-label="Rückseite">
            <button type="button" role="radio" aria-checked={backMode === 'none'} className={backMode === 'none' ? 'active' : ''} onClick={() => save({ cardPrintBack: 'none' })}>
              Ohne Rückseite
            </button>
            <button type="button" role="radio" aria-checked={backMode === 'duplex'} className={backMode === 'duplex' ? 'active' : ''} onClick={() => save({ cardPrintBack: 'duplex' })}>
              Beidseitig
            </button>
            {!cardPrinter && (
              <button type="button" role="radio" aria-checked={backMode === 'fold'} className={backMode === 'fold' ? 'active' : ''} onClick={() => save({ cardPrintBack: 'fold' })}>
                Zum Falten
              </button>
            )}
          </div>
        )}
        {!cardPrinter && backMode === 'duplex' && (
          <label className="inline-select">
            Wenden an
            <select value={settings.cardPrintFlip} onChange={(e) => save({ cardPrintFlip: e.target.value as AppSettings['cardPrintFlip'] })}>
              <option value="long">langer Kante</option>
              <option value="short">kurzer Kante</option>
            </select>
          </label>
        )}
        {!cardPrinter && (
          <label className="checkbox-inline">
            <input type="checkbox" checked={settings.cardPrintCutMarks} onChange={(e) => save({ cardPrintCutMarks: e.target.checked })} />
            Schnittmarken
          </label>
        )}
        {groupIds.size > 1 && (
          <label className="inline-select">
            Gruppe
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">Alle Gruppen</option>
              {groups
                .filter((g) => groupIds.has(g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {(onlyNew || (notPrinted > 0 && notPrinted < chosen.length)) && (
          <label className="checkbox-inline">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
            Nur noch nicht gedruckte ({notPrinted})
          </label>
        )}
        <button type="button" className={probe ? 'btn btn-small active' : 'btn btn-small'} aria-pressed={probe} onClick={() => setProbe((p) => !p)}>
          {probe ? 'Zurück zu den Karten' : 'Probeseite zum Nachmessen'}
        </button>
        <Link to="/einstellungen/karten" className="btn btn-small">
          Kartenlayout anpassen
        </Link>
      </div>

      <p className="muted no-print print-summary">
        {list.length} Karte(n) auf {pageCount} Seite(n).{' '}
        {cardPrinter
          ? `Kartendrucker: jede Kartenseite auf einer eigenen Seite in Kartengröße${backMode === 'duplex' ? ' – Vorder- und Rückseite abwechselnd, im Druckdialog „beidseitig“ wählen' : ''}. Im Druckdialog den Kartendrucker und „Ränder: keine“ wählen.`
          : backMode === 'duplex'
            ? `Beidseitig: im Druckdialog „Beidseitig – an ${settings.cardPrintFlip === 'long' ? 'langer' : 'kurzer'} Kante wenden“ und Maßstab 100 % wählen. Erst eine Probeseite drucken.`
            : backMode === 'fold'
              ? 'Zum Falten: Rück- und Vorderseite liegen nebeneinander – ausschneiden, an der gestrichelten Linie falten.'
              : 'A4-Bogen zum Ausschneiden – im Druckdialog Maßstab 100 % („Tatsächliche Größe“) wählen.'}{' '}
        Auf Android im Druckdialog „Als PDF speichern“ wählen, um z. B. am Laptop zu drucken.
        {skipped > 0 && ` ${skipped} gesperrte Karte(n) werden nicht gedruckt.`}
        {list.length === 0 && (
          <>
            {' '}
            <Link to="/karten">Zur Kartenliste</Link>
          </>
        )}
      </p>
      {sheets && sheets.oversize.length > 0 && (
        <p className="form-error no-print">
          {sheets.oversize.length} Karte(n) passen in dieser Größe nicht auf einen A4-Bogen{backMode === 'fold' ? ' (zum Falten zu breit)' : ''} – bitte ein kleineres Format oder „Beidseitig“ wählen.
        </p>
      )}

      {probe && (
        <div className="print-pages">
          <PrintTestSheets duplex={!cardPrinter && backMode === 'duplex'} flip={settings.cardPrintFlip} />
        </div>
      )}
      <div className="print-pages" hidden={probe}>
        {sheets?.pages.map((page, i) => (
          <Fragment key={i}>
            <p className="no-print sheet-label">
              Seite {i + 1} · {SIDE_LABEL[page.side]}
              {page.side === 'back' && page.cards.every((c) => c.blank) && ' – leer (Layout ohne Rückseite), bleibt für den beidseitigen Druck nötig'}
            </p>
            <section className={`print-sheet sheet-${page.orientation}`} style={{ width: `${page.width}mm`, height: `${page.height}mm` }} aria-label={`Seite ${i + 1}`}>
              {settings.cardPrintCutMarks && page.side !== 'back' && page.cuts.map((c, j) => <CutMarks key={j} {...c} />)}
              {page.cards.map((placed) => (
                <div key={`${placed.key}-${placed.face}`} className="sheet-card" style={{ left: `${placed.x}mm`, top: `${placed.y}mm` }}>
                  {renderCard(placed, settings.cardPrintCutMarks || page.side === 'fold')}
                </div>
              ))}
            </section>
          </Fragment>
        ))}
        {cardPages.map((page, i) => (
          <div key={i} className={`print-cardpage ${ensurePageSize(page.size)}`} style={{ width: `${page.size.w}mm`, height: `${page.size.h}mm` }}>
            {renderCard(page.card, true)}
            {page.card.blank && <span className="no-print blank-page">leere Rückseite</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Schnittmarken an den Ecken (außerhalb der Karte) und Falzmarken beim Falten. */
export function CutMarks({ x, y, w, h, foldX }: { x: number; y: number; w: number; h: number; foldX?: number }) {
  const len = 3;
  const off = 0.8;
  const lines: { left: number; top: number; width: number; height: number; dashed?: boolean }[] = [];
  for (const cx of [x, x + w]) {
    for (const cy of [y, y + h]) {
      const up = cy === y;
      const leftSide = cx === x;
      lines.push({ left: cx, top: up ? cy - off - len : cy + off, width: 0, height: len }); // senkrecht
      lines.push({ left: leftSide ? cx - off - len : cx + off, top: cy, width: len, height: 0 }); // waagerecht
    }
  }
  if (foldX !== undefined) {
    lines.push({ left: foldX, top: y - off - len, width: 0, height: len, dashed: true });
    lines.push({ left: foldX, top: y + h + off, width: 0, height: len, dashed: true });
  }
  return (
    <>
      {lines.map((l, i) => (
        <span
          key={i}
          className={l.dashed ? 'cut-mark cut-mark-fold' : 'cut-mark'}
          style={{ left: `${l.left}mm`, top: `${l.top}mm`, width: `${l.width}mm`, height: `${l.height}mm` }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
