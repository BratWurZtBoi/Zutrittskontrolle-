import { cardStatus, toCardRules } from '../domain/access';
import { STATUS_LABEL } from '../domain/texts';
import type { Card, Group } from '../domain/types';

export function StatusBadge({ card, group }: { card: Card; group: Group | undefined }) {
  const status = cardStatus(toCardRules(card), group, new Date());
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
