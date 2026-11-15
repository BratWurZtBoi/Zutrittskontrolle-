import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CardView } from '../components/CardView';
import { listCardLayouts } from '../db/cardLayouts';
import { listCards } from '../db/cards';
import { saveSettings } from '../db/settings';
import { STANDARD_CARD_LAYOUT, pickCardLayout, type CardData } from '../domain/cardLayout';
import type { Card, Group } from '../domain/types';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';
import { useSettings } from '../hooks/useSettings';
import { printCurrentPage } from '../lib/device';

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
    holder: holder ? { firstName: holder.firstName, lastName: holder.lastName, company: holder.company, photo: holder.photo } : undefined,
  };
}

/**
 * Druckansicht für Karten im Scheckkartenformat (85,6 × 54 mm) nach dem Kartenlayout der
 * Gruppe – auf A4-Bögen (zum Ausschneiden) oder je Karte eine Seite für Kartendrucker.
 */
export function PrintPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = params.get('ids')?.split(',').filter(Boolean);
  const settings = useSettings();
  const cards = useSecureLiveQuery(listCards, []);
  const layouts = useLiveQuery(listCardLayouts, [], [STANDARD_CARD_LAYOUT]);
  if (!cards) return null;
  const cardPrinter = settings.cardPrintFormat === 'card-printer';

  const selected = ids ? cards.filter(({ card }) => ids.includes(card.id)) : cards;
  const printable = selected.filter(({ card }) => !card.blocked);
  const skipped = selected.length - printable.length;

  return (
    <div className={`page print-page${cardPrinter ? ' print-card-printer' : ''}`}>
      <header className="page-header no-print">
        <h1>Karten drucken</h1>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={printCurrentPage} disabled={printable.length === 0}>
            Drucken / PDF
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Zurück
          </button>
        </div>
      </header>
      <div className="print-options no-print">
        <div className="segmented segmented-light" role="radiogroup" aria-label="Druckformat">
          <button
            type="button"
            role="radio"
            aria-checked={!cardPrinter}
            className={cardPrinter ? '' : 'active'}
            onClick={() => void saveSettings({ cardPrintFormat: 'sheet' })}
          >
            A4-Bogen
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={cardPrinter}
            className={cardPrinter ? 'active' : ''}
            onClick={() => void saveSettings({ cardPrintFormat: 'card-printer' })}
          >
            Kartendrucker
          </button>
        </div>
        <Link to="/einstellungen/karten" className="btn btn-small">
          Kartenlayout anpassen
        </Link>
      </div>
      <p className="muted no-print">
        {printable.length} Karte(n) im Scheckkartenformat.{' '}
        {cardPrinter
          ? 'Kartendrucker: jede Karte auf einer eigenen Seite in Kartengröße – im Druckdialog den Kartendrucker und „Ränder: keine“ wählen.'
          : 'A4-Bogen zum Ausschneiden (Querformat 8, Hochformat 9 je Seite).'}{' '}
        Auf Android im Druckdialog „Als PDF speichern“ wählen, um z. B. am Laptop zu drucken.
        {skipped > 0 && ` ${skipped} gesperrte Karte(n) werden nicht gedruckt.`}
        {printable.length === 0 && (
          <>
            {' '}
            <Link to="/karten">Zur Kartenliste</Link>
          </>
        )}
      </p>
      <div className="cards-grid">
        {printable.map(({ card, group }) => (
          <CardView
            key={card.id}
            layout={pickCardLayout(layouts, { group: group?.cardLayoutId, fallback: settings.defaultCardLayoutId })}
            data={cardDataFor(card, group, settings.orgName)}
            token={card.token}
          />
        ))}
      </div>
    </div>
  );
}
