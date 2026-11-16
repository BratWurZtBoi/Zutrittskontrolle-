import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { AppServices } from './components/AppServices';
import { Layout } from './components/Layout';
import { RequireRole } from './components/RequireAdmin';
import { CardCreatePage } from './pages/CardCreatePage';
import { CardDetailPage } from './pages/CardDetailPage';
import { CardLayoutsPage } from './pages/CardLayoutsPage';
import { CardListPage } from './pages/CardListPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmergencyListPage } from './pages/EmergencyListPage';
import { GroupsPage } from './pages/GroupsPage';
import { ImportPage } from './pages/ImportPage';
import { LayoutsPage } from './pages/LayoutsPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PresentationPage } from './pages/PresentationPage';
import { PrintPage } from './pages/PrintPage';
import { StartPage } from './pages/StartPage';
import { BackupSettings } from './pages/settings/BackupSettings';
import { DataSettings } from './pages/settings/DataSettings';
import { GeneralSettings } from './pages/settings/GeneralSettings';
import { OperatorSettings } from './pages/settings/OperatorSettings';
import { ScannerSettings } from './pages/settings/ScannerSettings';
import { SecuritySettings } from './pages/settings/SecuritySettings';
import { SettingsHome } from './pages/settings/SettingsHome';
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
          <Route index element={<StartPage />} />
          <Route path="anmelden" element={<LoginPage />} />
          <Route path="einrichtung" element={<SetupPage />} />
          {/* Admin oder Bediener (PIN) */}
          <Route element={<RequireRole allow="staff" />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="auswertung" element={<OverviewPage />} />
            <Route path="uebersicht" element={<Navigate to="/auswertung" replace />} />
            <Route path="notfallliste" element={<EmergencyListPage />} />
          </Route>
          {/* nur mit Admin-Anmeldung */}
          <Route element={<RequireRole allow="admin" />}>
            <Route path="karten" element={<CardListPage />} />
            <Route path="karten/neu" element={<CardCreatePage />} />
            <Route path="karten/import" element={<ImportPage />} />
            <Route path="karten/:id" element={<CardDetailPage />} />
            <Route path="druck" element={<PrintPage />} />
            <Route path="einstellungen" element={<SettingsHome />} />
            <Route path="einstellungen/allgemein" element={<GeneralSettings />} />
            <Route path="einstellungen/scanner" element={<ScannerSettings />} />
            <Route path="einstellungen/sicherheit" element={<SecuritySettings />} />
            <Route path="einstellungen/bediener" element={<OperatorSettings />} />
            <Route path="einstellungen/datensicherung" element={<BackupSettings />} />
            <Route path="einstellungen/daten" element={<DataSettings />} />
            <Route path="einstellungen/geraet" element={<Navigate to="/einstellungen/allgemein" replace />} />
            <Route path="einstellungen/gruppen" element={<GroupsPage />} />
            <Route path="einstellungen/praesentation" element={<LayoutsPage />} />
            <Route path="einstellungen/karten" element={<CardLayoutsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
