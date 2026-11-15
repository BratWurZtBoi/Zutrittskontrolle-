import { BackupSection } from '../../components/BackupSection';
import { useSettings } from '../../hooks/useSettings';
import { SettingsShell } from './SettingsShell';

export function BackupSettings() {
  const settings = useSettings();
  return (
    <SettingsShell title="Datensicherung">
      <BackupSection lastBackupAt={settings.lastBackupAt} />
    </SettingsShell>
  );
}
