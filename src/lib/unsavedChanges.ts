/**
 * Warnung vor ungespeicherten Änderungen: Editoren melden sich hier an; Klicks auf
 * App-Links (Navigation, Seitenleiste) und Neuladen fragen dann nach.
 */
let message: string | null = null;

export function setUnsavedChanges(text: string | null): void {
  message = text;
}

/** true = verlassen erlaubt (keine Änderungen oder bestätigt). */
export function confirmLeave(): boolean {
  if (!message) return true;
  if (!window.confirm(message)) return false;
  message = null;
  return true;
}

/** Klicks auf Links außerhalb von `container` abfangen, solange es ungespeicherte Änderungen gibt. */
export function guardLinks(container: HTMLElement | null): () => void {
  const onClick = (e: MouseEvent) => {
    if (!message) return;
    const link = (e.target as Element | null)?.closest?.('a[href]');
    if (!link || (container && container.contains(link))) return;
    if (!confirmLeave()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (message) e.preventDefault();
  };
  document.addEventListener('click', onClick, true);
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
