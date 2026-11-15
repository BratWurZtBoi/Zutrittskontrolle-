import { Navigate, Outlet, useLocation } from 'react-router';
import { useSecurity } from '../security/useSecurity';

/**
 * Schützt Verwaltungsseiten: ohne passende Anmeldung geht es zur Anmeldung bzw. Ersteinrichtung.
 * - 'admin': nur mit Admin-Passwort
 * - 'staff': Admin oder Bediener (PIN) – Dashboard und Übersicht
 */
export function RequireRole({ allow }: { allow: 'admin' | 'staff' }) {
  const security = useSecurity();
  const location = useLocation();
  const target = encodeURIComponent(location.pathname + location.search);
  if (security.vault === 'loading') return null;
  if (security.vault === 'setup') return <Navigate to={`/einrichtung?ziel=${target}`} replace />;
  const allowed = allow === 'admin' ? security.admin : security.admin || security.operator;
  if (!allowed) return <Navigate to={`/anmelden?ziel=${target}`} replace />;
  return <Outlet />;
}
