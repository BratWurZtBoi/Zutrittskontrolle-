import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router';
import { PersonPhoto } from '../components/PersonPhoto';
import { QrImage } from '../components/QrImage';
import { listPersons } from '../db/persons';
import { formatIsoDate } from '../domain/dates';
import type { Person } from '../domain/types';
import { useSettings } from '../hooks/useSettings';
import { printCurrentPage } from '../lib/device';

/** Druckansicht für Ausweise im Scheckkartenformat (85,6 × 54 mm). */
export function CardsPage() {
  const [params] = useSearchParams();
  const ids = params.get('ids')?.split(',').filter(Boolean);
  const settings = useSettings();
  const persons = useLiveQuery(listPersons, []);
  if (!persons) return null;

  const selected = ids ? persons.filter((p) => ids.includes(p.id)) : persons;
  const printable = selected.filter((p) => !p.cardBlocked);
  const skipped = selected.length - printable.length;

  return (
    <div className="page cards-page">
      <header className="page-header no-print">
        <h1>Ausweise drucken</h1>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={printCurrentPage} disabled={printable.length === 0}>
            Drucken / PDF
          </button>
          <Link className="btn btn-ghost" to={ids?.length === 1 ? `/personen/${ids[0]}` : '/personen'}>
            Zurück
          </Link>
        </div>
      </header>
      <p className="muted no-print">
        {printable.length} Ausweis(e) im Scheckkartenformat auf A4. Auf Android im Druckdialog „Als PDF speichern“
        wählen, um die Ausweise z. B. am Laptop zu drucken.
        {skipped > 0 && ` ${skipped} gesperrte(r) Ausweis(e) werden nicht gedruckt.`}
      </p>
      <div className="cards-grid">
        {printable.map((p) => (
          <IdCard key={p.id} person={p} orgName={settings.orgName} />
        ))}
      </div>
    </div>
  );
}

function IdCard({ person, orgName }: { person: Person; orgName: string }) {
  return (
    <article className="id-card">
      <header className="id-card-head">
        <span>{orgName}</span>
        <span className="id-card-kind">Zutrittsausweis</span>
      </header>
      <div className="id-card-body">
        <PersonPhoto person={person} className="id-card-photo" />
        <div className="id-card-info">
          <div className="id-card-first">{person.firstName}</div>
          <div className="id-card-last">{person.lastName}</div>
          <div className="id-card-meta">ID {person.personnelNo}</div>
          {person.validUntil && <div className="id-card-meta">gültig bis {formatIsoDate(person.validUntil)}</div>}
        </div>
        <QrImage token={person.cardToken} className="id-card-qr" />
      </div>
    </article>
  );
}
