/**
 * Helles/dunkles Layout. Die Wahl wird zusätzlich im localStorage gespiegelt,
 * damit sie beim Start sofort (vor dem Laden der Datenbank) gilt – ohne Flackern.
 */
import type { ThemeChoice } from '../db/settings';

const STORAGE_KEY = 'zk-theme';

export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* privater Modus o. Ä. – nicht schlimm */
  }
}

/** Beim Start: zuletzt gewählte Darstellung sofort anwenden. */
export function applyStoredTheme(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;
  } catch {
    /* ignorieren */
  }
}
