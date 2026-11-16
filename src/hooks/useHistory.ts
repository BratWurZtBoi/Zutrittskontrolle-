import { useCallback, useRef, useState } from 'react';

const MAX_STEPS = 100;
/** Änderungen mit gleichem Schlüssel kurz hintereinander (Ziehen, Tippen) = ein Schritt. */
const MERGE_MS = 1000;

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Neuer Zustand; `merge` = mit dem letzten Schritt zusammenfassen. */
export function pushHistory<T>(s: HistoryState<T>, next: T, merge: boolean): HistoryState<T> {
  if (Object.is(next, s.present)) return s;
  const past = merge && s.past.length > 0 ? s.past : [...s.past, s.present].slice(-MAX_STEPS);
  return { past, present: next, future: [] };
}

export function undoHistory<T>(s: HistoryState<T>): HistoryState<T> {
  return s.past.length === 0 ? s : { past: s.past.slice(0, -1), present: s.past[s.past.length - 1]!, future: [s.present, ...s.future] };
}

export function redoHistory<T>(s: HistoryState<T>): HistoryState<T> {
  return s.future.length === 0 ? s : { past: [...s.past, s.present], present: s.future[0]!, future: s.future.slice(1) };
}

/**
 * Rückgängig/Wiederholen für einen Editor. `set(next, key)`: Änderungen mit demselben
 * `key` innerhalb einer Sekunde werden zu einem Schritt zusammengefasst; `checkpoint()`
 * beginnt in jedem Fall einen neuen Schritt (z. B. neuer Zieh-Vorgang).
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });
  const last = useRef<{ key?: string; at: number }>({ at: 0 });

  const set = useCallback((update: T | ((current: T) => T), key?: string) => {
    const now = Date.now();
    const merge = key !== undefined && last.current.key === key && now - last.current.at < MERGE_MS;
    last.current = { key, at: now };
    setState((s) => pushHistory(s, typeof update === 'function' ? (update as (current: T) => T)(s.present) : update, merge));
  }, []);

  const checkpoint = useCallback(() => {
    last.current = { at: 0 };
  }, []);

  const undo = useCallback(() => {
    last.current = { at: 0 };
    setState(undoHistory);
  }, []);

  const redo = useCallback(() => {
    last.current = { at: 0 };
    setState(redoHistory);
  }, []);

  return { value: state.present, set, undo, redo, checkpoint, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
