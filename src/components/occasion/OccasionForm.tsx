import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { listLayouts } from '../../db/layouts';
import type { OccasionInput } from '../../db/occasions';
import { OCCASION_COLORS } from '../../domain/occasion';
import { BUILT_IN_LAYOUTS } from '../../domain/presentationLayout';
import { InfoTip } from '../InfoTip';

interface Props {
  initial: OccasionInput;
  submitLabel: string;
  onSubmit: (input: OccasionInput) => Promise<void>;
  onCancel?: () => void;
}

/** Angaben zur Veranstaltung: Name, Datum, Ort, Einlass, Farbe, Dienstausweise, Gästebildschirm. */
export function OccasionForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<OccasionInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const layouts = useLiveQuery(listLayouts, [], BUILT_IN_LAYOUTS);
  const set = (patch: Partial<OccasionInput>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(form);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form occasion-form" onSubmit={(e) => void submit(e)}>
      <div className="form-grid">
        <label>
          Name der Veranstaltung
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="z. B. Sommerfest" autoComplete="off" />
        </label>
        <label>
          Datum
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label>
          Ort (optional)
          <input value={form.location ?? ''} onChange={(e) => set({ location: e.target.value })} autoComplete="off" />
        </label>
        <label>
          <span>
            Einlass ab (optional) <InfoTip hint="occasionEntry" />
          </span>
          <input type="time" value={form.entryFrom ?? ''} onChange={(e) => set({ entryFrom: e.target.value })} />
        </label>
        <label>
          Einlass bis (optional)
          <input type="time" value={form.entryUntil ?? ''} onChange={(e) => set({ entryUntil: e.target.value })} />
        </label>
      </div>
      <fieldset className="occasion-colors">
        <legend>Farbe (Band, Einlass-Anzeige, Gästebildschirm)</legend>
        {OCCASION_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={form.color === c ? 'color-swatch active' : 'color-swatch'}
            style={{ background: c }}
            aria-label={`Farbe ${c}`}
            aria-pressed={form.color === c}
            onClick={() => set({ color: c })}
          />
        ))}
        <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} aria-label="Eigene Farbe" />
      </fieldset>
      <label className="checkbox">
        <input type="checkbox" checked={form.cardsAllowed} onChange={(e) => set({ cardsAllowed: e.target.checked })} />
        Dienstausweise gelten zusätzlich (Personal kommt ohne Einladung hinein) <InfoTip hint="occasionCards" />
      </label>
      <div className="form-grid">
        <label>
          Gästebildschirm: Scan-Anzeige
          <select value={form.resultLayoutId ?? ''} onChange={(e) => set({ resultLayoutId: e.target.value || undefined })}>
            <option value="">wie sonst (Standard-Einstellung)</option>
            {layouts
              .filter((l) => l.kind === 'result')
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Gästebildschirm: Ruhebildschirm
          <select value={form.idleLayoutId ?? ''} onChange={(e) => set({ idleLayoutId: e.target.value || undefined })}>
            <option value="">wie sonst (Standard-Einstellung)</option>
            {layouts
              .filter((l) => l.kind === 'idle')
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      {saved && !error && (
        <p className="form-success" role="status">
          Gespeichert.
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
