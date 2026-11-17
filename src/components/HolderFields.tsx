import { useId, useMemo, type Ref } from 'react';
import { listCards } from '../db/cards';
import { holderFieldValues } from '../domain/overview';
import type { CardHolder } from '../domain/types';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';

type SuggestField = 'rank' | 'company' | 'position' | 'room';

/** Vorschläge aus den bereits eingetragenen Personen (Dienstgrad, Einheit, Stellung/Posten, Raum). */
export function useHolderSuggestions(): Record<SuggestField, string[]> {
  const cards = useSecureLiveQuery(listCards, []);
  return useMemo(() => {
    const holders = (cards ?? []).map(({ card }) => card.holder);
    return {
      rank: holderFieldValues(holders, 'rank'),
      company: holderFieldValues(holders, 'company'),
      position: holderFieldValues(holders, 'position'),
      room: holderFieldValues(holders, 'room'),
    };
  }, [cards]);
}

interface Props {
  holder: CardHolder;
  onChange: (patch: Partial<CardHolder>) => void;
  /** Kurzform (Besucher anmelden): ohne Stellung/Posten und Raum. */
  short?: boolean;
  /** Feld „Vorname“ (z. B. zum Fokussieren). */
  firstNameRef?: Ref<HTMLInputElement>;
}

/**
 * Personendaten: Dienstgrad, Vor- und Nachname, Einheit/Abteilung, Stellung/Posten, Raum.
 * Freitext mit Vorschlägen aus den schon verwendeten Werten (einheitliche Schreibweise).
 */
export function HolderFields({ holder, onChange, short = false, firstNameRef }: Props) {
  const id = useId();
  const suggestions = useHolderSuggestions();
  const list = (field: SuggestField) => `${id}-${field}`;

  return (
    <div className="form-grid holder-fields">
      <label>
        Dienstgrad
        <input value={holder.rank ?? ''} onChange={(e) => onChange({ rank: e.target.value })} list={list('rank')} autoComplete="off" />
      </label>
      <label>
        Vorname
        <input ref={firstNameRef} value={holder.firstName} onChange={(e) => onChange({ firstName: e.target.value })} autoComplete="off" />
      </label>
      <label>
        Nachname
        <input value={holder.lastName} onChange={(e) => onChange({ lastName: e.target.value })} autoComplete="off" />
      </label>
      <label>
        Einheit/Abteilung
        <input value={holder.company ?? ''} onChange={(e) => onChange({ company: e.target.value })} list={list('company')} autoComplete="off" />
      </label>
      {!short && (
        <>
          <label>
            Stellung/Posten
            <input
              value={holder.position ?? ''}
              onChange={(e) => onChange({ position: e.target.value })}
              list={list('position')}
              placeholder="z. B. Kompaniechef, S4, Admin"
              autoComplete="off"
            />
          </label>
          <label>
            Raum
            <input value={holder.room ?? ''} onChange={(e) => onChange({ room: e.target.value })} list={list('room')} autoComplete="off" />
          </label>
        </>
      )}
      {(['rank', 'company', 'position', 'room'] as const).map((field) => (
        <datalist key={field} id={list(field)}>
          {suggestions[field].map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
    </div>
  );
}
