import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { AppServices } from './components/AppServices';
import { Layout } from './components/Layout';
import { RequireAdmin } from './components/RequireAdmin';
import { CardCreatePage } from './pages/CardCreatePage';
import { CardDetailPage } from './pages/CardDetailPage';
import { CardListPage } from './pages/CardListPage';
import { DashboardPage } from './pages/DashboardPage';
import { GroupsPage } from './pages/GroupsPage';
import { ImportPage } from './pages/ImportPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PresentationPage } from './pages/PresentationPage';
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
        {/* Gästeansicht für den zweiten Bildschirm – ohne Navigation */}
        <Route path="praesentation" element={<PresentationPage />} />
        <Route element={<Layout />}>
          {/* frei zugänglich */}
          <Route index element={<ScannerPage />} />
          <Route path="anmelden" element={<LoginPage />} />
          <Route path="einrichtung" element={<SetupPage />} />
          {/* nur mit Admin-Anmeldung */}
          <Route element={<RequireAdmin />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="karten" element={<CardListPage />} />
            <Route path="karten/neu" element={<CardCreatePage />} />
            <Route path="karten/import" element={<ImportPage />} />
            <Route path="karten/:id" element={<CardDetailPage />} />
            <Route path="druck" element={<PrintPage />} />
            <Route path="uebersicht" element={<OverviewPage />} />
            <Route path="anwesenheit" element={<Navigate to="/uebersicht" replace />} />
            <Route path="einstellungen" element={<SettingsPage />} />
            <Route path="einstellungen/gruppen" element={<GroupsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
