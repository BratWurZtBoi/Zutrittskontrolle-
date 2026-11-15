import { useLiveQuery } from 'dexie-react-hooks';
import { useSecurity } from '../security/useSecurity';

/**
 * Wie useLiveQuery, lädt aber zusätzlich neu, wenn die Daten ent- oder gesperrt
 * werden (dann ändert sich, was entschlüsselt angezeigt werden kann).
 */
export function useSecureLiveQuery<T, D = undefined>(
  querier: () => Promise<T> | T,
  deps: unknown[],
  defaultResult?: D,
): T | D {
  const { vault } = useSecurity();
  return useLiveQuery(querier, [...deps, vault], defaultResult as D);
}
