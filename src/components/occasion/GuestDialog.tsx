import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { listCards, type CardWithGroup } from '../../db/cards';
import { addGuest, deleteGuest, setGuestCancelled, updateGuest } from '../../db/occasions';
import { formatTime } from '../../domain/dates';
import { GUEST_STATUS_LABEL, findHolderMatches, guestStatus, type Guest, type GuestPerson } from '../../domain/occasion';
import { holderName, holderUnitLine } from '../../domain/texts';
import { useSecureLiveQuery } from '../../hooks/useSecureLiveQuery';
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

/** Vorhandene Karte, mit der der Gast hineinkommen kann. */
interface LinkedCard {
  id: string;
  number: string;
  groupName?: string;
  /** gesperrt/verloren → kann nicht gewählt werden */
  usable: boolean;
  /** Angaben aus der Kartenliste geladen */
  resolved?: boolean;
}

const usableCard = ({ card }: CardWithGroup) => card.hasHolder && !card.blocked && !card.lostAt;
const toLinked = (c: CardWithGroup): LinkedCard => ({ id: c.card.id, number: c.card.number, groupName: c.group?.name, usable: usableCard(c), resolved: true });

/** Gast anlegen oder bearbeiten: Anrede, Dienstgrad, Name, Einheit/Firma, Kategorie, E-Mail, Notiz. */
export function GuestDialog({ occasionId, guest, categories, admitOption = false, onClose, onSaved, onAdmit, onUndoAdmission }: Props) {
  const id = useId();
  const [person, setPerson] = useState<GuestPerson>(guest?.person ?? EMPTY);
  const [category, setCategory] = useState(guest?.category ?? '');
  const [admit, setAdmit] = useState(true);
  // Zutritt: mit Einladung (QR-Code) oder mit einer vorhandenen Karte
  const [linked, setLinked] = useState<LinkedCard | null>(
    guest?.cardId ? { id: guest.cardId, number: guest.cardNumber ?? '?', usable: true } : null,
  );
  const [useCard, setUseCard] = useState(Boolean(guest?.cardId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const set = (patch: Partial<GuestPerson>) => setPerson((p) => ({ ...p, ...patch }));
  const locked = guest?.hasPerson && !guest.person;
  // Bereits erfasste Personen (Karteninhaber) zum eingegebenen Namen erkennen
  const cards = useSecureLiveQuery(listCards, [], [] as CardWithGroup[]);
  const matches = useMemo(() => (linked || locked ? [] : findHolderMatches(cards, person)), [cards, person, linked, locked]);
  useEffect(() => {
    // Gruppe der verknüpften Karte nachtragen (beim Bearbeiten)
    if (!linked || linked.resolved) return;
    const c = cards.find((x) => x.card.id === linked.id);
    if (c) setLinked(toLinked(c));
  }, [cards, linked]);

  const takeOver = (c: CardWithGroup, withCard: boolean) => {
    const h = c.card.holder;
    if (h) setPerson((p) => ({ ...p, rank: h.rank, firstName: h.firstName, lastName: h.lastName, company: h.company }));
    setLinked(toLinked(c));
    setUseCard(withCard && usableCard(c));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cardId = useCard && linked ? linked.id : null;
      const saved = guest
        ? await updateGuest(guest.id, { person, category, cardId })
        : await addGuest(occasionId, { person, category, cardId: cardId ?? undefined });
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
        {matches.length > 0 && (
          <div className="guest-matches" role="group" aria-label="Bereits erfasste Personen">
            <p className="guest-matches-title">
              <strong>Bereits erfasst</strong> – Daten übernehmen und wählen, womit die Person hineinkommt:
            </p>
            <ul>
              {matches.map((c) => (
                <li key={c.card.id} className="guest-match">
                  <span className="guest-match-who">
                    <strong>{c.card.holder ? holderName(c.card.holder) : c.card.number}</strong>
                    <span className="muted small">
                      {[c.card.holder ? holderUnitLine(c.card.holder) : '', `Karte ${c.card.number}`, c.group?.name].filter(Boolean).join(' · ')}
                      {!usableCard(c) && ' · Karte gesperrt'}
                    </span>
                  </span>
                  <span className="guest-match-actions">
                    <button type="button" className="btn btn-small" onClick={() => takeOver(c, false)}>
                      Einladung
                    </button>
                    <button type="button" className="btn btn-small btn-primary" disabled={!usableCard(c)} onClick={() => takeOver(c, true)}>
                      Karte {c.card.number} gilt
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {linked && (
          <fieldset className="guest-access">
            <legend>Zutritt zur Veranstaltung mit</legend>
            <label className="checkbox">
              <input type="radio" name={`${id}-access`} checked={!useCard} onChange={() => setUseCard(false)} />
              Einladung mit QR-Code
            </label>
            <label className="checkbox">
              <input type="radio" name={`${id}-access`} checked={useCard} disabled={!linked.usable} onChange={() => setUseCard(true)} />
              <span>
                vorhandener Karte {linked.number}
                {linked.groupName ? ` (${linked.groupName})` : ''} – gilt für diese Veranstaltung, keine Einladung nötig
                {!linked.usable && ' – Karte ist gesperrt oder verloren'}
              </span>
            </label>
          </fieldset>
        )}
        {admitOption && (
          <label className="checkbox">
            <input type="checkbox" checked={admit} onChange={(e) => setAdmit(e.target.checked)} /> gleich einlassen
          </label>
        )}
        {guest && !useCard && (
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
