import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { assignHolderToFreeCard, listFreeCards } from '../db/cards';
import { db } from '../db/db';
import { parseCardPayload } from '../domain/cardCode';
import { toLocalDateString } from '../domain/dates';
import type { Group } from '../domain/types';
import { PhotoCapture } from './PhotoCapture';

type Validity = 'today' | 'open' | 'until';

interface Props {
  groups: Group[];
  /** Kamera-Scans an das Fenster umleiten (Karte durch Scannen auswählen). */
  registerScanTarget: (handler: ((text: string) => void) | null) => void;
  onClose: () => void;
  /** Nach dem Anmelden: optional direkt einbuchen. */
  onDone: (cardId: string, checkIn: boolean, label: string) => void;
}

/** Vorschlag: Gruppe mit Kürzel „B“ (Besucher), sonst eine Gruppe ohne Namensdruck, sonst die erste. */
function defaultGroup(groups: Group[]): Group | undefined {
  return groups.find((g) => g.prefix === 'B') ?? groups.find((g) => !g.printHolder) ?? groups[0];
}

/**
 * Besucher-Schnellerfassung am Empfang: freie Karte wählen (oder vor die Kamera
 * halten), Name/Firma/Foto eintragen, gültig nur heute, auf Wunsch gleich einbuchen.
 */
export function VisitorDialog({ groups, registerScanTarget, onClose, onDone }: Props) {
  const [groupId, setGroupId] = useState(() => defaultGroup(groups)?.id ?? '');
  const freeCards = useLiveQuery(() => (groupId ? listFreeCards(groupId) : []), [groupId], undefined);
  const [cardId, setCardId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [validity, setValidity] = useState<Validity>('today');
  const [until, setUntil] = useState(() => toLocalDateString(new Date()));
  const [checkIn, setCheckIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  // erste freie Karte vorschlagen, solange keine (gültige) gewählt ist
  useEffect(() => {
    if (!freeCards) return;
    if (!freeCards.some((c) => c.id === cardId)) setCardId(freeCards[0]?.id ?? '');
  }, [freeCards, cardId]);

  useEffect(() => firstField.current?.focus(), []);

  // Karte vor die Kamera halten → wird hier ausgewählt statt gebucht
  useEffect(() => {
    let last = '';
    let lastAt = 0;
    registerScanTarget((text) => {
      const now = Date.now();
      if (text === last && now - lastAt < 2500) return;
      last = text;
      lastAt = now;
      void (async () => {
        const token = parseCardPayload(text);
        const card = token ? await db.cards.where('token').equals(token).first() : undefined;
        if (!card) return setScanInfo('Dieser Code ist keine Karte dieser Anwendung.');
        if (card.holderEnc || card.holder) return setScanInfo(`Karte ${card.number} ist bereits vergeben.`);
        if (card.blocked || card.lostAt) return setScanInfo(`Karte ${card.number} ist gesperrt.`);
        setGroupId(card.groupId);
        setCardId(card.id);
        setScanInfo(`Karte ${card.number} gescannt und ausgewählt.`);
      })();
    });
    return () => registerScanTarget(null);
  }, [registerScanTarget]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!cardId) return setError('Bitte eine freie Karte wählen.');
    const today = toLocalDateString(new Date());
    const validFrom = validity === 'open' ? undefined : today;
    const validUntil = validity === 'today' ? today : validity === 'until' ? until : undefined;
    setBusy(true);
    try {
      const card = await assignHolderToFreeCard(cardId, {
        holder: { firstName, lastName, company: company || undefined, note: note || undefined, photo },
        validFrom,
        validUntil,
      });
      onDone(card.id, checkIn, `${[firstName, lastName].filter(Boolean).join(' ')} → Karte ${card.number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmelden fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="card form modal visitor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visitor-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <h2 id="visitor-title">Besucher anmelden</h2>
        <div className="form-grid">
          <label>
            Gruppe
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Karte
            <select value={cardId} onChange={(e) => setCardId(e.target.value)} disabled={!freeCards?.length}>
              {(freeCards ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}
                </option>
              ))}
            </select>
          </label>
        </div>
        {freeCards && freeCards.length === 0 && (
          <p className="hint">
            Keine freie Karte in dieser Gruppe. Der Admin kann unter „Karten“ neue Karten anlegen, oder eine Karte wird
            zurückgegeben.
          </p>
        )}
        <p className="muted small">Tipp: Die Karte, die Sie ausgeben, einfach vor die Kamera halten – sie wird hier ausgewählt.</p>
        {scanInfo && (
          <p className="form-success" role="status">
            {scanInfo}
          </p>
        )}
        <div className="form-grid">
          <label>
            Vorname
            <input ref={firstField} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Nachname
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Firma / Abteilung
            <input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Notiz (z. B. „Besuch bei …“)
            <input value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <details className="visitor-photo">
          <summary>Foto aufnehmen (optional)</summary>
          <PhotoCapture value={photo} onChange={setPhoto} />
        </details>
        <fieldset className="visitor-validity">
          <legend>Gültig</legend>
          <label className="checkbox">
            <input type="radio" name="validity" checked={validity === 'today'} onChange={() => setValidity('today')} /> nur heute
          </label>
          <span className="visitor-until">
            <label className="checkbox">
              <input type="radio" name="validity" checked={validity === 'until'} onChange={() => setValidity('until')} /> bis
            </label>
            <input
              type="date"
              value={until}
              min={toLocalDateString(new Date())}
              onChange={(e) => {
                setUntil(e.target.value);
                setValidity('until');
              }}
              aria-label="Gültig bis"
            />
          </span>
          <label className="checkbox">
            <input type="radio" name="validity" checked={validity === 'open'} onChange={() => setValidity('open')} /> unbefristet
          </label>
        </fieldset>
        <label className="checkbox">
          <input type="checkbox" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} /> gleich einbuchen
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={busy || !cardId || !(firstName.trim() || lastName.trim())}>
            {busy ? 'Wird angemeldet …' : 'Anmelden'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
