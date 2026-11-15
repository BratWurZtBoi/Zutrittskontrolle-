import { Navigate, Outlet, useLocation } from 'react-router';
import { useSecurity } from '../security/useSecurity';

/** Schützt alle Verwaltungsseiten: ohne Anmeldung geht es zur Anmeldung bzw. Ersteinrichtung. */
export function RequireAdmin() {
  const security = useSecurity();
  const location = useLocation();
  const target = encodeURIComponent(location.pathname + location.search);
  if (security.vault === 'loading') return null;
  if (security.vault === 'setup') return <Navigate to={`/einrichtung?ziel=${target}`} replace />;
  if (!security.admin) return <Navigate to={`/anmelden?ziel=${target}`} replace />;
  return <Outlet />;
}
