import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { loadAutoBackup } from '../../db/autoBackup';
import { db } from '../../db/db';
import { loadOperatorPin } from '../../db/vault';
import { formatDateTime } from '../../domain/dates';
import { useSettings } from '../../hooks/useSettings';
import { SETTINGS_SECTIONS } from './SettingsShell';

const THEME_LABEL = { auto: 'automatisch', light: 'hell', dark: 'dunkel' } as const;
const MODE_LABEL = { auto: 'automatisch', in: 'nur Eingang', out: 'nur Ausgang' } as const;

/** Übersicht der Einstellungen: ein Feld je Bereich mit dem aktuellen Stand. */
export function SettingsHome() {
  const settings = useSettings();
  const info = useLiveQuery(
    async () => ({
      groups: await db.groups.count(),
      cards: await db.cards.count(),
      events: await db.events.count(),
      pin: Boolean(await loadOperatorPin()),
      autoBackup: Boolean(await loadAutoBackup()),
    }),
    [],
  );

  const status: Record<string, string> = {
    '/einstellungen/allgemein': `Darstellung ${THEME_LABEL[settings.theme]} · ${settings.orgName}`,
    '/einstellungen/scanner': `Modus ${MODE_LABEL[settings.scanMode]} · Doppelscan-Schutz ${settings.cooldownSec} s${settings.testMode ? ' · Testmodus an' : ''}`,
    '/einstellungen/gruppen': info ? `${info.groups} Gruppe(n)` : '',
    '/einstellungen/sicherheit': `Admin-Abmeldung ${settings.autoLogoutMin ? `nach ${settings.autoLogoutMin} Min.` : 'nie'} · Löschfrist ${settings.retentionDays ? `${settings.retentionDays} Tage` : 'keine'}`,
    '/einstellungen/bediener': info ? (info.pin ? 'Bediener-PIN eingerichtet' : 'keine Bediener-PIN') : '',
    '/einstellungen/datensicherung': `Letztes Backup: ${settings.lastBackupAt ? formatDateTime(settings.lastBackupAt) : 'noch nie'}${info?.autoBackup ? ' · automatisch an' : ''}`,
    '/einstellungen/daten': info ? `${info.cards} Karten, ${info.events} Protokolleinträge` : '',
    '/einstellungen/geraet': `Version ${__APP_VERSION__}`,
  };

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1>Einstellungen</h1>
      </header>
      <ul className="settings-grid">
        {SETTINGS_SECTIONS.map((s) => (
          <li key={s.path}>
            <Link to={s.path} className="card settings-tile">
              <strong>{s.title}</strong>
              <span className="muted small">{s.description}</span>
              {status[s.path] && <span className="settings-status small">{status[s.path]}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
