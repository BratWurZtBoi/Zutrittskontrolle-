import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { loadAutoBackup } from '../db/autoBackup';
import { Link } from 'react-router';
import { saveSettings, type AppSettings } from '../db/settings';
import { countPerGroup } from '../domain/overview';
import type { Group, ScanMode } from '../domain/types';
import { usePresentationConnected, type DashboardStats } from '../hooks/useDashboardData';
import { openPresentationWindow, type PresentationOpenResult } from '../lib/presentation';

const MODES: { value: ScanMode; label: string }[] = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'in', label: 'Eingang' },
  { value: 'out', label: 'Ausgang' },
];

const BACKUP_DUE_MS = 7 * 24 * 60 * 60 * 1000;

const OPEN_HINT: Record<PresentationOpenResult, string> = {
  'other-screen': 'Auf dem zweiten Bildschirm geöffnet – dort einmal „Vollbild“ antippen.',
  window: 'Fenster geöffnet – bei Bedarf auf den zweiten Bildschirm ziehen und „Vollbild“ wählen.',
  blocked: 'Das Fenster wurde blockiert. Bitte noch einmal klicken.',
};

interface Props {
  settings: AppSettings;
  stats: DashboardStats | undefined;
  groups: Group[];
  /** Klick auf eine Kennzahl öffnet die passende Liste. */
  onShow: (tab: 'presence' | 'events' | 'denied') => void;
  onRegisterVisitor: () => void;
}

/** Kompakte Statusleiste: Modus, Kennzahlen, Präsentation, Backup-Erinnerung. */
export function DashStatusBar({ settings, stats, groups, onShow, onRegisterVisitor }: Props) {
  const connected = usePresentationConnected();
  const autoBackupError = useLiveQuery(async () => (await loadAutoBackup())?.lastError, [], undefined);
  const [hint, setHint] = useState<string | null>(null);
  const backupDue = !settings.lastBackupAt || Date.now() - settings.lastBackupAt > BACKUP_DUE_MS;
  const perGroup = stats ? countPerGroup(stats.presentGroupIds, groups) : [];

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 10_000);
    return () => window.clearTimeout(t);
  }, [hint]);

  const openPresentation = async () => setHint(OPEN_HINT[await openPresentationWindow()]);

  return (
    <div className="dash-status no-print">
      <div className="segmented segmented-light" role="radiogroup" aria-label="Scan-Modus">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={settings.scanMode === m.value}
            className={settings.scanMode === m.value ? 'active' : ''}
            onClick={() => void saveSettings({ scanMode: m.value })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <button type="button" className="kpi" onClick={() => onShow('presence')}>
        <span className="kpi-label">Anwesend</span>
        <strong className="kpi-value" data-testid="kpi-present">
          {stats?.presentGroupIds.length ?? '–'}
        </strong>
        {perGroup.length > 0 && (
          <span className="kpi-groups">
            {perGroup.map(({ group, count }) => (
              <span key={group.id} className="kpi-group" title={group.name}>
                <span className="color-dot" style={{ background: group.color }} />
                {count} {group.name}
              </span>
            ))}
          </span>
        )}
      </button>

      <button type="button" className="kpi" onClick={() => onShow('events')}>
        <span className="kpi-label">Heute</span>
        <strong className="kpi-value">{stats?.granted ?? '–'}</strong>
        <span className="kpi-label">Buchungen</span>
      </button>

      {Boolean(stats?.denied) && (
        <button type="button" className="kpi kpi-denied" onClick={() => onShow('denied')}>
          <strong className="kpi-value">{stats?.denied}</strong>
          <span className="kpi-label">abgewiesen</span>
        </button>
      )}

      <button type="button" className="btn btn-primary btn-small" onClick={onRegisterVisitor}>
        + Besucher anmelden
      </button>

      <span className="dash-status-spacer" />

      {connected ? (
        <span className="presentation-state" role="status">
          <span className="status-dot present" /> Präsentation läuft
        </span>
      ) : (
        <button type="button" className="btn btn-small" onClick={() => void openPresentation()}>
          Präsentation öffnen
        </button>
      )}
      <Link to="/notfallliste" className="btn btn-small" title="Alle Anwesenden zum Ausdrucken (Evakuierung)">
        Notfallliste
      </Link>
      {autoBackupError && (
        <Link to="/einstellungen" className="btn btn-small btn-warn" title={autoBackupError}>
          Auto-Backup: Problem
        </Link>
      )}
      {backupDue && !autoBackupError && (
        <Link to="/einstellungen" className="btn btn-small btn-warn">
          {settings.lastBackupAt ? 'Backup fällig' : 'Noch kein Backup'}
        </Link>
      )}
      {hint && (
        <p className="dash-status-hint" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
