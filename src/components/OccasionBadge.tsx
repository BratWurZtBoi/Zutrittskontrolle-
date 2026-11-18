import { textColorOn } from '../domain/color';

/** Schild in der Farbe der Veranstaltung (z. B. Name der Veranstaltung oder Kategorie des Gastes). */
export function OccasionBadge({ name, color, className = '' }: { name: string; color: string; className?: string }) {
  return (
    <span className={`badge group-badge ${className}`} style={{ background: color, color: textColorOn(color) }}>
      {name}
    </span>
  );
}
