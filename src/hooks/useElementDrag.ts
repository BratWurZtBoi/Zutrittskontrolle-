import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface Positioned {
  id: string;
  x: number;
  y: number;
}

/** Bearbeitungsmodus eines Editors: Elemente anklicken, ziehen, mit Pfeiltasten verschieben. */
export interface EditHandlers<T extends Positioned> {
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onChange: (element: T) => void;
}

/**
 * Ziehen mit Maus oder Finger und Feinschritte mit den Pfeiltasten (Umschalt = 5 %).
 * Positionen in Prozent der Fläche; `move` hält das Element innerhalb der Fläche.
 */
export function useElementDrag<T extends Positioned>(
  edit: EditHandlers<T> | undefined,
  elements: T[],
  move: (element: T, x: number, y: number) => T,
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null);

  const elementHandlers = (element: T) => {
    if (!edit) return {};
    return {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        edit.onSelect(element.id);
        drag.current = { id: element.id, px: e.clientX, py: e.clientY, x: element.x, y: element.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const d = drag.current;
        const rect = surfaceRef.current?.getBoundingClientRect();
        if (!d || d.id !== element.id || !rect) return;
        const dx = ((e.clientX - d.px) / rect.width) * 100;
        const dy = ((e.clientY - d.py) / rect.height) * 100;
        edit.onChange(move(element, Math.round((d.x + dx) * 2) / 2, Math.round((d.y + dy) * 2) / 2));
      },
      onPointerUp: () => {
        drag.current = null;
      },
      onPointerCancel: () => {
        drag.current = null;
      },
    };
  };

  const surfaceHandlers = edit
    ? {
        tabIndex: 0,
        onPointerDown: () => edit.onSelect(undefined),
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          const selected = elements.find((x) => x.id === edit.selectedId);
          if (!selected) return;
          const step = e.shiftKey ? 5 : 0.5;
          const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const m = moves[e.key];
          if (!m) return;
          e.preventDefault();
          edit.onChange(move(selected, selected.x + m[0], selected.y + m[1]));
        },
      }
    : {};

  return { surfaceRef, elementHandlers, surfaceHandlers };
}
