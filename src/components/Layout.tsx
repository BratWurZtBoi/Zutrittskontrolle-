import { NavLink, Outlet, useNavigate } from 'react-router';
import { requestExit } from '../security/exit';
import { useSecurity } from '../security/useSecurity';
import { CardIcon, ExitIcon, ListIcon, LockIcon, ScanIcon, SettingsIcon } from './Icons';

const ADMIN_NAV = [
  { to: '/karten', label: 'Karten', icon: CardIcon },
  { to: '/anwesenheit', label: 'Anwesenheit', icon: ListIcon },
  { to: '/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
];

export function Layout() {
  const security = useSecurity();
  const navigate = useNavigate();

  return (
    <div className="app">
      <nav className="app-nav no-print" aria-label="Hauptnavigation">
        <span className="app-title">Zutrittskontrolle</span>
        <NavLink to="/" end className="nav-link">
          <ScanIcon />
          <span>Scanner</span>
        </NavLink>
        {security.admin ? (
          <>
            {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className="nav-link">
                <Icon />
                <span>{label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              className="nav-link nav-button"
              onClick={() => {
                requestExit('logout');
                navigate('/');
              }}
            >
              <ExitIcon />
              <span>Abmelden</span>
            </button>
          </>
        ) : (
          <NavLink to="/anmelden" className="nav-link">
            <LockIcon />
            <span>Verwaltung</span>
          </NavLink>
        )}
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
