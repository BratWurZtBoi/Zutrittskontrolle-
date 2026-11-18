import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useSettings } from '../hooks/useSettings';
import { requestExit } from '../security/exit';
import { useSecurity } from '../security/useSecurity';
import { EMERGENCY_PRINT_PATH, type EmergencyNavState } from '../lib/emergency';
import { endEntry } from '../db/occasions';
import { textColorOn } from '../domain/color';
import { formatIsoDate } from '../domain/dates';
import type { Occasion } from '../domain/occasion';
import { useActiveOccasion } from '../hooks/useOccasion';
import { AlertIcon, CalendarIcon, CardIcon, DashboardIcon, ExitIcon, HelpIcon, ListIcon, LockIcon, ScanIcon, SettingsIcon, TicketIcon } from './Icons';
import { HelpPanel, helpCoversPage } from './help/HelpPanel';

/** short = Beschriftung in der schmalen Menüleiste unten (Handy). */
const NAV: { to: string; label: string; short?: string; icon: typeof DashboardIcon; operator: boolean }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon, operator: true },
  { to: '/auswertung', label: 'Auswertung', icon: ListIcon, operator: true },
  { to: '/karten', label: 'Karten', icon: CardIcon, operator: false },
  { to: '/veranstaltungen', label: 'Veranstaltungen', short: 'Events', icon: CalendarIcon, operator: false },
  { to: '/einstellungen', label: 'Einstellungen', icon: SettingsIcon, operator: false },
];

export function Layout() {
  const security = useSecurity();
  const navigate = useNavigate();
  const location = useLocation();
  const occasion = useActiveOccasion();
  // Vollbild-Scanner nur im Kiosk-Modus (Gerät am Eingang ohne Bediener)
  const { kioskMode } = useSettings();
  const staff = security.admin || security.operator;
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const closeHelp = () => {
    setHelpOpen(false);
    helpButton.current?.focus();
  };
  // Hilfe deckt auf schmalen Bildschirmen die Seite ab → beim Seitenwechsel schließen; nach dem Abmelden immer
  useEffect(() => {
    if (helpCoversPage()) setHelpOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!staff) setHelpOpen(false);
  }, [staff]);

  return (
    <div className={helpOpen && staff ? 'app help-open' : 'app'}>
      <nav className="app-nav no-print" aria-label="Hauptnavigation">
        <span className="app-title">
          Zutrittskontrolle
          {security.operator && <span className="role-badge">Bediener</span>}
        </span>
        {kioskMode && (
          <NavLink to="/" end className="nav-link">
            <ScanIcon />
            <span>Kiosk</span>
          </NavLink>
        )}
        {staff ? (
          <>
            {NAV.filter((n) => security.admin || n.operator).map(({ to, label, short, icon: Icon }) => {
              // Einlass-Modus: aus dem Dashboard wird „Einlass“
              const entry = to === '/dashboard' && occasion;
              const ItemIcon = entry ? TicketIcon : Icon;
              return (
                <NavLink key={to} to={to} className="nav-link">
                  <ItemIcon />
                  <span className="nav-label" data-short={short}>
                    {entry ? 'Einlass' : label}
                  </span>
                </NavLink>
              );
            })}
            {/* Einziger Notfall-Knopf (auf jeder Seite genau einmal): Notfallliste sofort drucken */}
            <NavLink
              to={EMERGENCY_PRINT_PATH}
              state={{ from: `${location.pathname}${location.search}` } satisfies EmergencyNavState}
              className="nav-link nav-emergency"
              title="Notfallliste: alle Anwesenden sofort drucken"
            >
              <AlertIcon />
              <span>Notfall</span>
            </NavLink>
            <button
              ref={helpButton}
              type="button"
              aria-label="Hilfe"
              aria-expanded={helpOpen}
              title="Hilfe zu dieser Seite"
              className={helpOpen ? 'nav-link nav-button nav-help active' : 'nav-link nav-button nav-help'}
              onClick={() => (helpOpen ? closeHelp() : setHelpOpen(true))}
            >
              <HelpIcon />
              <span className="nav-label-optional">Hilfe</span>
            </button>
            <button
              type="button"
              aria-label="Abmelden"
              title="Abmelden"
              className="nav-link nav-button"
              onClick={() => {
                requestExit('logout');
                navigate('/');
              }}
            >
              <ExitIcon />
              <span className="nav-label-optional">Abmelden</span>
            </button>
          </>
        ) : (
          <NavLink to="/anmelden" className="nav-link">
            <LockIcon />
            <span>Anmelden</span>
          </NavLink>
        )}
      </nav>
      {occasion && staff && <OccasionBand occasion={occasion} canEnd={security.admin} />}
      {helpOpen && staff && <HelpPanel path={location.pathname} role={security.admin ? 'admin' : 'operator'} onClose={closeHelp} />}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

/** Farbiges Band auf jeder Seite, solange auf diesem Gerät der Einlass einer Veranstaltung läuft. */
function OccasionBand({ occasion, canEnd }: { occasion: Occasion; canEnd: boolean }) {
  const color = textColorOn(occasion.color);
  return (
    <div className="occasion-band no-print" style={{ background: occasion.color, color }} role="status">
      <TicketIcon className="occasion-band-icon" />
      <span className="occasion-band-text">
        <strong>{occasion.name}</strong> · {formatIsoDate(occasion.date)} · Einlass läuft
      </span>
      {canEnd && (
        <button
          type="button"
          className="occasion-band-end"
          style={{ color, borderColor: color }}
          onClick={() => {
            if (window.confirm(`Einlass für „${occasion.name}“ auf diesem Gerät beenden? Danach gilt wieder die normale Zutrittskontrolle.`)) void endEntry();
          }}
        >
          Einlass beenden
        </button>
      )}
    </div>
  );
}
