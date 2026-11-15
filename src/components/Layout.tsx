import { NavLink, Outlet } from 'react-router';
import { CardIcon, ListIcon, ScanIcon, SettingsIcon } from './Icons';

const NAV = [
  { to: '/', label: 'Scanner', icon: ScanIcon, end: true },
  { to: '/karten', label: 'Karten', icon: CardIcon, end: false },
  { to: '/anwesenheit', label: 'Anwesenheit', icon: ListIcon, end: false },
  { to: '/einstellungen', label: 'Einstellungen', icon: SettingsIcon, end: false },
];

export function Layout() {
  return (
    <div className="app">
      <nav className="app-nav no-print" aria-label="Hauptnavigation">
        <span className="app-title">Zutrittskontrolle</span>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-link">
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
