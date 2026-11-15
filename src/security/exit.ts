/**
 * Abmelden/Sperren mit Seitenwechsel zum Scanner: Die Aktion wird vorgemerkt und
 * erst ausgeführt, wenn der Scanner angezeigt wird. Sonst würde der Seitenschutz
 * der gerade geöffneten Verwaltungsseite vorher zur Anmeldung umleiten.
 */
export type ExitKind = 'logout' | 'lock';

let pending: ExitKind | null = null;

export function requestExit(kind: ExitKind): void {
  pending = kind;
}

export function takePendingExit(): ExitKind | null {
  const kind = pending;
  pending = null;
  return kind;
}
