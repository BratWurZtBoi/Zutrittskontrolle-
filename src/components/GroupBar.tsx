import type { Group } from '../domain/types';

/** Schmaler Farbbalken der Gruppe als erste Tabellenspalte (spart Platz gegenüber dem Gruppen-Abzeichen). */
export function GroupBarCell({ group, fallbackName }: { group: Group | undefined; fallbackName?: string }) {
  const name = group?.name ?? fallbackName;
  return (
    <td className="group-bar-cell" title={name}>
      <span className="group-bar" style={group ? { background: group.color } : undefined} />
      {name && <span className="sr-only">{name}</span>}
    </td>
  );
}
