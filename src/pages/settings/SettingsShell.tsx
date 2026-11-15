import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

export interface SettingsSectionInfo {
  path: string;
  title: string;
  description: string;
}

/** Bereiche der Einstellungen – Reihenfolge = Reihenfolge in Übersicht und Seitenleiste. */
export const SETTINGS_SECTIONS: SettingsSectionInfo[] = [
  { path: '/einstellungen/allgemein', title: 'Allgemein', description: 'Hell/dunkel, Name der Organisation' },
  { path: '/einstellungen/scanner', title: 'Scanner', description: 'Modus, Doppelscan-Schutz, Kamera, Ton, Testmodus' },
  { path: '/einstellungen/gruppen', title: 'Gruppen', description: 'Farbe, Kürzel, Regeln, Bestätigung, Layout' },
  { path: '/einstellungen/karten', title: 'Kartenlayout', description: 'Aussehen der gedruckten Karten, Quer- oder Hochformat' },
  { path: '/einstellungen/praesentation', title: 'Präsentation', description: 'Ruhebildschirm und Scan-Anzeige für Gäste gestalten' },
  { path: '/einstellungen/sicherheit', title: 'Sicherheit', description: 'Admin-Passwort, automatische Abmeldung, Löschfrist' },
  { path: '/einstellungen/bediener', title: 'Bediener & Bestätigung', description: 'Bediener-PIN, Zeitlimit für Bestätigungen' },
  { path: '/einstellungen/datensicherung', title: 'Datensicherung', description: 'Backup erstellen, einspielen, automatisch sichern' },
  { path: '/einstellungen/daten', title: 'Daten', description: 'Testkarten, Protokoll leeren, alles löschen' },
  { path: '/einstellungen/geraet', title: 'Gerät & App', description: 'Version, Installation, dauerhafter Speicher' },
];

interface Props {
  title: string;
  /** Schaltflächen rechts neben der Überschrift. */
  actions?: ReactNode;
  /** Breiter Inhalt (z. B. Layout-Editor). */
  wide?: boolean;
  children: ReactNode;
}

/**
 * Rahmen für alle Einstellungsseiten: am Computer mit Seitenleiste aller Bereiche,
 * auf dem Handy mit „← Einstellungen“ zurück zur Übersicht.
 */
export function SettingsShell({ title, actions, wide = false, children }: Props) {
  return (
    <div className={wide ? 'settings-shell settings-wide' : 'settings-shell'}>
      <nav className="settings-nav no-print" aria-label="Bereiche der Einstellungen">
        <NavLink end to="/einstellungen" className="settings-nav-link">
          Übersicht
        </NavLink>
        {SETTINGS_SECTIONS.map((s) => (
          <NavLink key={s.path} to={s.path} className="settings-nav-link">
            {s.title}
          </NavLink>
        ))}
      </nav>
      <div className="settings-content">
        <Link to="/einstellungen" className="settings-back no-print">
          ← Einstellungen
        </Link>
        <header className="page-header">
          <h1>{title}</h1>
          {actions}
        </header>
        {children}
      </div>
    </div>
  );
}
