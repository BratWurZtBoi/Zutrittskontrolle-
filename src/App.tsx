import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { AttendancePage } from './pages/AttendancePage';
import { CardCreatePage } from './pages/CardCreatePage';
import { CardDetailPage } from './pages/CardDetailPage';
import { CardListPage } from './pages/CardListPage';
import { GroupsPage } from './pages/GroupsPage';
import { PrintPage } from './pages/PrintPage';
import { ScannerPage } from './pages/ScannerPage';
import { SettingsPage } from './pages/SettingsPage';

// HashRouter: funktioniert ohne Server-Konfiguration (GitHub Pages, offline).
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ScannerPage />} />
          <Route path="karten" element={<CardListPage />} />
          <Route path="karten/neu" element={<CardCreatePage />} />
          <Route path="karten/:id" element={<CardDetailPage />} />
          <Route path="druck" element={<PrintPage />} />
          <Route path="anwesenheit" element={<AttendancePage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
          <Route path="einstellungen/gruppen" element={<GroupsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
