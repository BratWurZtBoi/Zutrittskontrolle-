import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { AppServices } from './components/AppServices';
import { Layout } from './components/Layout';
import { RequireAdmin } from './components/RequireAdmin';
import { AttendancePage } from './pages/AttendancePage';
import { CardCreatePage } from './pages/CardCreatePage';
import { CardDetailPage } from './pages/CardDetailPage';
import { CardListPage } from './pages/CardListPage';
import { GroupsPage } from './pages/GroupsPage';
import { LoginPage } from './pages/LoginPage';
import { PrintPage } from './pages/PrintPage';
import { ScannerPage } from './pages/ScannerPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';

// HashRouter: funktioniert ohne Server-Konfiguration (GitHub Pages, offline).
export function App() {
  return (
    <HashRouter>
      <AppServices />
      <Routes>
        <Route element={<Layout />}>
          {/* frei zugänglich */}
          <Route index element={<ScannerPage />} />
          <Route path="anmelden" element={<LoginPage />} />
          <Route path="einrichtung" element={<SetupPage />} />
          {/* nur mit Admin-Anmeldung */}
          <Route element={<RequireAdmin />}>
            <Route path="karten" element={<CardListPage />} />
            <Route path="karten/neu" element={<CardCreatePage />} />
            <Route path="karten/:id" element={<CardDetailPage />} />
            <Route path="druck" element={<PrintPage />} />
            <Route path="anwesenheit" element={<AttendancePage />} />
            <Route path="einstellungen" element={<SettingsPage />} />
            <Route path="einstellungen/gruppen" element={<GroupsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
