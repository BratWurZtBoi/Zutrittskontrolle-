import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useSettings } from '../hooks/useSettings';
import { requestExit } from '../security/exit';
import { useSecurity } from '../security/useSecurity';
import { EMERGENCY_PRINT_PATH, type EmergencyNavState } from '../lib/emergency';
import { AlertIcon, CardIcon, DashboardIcon, ExitIcon, ListIcon, LockIcon, ScanIcon, SettingsIcon } from './Icons';

const ADMIN_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/auswertung', label: 'Auswertung', icon: ListIcon },
  { to: '/karten', label: 'Karten', icon: CardIcon },
  { to: '/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
];
/** Bediener (PIN): nur Empfangsaufgaben. */
const OPERATOR_NAV = ADMIN_NAV.filter((n) => n.to === '/dashboard' || n.to === '/auswertung');

export function Layout() {
  const security = useSecurity();
  const navigate = useNavigate();
  const location = useLocation();
  // Vollbild-Scanner nur im Kiosk-Modus (Gerät am Eingang ohne Bediener)
  const { kioskMode } = useSettings();

  return (
    <div className="app">
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
        {security.admin || security.operator ? (
          <>
            {(security.admin ? ADMIN_NAV : OPERATOR_NAV).map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className="nav-link">
                <Icon />
                <span>{label}</span>
              </NavLink>
            ))}
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
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
