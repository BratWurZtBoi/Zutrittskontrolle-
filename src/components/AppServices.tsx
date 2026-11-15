import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { runAutoBackup } from '../db/autoBackup';
import { upgradeLegacyLayouts } from '../db/layouts';
import { purgeOldEvents } from '../db/scans';
import { useSettings } from '../hooks/useSettings';
import { applyTheme } from '../lib/theme';
import { takePendingExit } from '../security/exit';
import { checkAutoLogout, initSecurity, lockAll, logout, touchActivity } from '../security/session';

const HOUR = 60 * 60 * 1000;

/** Hintergrunddienste: Sicherheitszustand laden, automatische Abmeldung, Löschfrist. */
export function AppServices() {
  const settings = useSettings();
  const location = useLocation();

  // vorgemerktes Abmelden/Sperren ausführen, sobald der Scanner angezeigt wird
  useEffect(() => {
    if (location.pathname !== '/') return;
    const kind = takePendingExit();
    if (kind === 'logout') logout();
    if (kind === 'lock') lockAll();
  }, [location.pathname, location.key]);

  useEffect(() => {
    void upgradeLegacyLayouts().catch(() => undefined); // Layouts der Version 0.7 umwandeln
    void initSecurity();
    const onActivity = () => touchActivity();
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => checkAutoLogout(settings.autoLogoutMin, Date.now(), settings.operatorAutoLogoutMin), 20_000);
    return () => window.clearInterval(t);
  }, [settings.autoLogoutMin, settings.operatorAutoLogoutMin]);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // Automatische Sicherung in einen Ordner: regelmäßig prüfen, ob sie fällig ist
  // (läuft nur, wenn eingerichtet und die Daten entsperrt sind)
  useEffect(() => {
    const check = () => void runAutoBackup(__APP_VERSION__).catch(() => undefined);
    const first = window.setTimeout(check, 30_000);
    const t = window.setInterval(check, 5 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    void purgeOldEvents(settings.retentionDays);
    const t = window.setInterval(() => void purgeOldEvents(settings.retentionDays), HOUR);
    return () => window.clearInterval(t);
  }, [settings.retentionDays]);

  return null;
}
