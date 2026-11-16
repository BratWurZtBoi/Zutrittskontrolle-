import { Navigate } from 'react-router';
import { useLoadedSettings } from '../hooks/useSettings';
import { useSecurity } from '../security/useSecurity';
import { ScannerPage } from './ScannerPage';

/**
 * Startseite: im Kiosk-Modus der Vollbild-Scanner (Gerät am Eingang ohne Bediener),
 * sonst das Dashboard – bzw. die Anmeldung, solange niemand angemeldet ist.
 */
export function StartPage() {
  const settings = useLoadedSettings();
  const security = useSecurity();
  if (!settings) return null;
  if (settings.kioskMode) return <ScannerPage />;
  if (security.vault === 'setup') return <Navigate to="/einrichtung" replace />;
  if (security.admin || security.operator) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/anmelden" replace />;
}
