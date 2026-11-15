import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { GroupBadge } from '../components/GroupBadge';
import { PhotoCapture } from '../components/PhotoCapture';
import { QrImage } from '../components/QrImage';
import { StatusBadge } from '../components/StatusBadge';
import { deleteCard, reissueToken, returnCard, setCardBlocked, toCard, updateCard } from '../db/cards';
import { ValidationError, db } from '../db/db';
import { formatDateTime, formatTime, toLocalDateString } from '../domain/dates';
import type { Card, CardHolder, CardUpdate, Group } from '../domain/types';

const EMPTY_HOLDER: CardHolder = { firstName: '', lastName: '' };

function toForm(card: Card): CardUpdate {
  return {
    accessGranted: card.accessGranted,
    validFrom: card.validFrom,
    validUntil: card.validUntil,
    holder: card.holder ? { ...card.holder } : undefined,
  };
}

export function CardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  // Hülle, damit „lädt noch“ (undefined) von „nicht gefunden“ unterscheidbar ist
  const loaded = useSecureLiveQuery(async () => {
    // erst alle Datenbankzugriffe, dann entschlüsseln (getCard)
    const record = await db.cards.get(id);
    const group = record ? await db.groups.get(record.groupId) : undefined;
    const presence = record ? await db.presence.get(record.id) : undefined;
    const card = record ? await toCard(record) : undefined;
    return { card, group, presence };
  }, [id]);
  const [form, setForm] = useState<CardUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Ungespeicherte Eingaben – solange true, wird das Formular nicht überschrieben. */
  const [dirty, setDirty] = useState(false);
  const card = loaded?.card;

  // Formular mit dem gespeicherten Stand befüllen (beim Laden und nach Änderungen)
  useEffect(() => {
    if (card && !dirty) setForm(toForm(card));
  }, [card, dirty]);

  if (!loaded) return null;
  if (!card) {
    return (
      <div className="page">
        <p>Diese Karte existiert nicht (mehr).</p>
        <Link to="/karten">Zurück zur Liste</Link>
      </div>
    );
  }
  if (!form) return null;

  const set = (patch: Partial<CardUpdate>) => {
    setForm({ ...form, ...patch });
    setSaved(false);
    setDirty(true);
  };
  const setHolder = (patch: Partial<CardHolder>) => set({ holder: { ...(form.holder ?? EMPTY_HOLDER), ...patch } });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateCard(card.id, form);
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const today = toLocalDateString(new Date());
  const holderChanged = JSON.stringify(form.holder ?? null) !== JSON.stringify(card.holder ?? null);

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          Karte {card.number} <GroupBadge group={loaded.group} />
        </h1>
        <Link className="btn btn-ghost" to={`/karten?gruppe=${card.groupId}`}>
          Zurück
        </Link>
      </header>

      <div className="edit-layout">
        <form className="card form" onSubmit={(e) => void onSubmit(e)}>
          <h2>Karteninhaber</h2>
          {form.holder ? (
            <>
              <div className="form-grid">
                <label>
                  Vorname
                  <input value={form.holder.firstName} onChange={(e) => setHolder({ firstName: e.target.value })} autoComplete="off" />
                </label>
                <label>
                  Nachname
                  <input value={form.holder.lastName} onChange={(e) => setHolder({ lastName: e.target.value })} autoComplete="off" />
                </label>
                <label>
                  Firma / Abteilung
                  <input value={form.holder.company ?? ''} onChange={(e) => setHolder({ company: e.target.value })} autoComplete="off" />
                </label>
              </div>
              <h3>Foto</h3>
              <PhotoCapture value={form.holder.photo} onChange={(photo) => setHolder({ photo })} />
              <label>
                Notiz
                <textarea rows={2} value={form.holder.note ?? ''} onChange={(e) => setHolder({ note: e.target.value })} />
              </label>
              {card.holder && holderChanged && (
                <p className="hint">Hinweis: Bei einem Personenwechsel wird die bisherige Person automatisch ausgebucht.</p>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => set({ holder: undefined })}>
                Personendaten entfernen
              </button>
            </>
          ) : (
            <div className="unassigned-box">
              <p>Diese Karte ist keiner Person zugeordnet.</p>
              <button type="button" className="btn" onClick={() => set({ holder: { ...EMPTY_HOLDER } })}>
                Person zuweisen
              </button>
            </div>
          )}

          <h2>Zutrittsberechtigung</h2>
          <label className="checkbox">
            <input type="checkbox" checked={form.accessGranted} onChange={(e) => set({ accessGranted: e.target.checked })} />
            Zutritt erlaubt
          </label>
          <div className="form-grid">
            <label>
              Gültig ab (optional)
              <input type="date" value={form.validFrom ?? ''} onChange={(e) => set({ validFrom: e.target.value || undefined })} />
            </label>
            <label>
              Gültig bis (optional)
              <input type="date" value={form.validUntil ?? ''} onChange={(e) => set({ validUntil: e.target.value || undefined })} />
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="btn btn-small" onClick={() => set({ validFrom: today, validUntil: today })}>
              Nur heute
            </button>
            <button type="button" className="btn btn-small" onClick={() => set({ validFrom: undefined, validUntil: undefined })}>
              Unbefristet
            </button>
          </div>

          {error && <p className="form-error">{error}</p>}
          {saved && <p className="form-success">Gespeichert.</p>}
          <div className="button-row form-actions">
            <button type="submit" className="btn btn-primary">
              Speichern
            </button>
          </div>
        </form>

        <CardSection
          card={card}
          group={loaded.group}
          presentSince={loaded.presence?.status === 'in' ? loaded.presence.lastBookingAt : undefined}
          onReturned={() => setDirty(false)}
          onDeleted={() => navigate('/karten', { replace: true })}
        />
      </div>
    </div>
  );
}

interface CardSectionProps {
  card: Card;
  group: Group | undefined;
  presentSince?: number;
  onReturned: () => void;
  onDeleted: () => void;
}

function CardSection({ card, group, presentSince, onReturned, onDeleted }: CardSectionProps) {
  const toggleBlock = async () => {
    const msg = card.blocked ? 'Karte wieder entsperren?' : 'Karte sperren? Sie wird beim Scannen abgewiesen.';
    if (window.confirm(msg)) await setCardBlocked(card.id, !card.blocked);
  };
  const reissue = async () => {
    if (window.confirm('Neuen QR-Code erzeugen? Der bisher gedruckte Code wird sofort ungültig – die Karte muss neu gedruckt werden.')) {
      await reissueToken(card.id);
    }
  };
  const giveBack = async () => {
    if (window.confirm('Karte zurückgeben? Die Person wird ausgebucht, Personendaten und Gültigkeit werden entfernt.')) {
      await returnCard(card.id);
      onReturned();
    }
  };
  const remove = async () => {
    if (window.confirm(`Karte ${card.number} endgültig löschen? Das Protokoll bleibt erhalten.`)) {
      await deleteCard(card.id);
      onDeleted();
    }
  };

  return (
    <section className="card card-section">
      <h2>Karte</h2>
      <QrImage token={card.token} className={card.blocked ? 'qr-blocked' : ''} />
      <p className="button-row">
        <StatusBadge card={card} group={group} />
        {presentSince !== undefined && <span className="badge badge-present">anwesend seit {formatTime(presentSince)}</span>}
      </p>
      <p className="muted">QR-Code erzeugt am {formatDateTime(card.tokenIssuedAt)}</p>
      <div className="button-row">
        <Link className="btn btn-primary" to={`/druck?ids=${card.id}`}>
          Karte drucken
        </Link>
        {card.holder && (
          <button type="button" className="btn" onClick={() => void giveBack()}>
            Karte zurückgeben
          </button>
        )}
        <button type="button" className={card.blocked ? 'btn' : 'btn btn-danger'} onClick={() => void toggleBlock()}>
          {card.blocked ? 'Entsperren' : 'Sperren'}
        </button>
        <button type="button" className="btn" onClick={() => void reissue()}>
          Neuer QR-Code
        </button>
        <button type="button" className="btn btn-danger" onClick={() => void remove()}>
          Karte löschen
        </button>
      </div>
    </section>
  );
}
