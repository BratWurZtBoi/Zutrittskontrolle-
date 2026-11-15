import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { purgeOldEvents } from '../db/scans';
import { useSettings } from '../hooks/useSettings';
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
    const t = window.setInterval(() => checkAutoLogout(settings.autoLogoutMin), 20_000);
    return () => window.clearInterval(t);
  }, [settings.autoLogoutMin]);

  useEffect(() => {
    void purgeOldEvents(settings.retentionDays);
    const t = window.setInterval(() => void purgeOldEvents(settings.retentionDays), HOUR);
    return () => window.clearInterval(t);
  }, [settings.retentionDays]);

  return null;
}
