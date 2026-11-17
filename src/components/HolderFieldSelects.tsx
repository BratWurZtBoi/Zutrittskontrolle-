import { HOLDER_FILTER_FIELDS, holderFieldValues, type HolderFieldFilter } from '../domain/overview';
import type { CardHolder } from '../domain/types';

interface Props {
  /** Personen, aus denen die Auswahlwerte stammen. */
  holders: (CardHolder | undefined)[];
  value: HolderFieldFilter;
  onChange: (next: HolderFieldFilter) => void;
}

/** Auswahlfilter Einheit/Abteilung, Stellung/Posten und Raum – mit den tatsächlich vorkommenden Werten. */
export function HolderFieldSelects({ holders, value, onChange }: Props) {
  return (
    <>
      {HOLDER_FILTER_FIELDS.map(({ key, field, label, all }) => {
        const options = holderFieldValues(holders, field);
        const current = value[key] ?? '';
        if (current && !options.includes(current)) options.unshift(current);
        return (
          <select key={key} value={current} onChange={(e) => onChange({ ...value, [key]: e.target.value || undefined })} aria-label={label}>
            <option value="">{all}</option>
            {options.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        );
      })}
    </>
  );
}
