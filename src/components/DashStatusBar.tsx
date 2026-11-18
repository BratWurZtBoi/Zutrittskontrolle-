import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { loadAutoBackup } from '../db/autoBackup';
import { Link } from 'react-router';
import { saveSettings, type AppSettings } from '../db/settings';
import { daysAgoLabel, formatDateTime } from '../domain/dates';
import { countPerGroup, splitTopGroups } from '../domain/overview';
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

/** In der Statusleiste höchstens so viele Gruppen einzeln – der Rest als „+n weitere“. */
const MAX_GROUPS = 3;

/**
 * Kompakte Statusleiste: Modus, Kennzahlen, Präsentation, Backup. Die Notfallliste steht nur
 * oben im Menü (roter Knopf „Notfall“ – auf jeder Seite genau einmal).
 * Starr: jedes Feld hat einen festen Platz und eine feste Größe (je Bildschirmbreite) –
 * nichts kommt hinzu, verschwindet oder bricht um, wenn sich Zahlen oder Zustände ändern.
 */
export function DashStatusBar({ settings, stats, groups, onShow, onRegisterVisitor }: Props) {
  const perGroup = stats ? countPerGroup(stats.presentGroupIds, groups) : [];
  const { shown, rest } = splitTopGroups(perGroup, MAX_GROUPS);
  const breakdown = perGroup.map(({ group, count }) => `${count} ${group.name}`).join(', ');
  const denied = stats?.denied ?? 0;


  return (
    <div className="dash-status no-print">
      <div className="segmented segmented-light ds-mode" role="radiogroup" aria-label="Scan-Modus">
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

      <button type="button" className="kpi ds-present" onClick={() => onShow('presence')} title={breakdown ? `Anwesend: ${breakdown}` : undefined}>
        <span className="kpi-label">Anwesend</span>
        <strong className="kpi-value" data-testid="kpi-present">
          {stats?.presentGroupIds.length ?? '–'}
        </strong>
        <span className="kpi-groups">
          {shown.map(({ group, count }) => (
            <span key={group.id} className="kpi-group">
              <span className="color-dot" style={{ background: group.color }} />
              <span className="kpi-group-count">{count}</span>
              <span className="kpi-group-name">{group.name}</span>
            </span>
          ))}
          {rest.length > 0 && (
            <span className="kpi-more" data-testid="kpi-more">
              +{rest.length}
              <span className="kpi-more-word"> weitere</span>
            </span>
          )}
        </span>
      </button>

      <button type="button" className="kpi ds-today" onClick={() => onShow('events')}>
        <span className="kpi-label">Heute</span>
        <strong className="kpi-value">{stats?.granted ?? '–'}</strong>
        <span className="kpi-label">Buchungen</span>
      </button>

      <button type="button" className={denied > 0 ? 'kpi ds-denied kpi-denied' : 'kpi ds-denied'} onClick={() => onShow('denied')}>
        <strong className="kpi-value">{stats ? denied : '–'}</strong>
        <span className="kpi-label">abgewiesen</span>
      </button>

      <button type="button" className="btn btn-primary btn-small ds-visitor" onClick={onRegisterVisitor}>
        + Besucher anmelden
      </button>

      <StatusActions settings={settings} />
    </div>
  );
}

/** Präsentation öffnen bzw. „läuft“ und Backup-Stand – feste Plätze in beiden Statusleisten (Zutritt/Einlass). */
export function StatusActions({ settings }: { settings: AppSettings }) {
  const connected = usePresentationConnected();
  const autoBackupError = useLiveQuery(async () => (await loadAutoBackup())?.lastError, [], undefined);
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 10_000);
    return () => window.clearTimeout(t);
  }, [hint]);
  const openPresentation = async () => setHint(OPEN_HINT[await openPresentationWindow()]);

  return (
    <>
      <div className="ds-actions">
        {connected ? (
          <span className="presentation-state ds-presentation" role="status">
            <span className="status-dot present" /> Präsentation läuft
          </span>
        ) : (
          <button type="button" className="btn btn-small ds-presentation" onClick={() => void openPresentation()}>
            Präsentation öffnen
          </button>
        )}
        <BackupState lastBackupAt={settings.lastBackupAt} error={autoBackupError} />
      </div>
      {hint && (
        <p className="dash-status-hint" role="status">
          {hint}
        </p>
      )}
    </>
  );
}

/** Backup-Zustand – immer sichtbar (gleicher Platz), bei Handlungsbedarf als Warnung. */
function BackupState({ lastBackupAt, error }: { lastBackupAt?: number; error?: string }) {
  const due = !lastBackupAt || Date.now() - lastBackupAt > BACKUP_DUE_MS;
  const last = lastBackupAt ? `Letztes Backup: ${formatDateTime(lastBackupAt)}` : 'Auf diesem Gerät wurde noch kein Backup erstellt.';
  const [label, title] = error
    ? ['Auto-Backup: Problem', error]
    : !lastBackupAt
      ? ['Noch kein Backup', last]
      : due
        ? ['Backup fällig', last]
        : [`Backup: ${daysAgoLabel(lastBackupAt)}`, last];
  return (
    <Link to="/einstellungen/datensicherung" className={error || due ? 'btn btn-small ds-backup btn-warn' : 'btn btn-small ds-backup'} title={title}>
      {label}
    </Link>
  );
}
