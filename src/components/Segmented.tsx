import type { ReactNode } from 'react';

/** Umschalter aus Knöpfen (Radiogruppe). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  small = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`segmented segmented-light${small ? ' segmented-small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
