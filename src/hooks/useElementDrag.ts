import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { NO_GUIDES, type ResizeHandle, type SnapGuides } from '../domain/editorGeometry';

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
  /** Beginn eines Zieh-Vorgangs (für „Rückgängig“: jeder Vorgang ein eigener Schritt). */
  onGestureStart?: () => void;
}

export interface DragOptions<T extends Positioned> {
  /** Einrasten beim Verschieben (mit gedrückter Umschalttaste frei). */
  snap?: (element: T, x: number, y: number) => { x: number; y: number; guides: SnapGuides };
  /** Größe ändern an den Anfassern: Bewegung seit Beginn in % der Fläche. */
  resize?: (start: T, handle: ResizeHandle, dx: number, dy: number) => T;
}

/**
 * Ziehen mit Maus oder Finger, Größe ändern an Anfassern, Einrasten mit Hilfslinien und
 * Feinschritte mit den Pfeiltasten (Umschalt = 5 %). Positionen in Prozent der Fläche;
 * `move` hält das Element innerhalb der Fläche.
 */
export function useElementDrag<T extends Positioned>(
  edit: EditHandlers<T> | undefined,
  elements: T[],
  move: (element: T, x: number, y: number) => T,
  options: DragOptions<T> = {},
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null);
  const sizing = useRef<{ start: T; handle: ResizeHandle; px: number; py: number } | null>(null);
  const [guides, setGuides] = useState<SnapGuides>(NO_GUIDES);

  const percent = (e: PointerEvent<HTMLElement>, px: number, py: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { dx: ((e.clientX - px) / rect.width) * 100, dy: ((e.clientY - py) / rect.height) * 100 };
  };
  const stop = () => {
    drag.current = null;
    sizing.current = null;
    setGuides(NO_GUIDES);
  };

  const elementHandlers = (element: T) => {
    if (!edit) return {};
    return {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        edit.onSelect(element.id);
        edit.onGestureStart?.();
        drag.current = { id: element.id, px: e.clientX, py: e.clientY, x: element.x, y: element.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d || d.id !== element.id) return;
        const p = percent(e, d.px, d.py);
        if (!p) return;
        let x = Math.round((d.x + p.dx) * 2) / 2;
        let y = Math.round((d.y + p.dy) * 2) / 2;
        if (options.snap && !e.shiftKey) {
          const snapped = options.snap(element, d.x + p.dx, d.y + p.dy);
          x = snapped.x;
          y = snapped.y;
          setGuides(snapped.guides);
        } else {
          setGuides(NO_GUIDES);
        }
        edit.onChange(move(element, x, y));
      },
      onPointerUp: stop,
      onPointerCancel: stop,
    };
  };

  /** Anfasser zum Größe ändern (nur am ausgewählten Element). */
  const handleHandlers = (element: T, handle: ResizeHandle) => {
    if (!edit || !options.resize) return {};
    const resize = options.resize;
    return {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        edit.onGestureStart?.();
        sizing.current = { start: element, handle, px: e.clientX, py: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const s = sizing.current;
        if (!s || s.start.id !== element.id) return;
        const p = percent(e, s.px, s.py);
        if (p) edit.onChange(resize(s.start, s.handle, p.dx, p.dy));
      },
      onPointerUp: stop,
      onPointerCancel: stop,
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

  return { surfaceRef, elementHandlers, surfaceHandlers, handleHandlers, guides };
}
