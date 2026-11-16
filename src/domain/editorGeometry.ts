/** Gemeinsame Typen der Editoren (Kartenlayout, Gästebildschirm). */

/** Anfasser am ausgewählten Element: Ecken (Größe) und links/rechts (nur Breite). */
export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'w' | 'e';

/** Hilfslinien beim Verschieben (Positionen in % der Fläche). */
export interface SnapGuides {
  x: number[];
  y: number[];
}

export const NO_GUIDES: SnapGuides = { x: [], y: [] };
