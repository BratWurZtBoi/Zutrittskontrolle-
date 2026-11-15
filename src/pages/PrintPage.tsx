import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { HolderPhoto } from '../components/HolderPhoto';
import { QrImage } from '../components/QrImage';
import { listCards } from '../db/cards';
import { textColorOn } from '../domain/color';
import { formatIsoDate } from '../domain/dates';
import type { Card, Group } from '../domain/types';
import { useSettings } from '../hooks/useSettings';
import { printCurrentPage } from '../lib/device';

/** Druckansicht für Karten im Scheckkartenformat (85,6 × 54 mm), 8 pro A4-Seite. */
export function PrintPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = params.get('ids')?.split(',').filter(Boolean);
  const settings = useSettings();
  const cards = useSecureLiveQuery(listCards, []);
  if (!cards) return null;

  const selected = ids ? cards.filter(({ card }) => ids.includes(card.id)) : cards;
  const printable = selected.filter(({ card }) => !card.blocked);
  const skipped = selected.length - printable.length;

  return (
    <div className="page print-page">
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
      <p className="muted no-print">
        {printable.length} Karte(n) im Scheckkartenformat, 8 pro A4-Seite. Auf Android im Druckdialog „Als PDF speichern“
        wählen, um z. B. am Laptop zu drucken.
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
          <IdCard key={card.id} card={card} group={group} orgName={settings.orgName} />
        ))}
      </div>
    </div>
  );
}

function IdCard({ card, group, orgName }: { card: Card; group: Group | undefined; orgName: string }) {
  const color = group?.color ?? '#0f172a';
  const showHolder = Boolean(group?.printHolder && card.holder);
  return (
    <article className="id-card" style={{ borderColor: color }}>
      <header className="id-card-head" style={{ background: color, color: textColorOn(color) }}>
        <span className="id-card-group">{group?.name ?? 'Karte'}</span>
        <span className="id-card-org">{orgName}</span>
      </header>
      <div className="id-card-body">
        {showHolder ? (
          <>
            <HolderPhoto holder={card.holder} className="id-card-photo" />
            <div className="id-card-info">
              <div className="id-card-first">{card.holder?.firstName}</div>
              <div className="id-card-last">{card.holder?.lastName}</div>
              {card.holder?.company && <div className="id-card-meta">{card.holder.company}</div>}
              <div className="id-card-meta">Nr. {card.number}</div>
              {card.validUntil && <div className="id-card-meta">gültig bis {formatIsoDate(card.validUntil)}</div>}
            </div>
          </>
        ) : (
          <div className="id-card-info id-card-anon">
            <div className="id-card-number" style={{ color }}>
              {card.number}
            </div>
            <div className="id-card-meta">{group?.name}</div>
          </div>
        )}
        <QrImage token={card.token} className="id-card-qr" />
      </div>
      <footer className="id-card-foot" style={{ background: color }} />
    </article>
  );
}
