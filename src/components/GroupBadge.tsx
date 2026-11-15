import { textColorOn } from '../domain/color';
import type { Group } from '../domain/types';

/** Gruppenname auf der Gruppenfarbe. */
export function GroupBadge({ group, className = '' }: { group: Group | undefined; className?: string }) {
  if (!group) return <span className={`badge ${className}`}>Ohne Gruppe</span>;
  return (
    <span className={`badge group-badge ${className}`} style={{ background: group.color, color: textColorOn(group.color) }}>
      {group.name}
    </span>
  );
}
