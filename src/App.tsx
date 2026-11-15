import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { AttendancePage } from './pages/AttendancePage';
import { CardsPage } from './pages/CardsPage';
import { PersonEditPage } from './pages/PersonEditPage';
import { PersonsPage } from './pages/PersonsPage';
import { ScannerPage } from './pages/ScannerPage';
import { SettingsPage } from './pages/SettingsPage';

// HashRouter: funktioniert ohne Server-Konfiguration (GitHub Pages, offline).
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ScannerPage />} />
          <Route path="personen" element={<PersonsPage />} />
          <Route path="personen/neu" element={<PersonEditPage />} />
          <Route path="personen/:id" element={<PersonEditPage />} />
          <Route path="ausweise" element={<CardsPage />} />
          <Route path="anwesenheit" element={<AttendancePage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
