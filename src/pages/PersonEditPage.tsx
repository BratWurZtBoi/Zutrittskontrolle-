import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PhotoCapture } from '../components/PhotoCapture';
import { QrImage } from '../components/QrImage';
import { StatusBadge } from '../components/StatusBadge';
import {
  ValidationError,
  createPerson,
  deletePerson,
  getPerson,
  reissueCard,
  setCardBlocked,
  suggestPersonnelNo,
  updatePerson,
} from '../db/persons';
import { formatDateTime } from '../domain/dates';
import type { Person, PersonInput } from '../domain/types';

const EMPTY: PersonInput = { personnelNo: '', firstName: '', lastName: '', accessGranted: true };

function toInput(p: Person): PersonInput {
  return {
    personnelNo: p.personnelNo,
    firstName: p.firstName,
    lastName: p.lastName,
    photo: p.photo,
    accessGranted: p.accessGranted,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    note: p.note,
    testData: p.testData,
  };
}

export function PersonEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  // Hülle, damit „lädt noch“ (undefined) von „nicht gefunden“ unterscheidbar ist
  const loaded = useLiveQuery(async () => ({ person: id ? await getPerson(id) : undefined }), [id]);
  const person = loaded?.person;
  const [form, setForm] = useState<PersonInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Formular einmalig befüllen
  useEffect(() => {
    if (form) return;
    if (isNew) void suggestPersonnelNo().then((no) => setForm({ ...EMPTY, personnelNo: no }));
    else if (person) setForm(toInput(person));
  }, [isNew, person, form]);

  if (!isNew && loaded && !person && !form) {
    return (
      <div className="page">
        <p>Diese Person existiert nicht (mehr).</p>
        <Link to="/personen">Zurück zur Liste</Link>
      </div>
    );
  }
  if (!form) return null;

  const set = <K extends keyof PersonInput>(key: K, value: PersonInput[K]) => {
    setForm({ ...form, [key]: value });
    setSaved(false);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isNew) {
        const created = await createPerson(form);
        navigate(`/personen/${created.id}`, { replace: true });
      } else {
        await updatePerson(id, form);
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const onDelete = async () => {
    if (!id || !window.confirm(`${form.firstName} ${form.lastName} wirklich löschen? Das Protokoll bleibt erhalten.`)) return;
    await deletePerson(id);
    navigate('/personen', { replace: true });
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>{isNew ? 'Neue Person' : `${person?.firstName ?? ''} ${person?.lastName ?? ''}`}</h1>
        <Link className="btn btn-ghost" to="/personen">
          Zurück
        </Link>
      </header>

      <div className="edit-layout">
        <form className="card form" onSubmit={(e) => void onSubmit(e)}>
          <h2>Stammdaten</h2>
          <div className="form-grid">
            <label>
              Vorname
              <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" required />
            </label>
            <label>
              Nachname
              <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" required />
            </label>
            <label>
              ID / Personalnummer
              <input value={form.personnelNo} onChange={(e) => set('personnelNo', e.target.value)} maxLength={20} required />
            </label>
          </div>

          <h3>Foto</h3>
          <PhotoCapture value={form.photo} onChange={(v) => set('photo', v)} />

          <h2>Zutrittsberechtigung</h2>
          <label className="checkbox">
            <input type="checkbox" checked={form.accessGranted} onChange={(e) => set('accessGranted', e.target.checked)} />
            Zutritt erlaubt
          </label>
          <div className="form-grid">
            <label>
              Gültig ab (optional)
              <input type="date" value={form.validFrom ?? ''} onChange={(e) => set('validFrom', e.target.value || undefined)} />
            </label>
            <label>
              Gültig bis (optional)
              <input type="date" value={form.validUntil ?? ''} onChange={(e) => set('validUntil', e.target.value || undefined)} />
            </label>
          </div>
          <label>
            Notiz
            <textarea rows={2} value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} />
          </label>

          {error && <p className="form-error">{error}</p>}
          {saved && <p className="form-success">Gespeichert.</p>}
          <div className="button-row">
            <button type="submit" className="btn btn-primary">
              {isNew ? 'Anlegen' : 'Speichern'}
            </button>
            {!isNew && (
              <button type="button" className="btn btn-danger" onClick={() => void onDelete()}>
                Person löschen
              </button>
            )}
          </div>
        </form>

        {person && <CardSection person={person} />}
      </div>
    </div>
  );
}

function CardSection({ person }: { person: Person }) {
  const toggleBlock = async () => {
    const msg = person.cardBlocked ? 'Ausweis wieder entsperren?' : 'Ausweis sperren? Er wird beim Scannen abgewiesen.';
    if (window.confirm(msg)) await setCardBlocked(person.id, !person.cardBlocked);
  };
  const reissue = async () => {
    if (window.confirm('Neuen Ausweis ausstellen? Der bisherige QR-Code wird sofort ungültig.')) {
      await reissueCard(person.id);
    }
  };

  return (
    <section className="card card-section">
      <h2>Ausweis</h2>
      <QrImage token={person.cardToken} className={person.cardBlocked ? 'qr-blocked' : ''} />
      <p>
        <StatusBadge person={person} />
      </p>
      <p className="muted">Ausgestellt am {formatDateTime(person.cardIssuedAt)}</p>
      <div className="button-row">
        <Link className="btn btn-primary" to={`/ausweise?ids=${person.id}`}>
          Ausweis drucken
        </Link>
        <button type="button" className={person.cardBlocked ? 'btn' : 'btn btn-danger'} onClick={() => void toggleBlock()}>
          {person.cardBlocked ? 'Entsperren' : 'Sperren'}
        </button>
        <button type="button" className="btn" onClick={() => void reissue()}>
          Neuen Ausweis ausstellen
        </button>
      </div>
    </section>
  );
}
