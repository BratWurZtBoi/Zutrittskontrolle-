import { useEffect, useState } from 'react';
import { saveSettings, type AppSettings } from '../../db/settings';
import { useSettings } from '../../hooks/useSettings';
import { SettingsShell } from './SettingsShell';

export function GeneralSettings() {
  const settings = useSettings();
  const [orgName, setOrgName] = useState(settings.orgName);
  useEffect(() => setOrgName(settings.orgName), [settings.orgName]);
  const save = (patch: Partial<AppSettings>) => void saveSettings(patch);

  return (
    <SettingsShell title="Allgemein">
      <section className="card form">
        <label>
          Darstellung
          <select value={settings.theme} onChange={(e) => save({ theme: e.target.value as AppSettings['theme'] })}>
            <option value="auto">Automatisch (wie Gerät/System)</option>
            <option value="light">Hell</option>
            <option value="dark">Dunkel</option>
          </select>
        </label>
        <label>
          Name der Organisation (erscheint auf den Ausweisen und dem Gästebildschirm)
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            onBlur={() => save({ orgName: orgName.trim() || 'Organisation' })}
          />
        </label>
      </section>
    </SettingsShell>
  );
}
