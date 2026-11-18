import { useLiveQuery } from 'dexie-react-hooks';
import { loadAutoBackup } from '../db/autoBackup';
import { OPERATOR_PIN_KEY, db } from '../db/db';
import { DEFAULT_SETTINGS, loadSettings } from '../db/settings';
import { setupProgress, setupStates, type SetupFacts, type SetupProgress, type SetupStepState } from '../domain/gettingStarted';

/** Platzhalter-Namen, die als „noch nicht eingetragen“ gelten. */
const PLACEHOLDER_ORG_NAMES = [DEFAULT_SETTINGS.orgName, 'Organisation', ''];

export interface SetupStatus {
  states: SetupStepState[];
  progress: SetupProgress;
  manualDone: string[];
  hidden: boolean;
}

/** Stand der „Ersten Schritte“ – aus den Daten erkannt (ohne Entschlüsseln), aktualisiert sich live. */
export function useSetupStatus(enabled = true): SetupStatus | undefined {
  return useLiveQuery(async () => {
    if (!enabled) return undefined;
    const [settings, cards, scan, pin, autoBackup] = await Promise.all([
      loadSettings(),
      db.cards.toArray(),
      db.events.filter((e) => e.source === 'camera' || e.source === 'scanner').first(),
      db.settings.get(OPERATOR_PIN_KEY),
      loadAutoBackup(),
    ]);
    const real = cards.filter((c) => !c.testData);
    const facts: SetupFacts = {
      orgNameSet: !PLACEHOLDER_ORG_NAMES.includes(settings.orgName.trim()),
      realCards: real.length,
      printedRealCards: real.filter((c) => c.printedAt).length,
      testCards: cards.length - real.length,
      scanned: Boolean(scan),
      operatorPin: Boolean(pin),
      backup: Boolean(settings.lastBackupAt || autoBackup),
    };
    const manualDone = Array.isArray(settings.setupDone) ? settings.setupDone : [];
    const states = setupStates(facts, manualDone);
    return { states, progress: setupProgress(states), manualDone, hidden: Boolean(settings.setupHidden) };
  }, [enabled]);
}
