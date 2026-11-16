import { useEffect, useRef, type RefObject } from 'react';
import { guardLinks, setUnsavedChanges } from '../lib/unsavedChanges';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Tastatur im Editor: Strg+Z/Strg+Y (Strg+Umschalt+Z), Entf löscht, Esc hebt die Auswahl auf – nicht beim Tippen. */
export function useEditorShortcuts(actions: { undo: () => void; redo: () => void; remove?: () => void; deselect: () => void }): void {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const a = ref.current;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) a.redo();
        else a.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        a.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && a.remove) {
        e.preventDefault();
        a.remove();
      } else if (e.key === 'Escape') {
        a.deselect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Warnung bei ungespeicherten Änderungen (Links außerhalb des Editors, Neuladen). */
export function useUnsavedGuard(dirty: boolean, root: RefObject<HTMLElement | null>, message: string): void {
  useEffect(() => {
    setUnsavedChanges(dirty ? message : null);
  }, [dirty, message]);
  useEffect(() => {
    const stop = guardLinks(root.current);
    return () => {
      stop();
      setUnsavedChanges(null);
    };
  }, [root]);
}
