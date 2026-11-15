import { personStatus } from '../domain/access';
import { STATUS_LABEL } from '../domain/texts';
import type { Person } from '../domain/types';

export function StatusBadge({ person }: { person: Person }) {
  const status = personStatus(person, new Date());
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
