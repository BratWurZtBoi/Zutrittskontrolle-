import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from '../db/settings';

/** Aktuelle Einstellungen, aktualisiert sich automatisch bei Änderungen. */
export function useSettings(): AppSettings {
  return useLiveQuery(loadSettings, [], DEFAULT_SETTINGS);
}

/** Wie useSettings, aber undefined, solange die Einstellungen noch nicht geladen sind. */
export function useLoadedSettings(): AppSettings | undefined {
  return useLiveQuery(loadSettings, []);
}
