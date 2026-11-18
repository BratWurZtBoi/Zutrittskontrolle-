import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { HINTS, type HintId } from '../help/hints';

/**
 * ⓘ-Knopf mit kurzer Erklärung zu einem Feld (Texte in `help/hints.ts`). Darf in einem <label> stehen:
 * der Klick schaltet nur die Erklärung um, nicht das Feld, und das Feld behält seine Beschriftung.
 * Esc oder ein Klick daneben schließt.
 */
export function InfoTip({ hint }: { hint: HintId }) {
  const { text, topic } = HINTS[hint] as { text: string; topic?: string };
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Erklärung im Bildschirm halten (am rechten/linken Rand verschieben)
  useLayoutEffect(() => {
    if (!open || !pop.current) {
      setShift(0);
      return;
    }
    const r = pop.current.getBoundingClientRect();
    const margin = 8;
    const width = document.documentElement.clientWidth;
    if (r.right > width - margin) setShift(width - margin - r.right);
    else if (r.left < margin) setShift(margin - r.left);
  }, [open]);

  return (
    <span className="infotip" ref={root}>
      {/* span statt <button>: ein Knopf in einem <label> würde dem Eingabefeld die Beschriftung wegnehmen */}
      <span
        role="button"
        tabIndex={0}
        className="infotip-button"
        aria-label="Erklärung"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="Erklärung"
        onClick={(e) => {
          // nicht das Feld im umgebenden <label> umschalten bzw. fokussieren
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen((o) => !o);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        i
      </span>
      {open && (
        <span id={id} ref={pop} className="infotip-pop" role="note" style={{ transform: `translateX(${shift}px)` }} onClick={(e) => e.preventDefault()}>
          {text}
          {topic && (
            <>
              {' '}
              <Link to={`/hilfe?thema=${topic}`} className="infotip-more" onClick={(e) => e.stopPropagation()}>
                Mehr in der Hilfe →
              </Link>
            </>
          )}
        </span>
      )}
    </span>
  );
}
