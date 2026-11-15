import type { CardHolder } from '../domain/types';

interface Props {
  holder: CardHolder | undefined;
  /** Text, wenn keine Person zugeordnet ist (z. B. Kartennummer). */
  fallback?: string;
  className?: string;
}

/** Foto der Person, Initialen-Platzhalter oder – ohne Person – die Kartennummer. */
export function HolderPhoto({ holder, fallback = '?', className = '' }: Props) {
  if (holder?.photo) {
    return <img className={`photo ${className}`} src={holder.photo} alt={`Foto von ${holder.firstName} ${holder.lastName}`} />;
  }
  const text = holder ? `${holder.firstName[0] ?? ''}${holder.lastName[0] ?? ''}`.toUpperCase() : fallback;
  return (
    <div className={`photo photo-placeholder ${holder ? '' : 'photo-unassigned'} ${className}`} aria-label="Kein Foto">
      {text}
    </div>
  );
}
