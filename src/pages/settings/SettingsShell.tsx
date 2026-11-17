import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Link, NavLink } from 'react-router';

export type SettingsGroupId = 'betrieb' | 'gestaltung' | 'daten' | 'allgemein';

export interface SettingsSectionInfo {
  path: string;
  title: string;
  description: string;
  group: SettingsGroupId;
}

/** Gruppen in Übersicht und Seitenleiste. */
export const SETTINGS_GROUPS: { id: SettingsGroupId; title: string }[] = [
  { id: 'betrieb', title: 'Betrieb' },
  { id: 'gestaltung', title: 'Gestaltung' },
  { id: 'daten', title: 'Daten & Sicherheit' },
  { id: 'allgemein', title: 'Allgemein & Gerät' },
];

/** Bereiche der Einstellungen – Reihenfolge innerhalb der Gruppe = Reihenfolge in Übersicht und Seitenleiste. */
export const SETTINGS_SECTIONS: SettingsSectionInfo[] = [
  { path: '/einstellungen/scanner', title: 'Scanner', description: 'Doppelscan-Schutz, Anzeigedauer, Ton, USB-Scanner, Kiosk-Modus, Testmodus', group: 'betrieb' },
  { path: '/einstellungen/gruppen', title: 'Gruppen', description: 'Farbe, Kürzel, Regeln, Bestätigung, Layout', group: 'betrieb' },
  { path: '/einstellungen/bediener', title: 'Bediener & Bestätigung', description: 'Bediener-PIN, Zeitlimit für Bestätigungen', group: 'betrieb' },
  { path: '/einstellungen/karten', title: 'Kartenlayout', description: 'Gedruckte Karten: Bausteine, Formate, Rückseite', group: 'gestaltung' },
  { path: '/einstellungen/praesentation', title: 'Präsentation', description: 'Ruhebildschirm und Scan-Anzeige für Gäste gestalten', group: 'gestaltung' },
  { path: '/einstellungen/sicherheit', title: 'Sicherheit', description: 'Admin-Passwort, automatische Abmeldung, Löschfrist', group: 'daten' },
  { path: '/einstellungen/datensicherung', title: 'Datensicherung', description: 'Backup erstellen, einspielen, automatisch sichern', group: 'daten' },
  { path: '/einstellungen/daten', title: 'Daten', description: 'Testkarten, Protokoll leeren, alles löschen', group: 'daten' },
  { path: '/einstellungen/allgemein', title: 'Allgemein & Gerät', description: 'Hell/dunkel, Organisation, Notfallliste-Drucker, Version, Installation', group: 'allgemein' },
];

/** Bereiche einer Gruppe. */
export function sectionsOf(group: SettingsGroupId): SettingsSectionInfo[] {
  return SETTINGS_SECTIONS.filter((s) => s.group === group);
}

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
          Alle Einstellungen
        </NavLink>
        {SETTINGS_GROUPS.map((g) => (
          <Fragment key={g.id}>
            <span className="settings-nav-group">{g.title}</span>
            {sectionsOf(g.id).map((s) => (
              <NavLink key={s.path} to={s.path} className="settings-nav-link">
                {s.title}
              </NavLink>
            ))}
          </Fragment>
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
