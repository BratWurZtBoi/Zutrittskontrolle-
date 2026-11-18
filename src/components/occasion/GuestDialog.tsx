import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { addGuest, deleteGuest, setGuestCancelled, updateGuest } from '../../db/occasions';
import { formatTime } from '../../domain/dates';
import { GUEST_STATUS_LABEL, guestStatus, type Guest, type GuestPerson } from '../../domain/occasion';
import { QrImage } from '../QrImage';

interface Props {
  occasionId: string;
  /** Bearbeiten; ohne = neuer Gast. */
  guest?: Guest;
  categories: string[];
  /** Einlass-Dashboard: „Gast nachtragen“ – nach dem Speichern gleich einlassen (abschaltbar). */
  admitOption?: boolean;
  onClose: () => void;
  /** Nach dem Speichern; admit = gleich einlassen gewünscht. */
  onSaved?: (guest: Guest, admit: boolean) => void;
  /** Einlass von Hand bzw. zurücknehmen (nur Bearbeiten). */
  onAdmit?: (guest: Guest) => void;
  onUndoAdmission?: (guest: Guest) => void;
}

const EMPTY: GuestPerson = { firstName: '', lastName: '' };

/** Gast anlegen oder bearbeiten: Anrede, Dienstgrad, Name, Einheit/Firma, Kategorie, E-Mail, Notiz. */
export function GuestDialog({ occasionId, guest, categories, admitOption = false, onClose, onSaved, onAdmit, onUndoAdmission }: Props) {
  const id = useId();
  const [person, setPerson] = useState<GuestPerson>(guest?.person ?? EMPTY);
  const [category, setCategory] = useState(guest?.category ?? '');
  const [admit, setAdmit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const set = (patch: Partial<GuestPerson>) => setPerson((p) => ({ ...p, ...patch }));
  const locked = guest?.hasPerson && !guest.person;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const saved = guest ? await updateGuest(guest.id, { person, category }) : await addGuest(occasionId, { person, category });
      onSaved?.(saved, admitOption && admit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const status = guest ? guestStatus(guest) : undefined;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="card form modal guest-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <h2 id={`${id}-title`}>{guest ? `Gast Nr. ${guest.number}` : admitOption ? 'Gast nachtragen' : 'Gast hinzufügen'}</h2>
        {guest && (
          <p className="muted">
            Status: <strong>{GUEST_STATUS_LABEL[status!]}</strong>
            {guest.admittedAt ? ` um ${formatTime(guest.admittedAt)} Uhr` : ''}
          </p>
        )}
        {locked ? (
          <p className="hint">Die Personendaten sind gesperrt – bitte als Admin anmelden.</p>
        ) : (
          <div className="form-grid">
            <label>
              Anrede
              <input value={person.salutation ?? ''} onChange={(e) => set({ salutation: e.target.value })} list={`${id}-sal`} autoComplete="off" />
              <datalist id={`${id}-sal`}>
                <option value="Herr" />
                <option value="Frau" />
              </datalist>
            </label>
            <label>
              Dienstgrad
              <input value={person.rank ?? ''} onChange={(e) => set({ rank: e.target.value })} autoComplete="off" />
            </label>
            <label>
              Vorname
              <input ref={first} value={person.firstName} onChange={(e) => set({ firstName: e.target.value })} autoComplete="off" />
            </label>
            <label>
              Nachname
              <input value={person.lastName} onChange={(e) => set({ lastName: e.target.value })} autoComplete="off" />
            </label>
            <label>
              Einheit/Firma
              <input value={person.company ?? ''} onChange={(e) => set({ company: e.target.value })} autoComplete="off" />
            </label>
            <label>
              Kategorie
              <input value={category} onChange={(e) => setCategory(e.target.value)} list={`${id}-cat`} placeholder="z. B. VIP, Presse, Gast" autoComplete="off" />
              <datalist id={`${id}-cat`}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              E-Mail
              <input type="email" value={person.email ?? ''} onChange={(e) => set({ email: e.target.value })} autoComplete="off" />
            </label>
            <label>
              Notiz
              <input value={person.note ?? ''} onChange={(e) => set({ note: e.target.value })} autoComplete="off" />
            </label>
          </div>
        )}
        {admitOption && (
          <label className="checkbox">
            <input type="checkbox" checked={admit} onChange={(e) => setAdmit(e.target.checked)} /> gleich einlassen
          </label>
        )}
        {guest && (
          <details className="guest-qr">
            <summary>QR-Code der Einladung anzeigen</summary>
            <QrImage token={guest.token} kind="guest" className="guest-qr-image" />
            <p className="muted small">Gilt nur einmal. Zum Ausprobieren mit der Kamera eines anderen Geräts scannen.</p>
          </details>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="button-row">
          {!locked && (
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Wird gespeichert …' : 'Speichern'}
            </button>
          )}
          {guest && status === 'open' && onAdmit && (
            <button type="button" className="btn" onClick={() => onAdmit(guest)}>
              Einlassen
            </button>
          )}
          {guest && status === 'admitted' && onUndoAdmission && (
            <button type="button" className="btn" onClick={() => onUndoAdmission(guest)}>
              Einlass zurücknehmen
            </button>
          )}
          {guest && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void setGuestCancelled(guest.id, !guest.cancelled).then(onClose)}
            >
              {guest.cancelled ? 'Stornierung aufheben' : 'Einladung stornieren'}
            </button>
          )}
          {guest && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(`Gast Nr. ${guest.number} endgültig löschen? Die Einladung wird ungültig.`)) void deleteGuest(guest.id).then(onClose);
              }}
            >
              Löschen
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
