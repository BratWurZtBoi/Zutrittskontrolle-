import { useState } from 'react';
import type { SortDir } from '../domain/overview';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
  /** Gleiche Spalte erneut → Richtung umkehren, sonst neue Spalte mit Standardrichtung. */
  toggle: (key: K) => void;
}

export function useSort<K extends string>(initialKey: K, initialDir: SortDir, defaultDirs: Partial<Record<K, SortDir>> = {}): SortState<K> {
  const [state, setState] = useState<{ key: K; dir: SortDir }>({ key: initialKey, dir: initialDir });
  return {
    ...state,
    toggle: (key) =>
      setState((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDirs[key] ?? 'asc' })),
  };
}
