import type { Person } from '../domain/types';

interface Props {
  person: Pick<Person, 'photo' | 'firstName' | 'lastName'> | undefined;
  className?: string;
}

/** Foto der Person oder ein neutraler Platzhalter mit Initialen. */
export function PersonPhoto({ person, className = '' }: Props) {
  if (person?.photo) {
    return <img className={`photo ${className}`} src={person.photo} alt={`Foto von ${person.firstName} ${person.lastName}`} />;
  }
  const initials = person ? `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase() : '?';
  return (
    <div className={`photo photo-placeholder ${className}`} aria-label="Kein Foto">
      {initials}
    </div>
  );
}
