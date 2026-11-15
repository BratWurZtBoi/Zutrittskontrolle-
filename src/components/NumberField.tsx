import { useEffect, useState, type FocusEvent } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  /** Wird nur mit gültigen Werten (innerhalb min–max) aufgerufen. */
  onChange: (value: number) => void;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

/**
 * Zahleneingabe, die sich wie ein normales Textfeld bedienen lässt:
 * Inhalt darf beim Tippen leer sein, beim Antippen wird er markiert (neue Zahl
 * ersetzt die alte), auf dem Handy erscheint die Zifferntastatur. Ungültige oder
 * leere Eingaben werden erst beim Verlassen des Feldes korrigiert.
 */
export function NumberField({ value, min, max, onChange, id, className, ...rest }: Props) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Änderungen von außen übernehmen, solange nicht getippt wird
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const parse = (t: string): number | null => {
    if (!/^\d+$/.test(t)) return null;
    const n = Number.parseInt(t, 10);
    return n >= min && n <= max ? n : null;
  };

  const commit = () => {
    const n = Number.parseInt(text, 10);
    const fixed = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    setText(String(fixed));
    if (fixed !== value) onChange(fixed);
  };

  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={text}
      aria-label={rest['aria-label']}
      onFocus={(e: FocusEvent<HTMLInputElement>) => {
        setFocused(true);
        e.target.select();
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '').slice(0, String(max).length);
        setText(t);
        const n = parse(t);
        if (n !== null && n !== value) onChange(n);
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
