import { useEffect, useRef, useState } from 'react';
import type { Group } from '../domain/types';

interface Props {
  groups: Group[];
  /** Treffer je Gruppe in der aktuellen Liste (ohne Gruppenfilter). */
  counts: Map<string, number>;
  /** Treffer insgesamt (Knopf „Alle“). */
  total: number;
  value: string;
  onChange: (groupId: string) => void;
}

/**
 * Gruppenfilter als Knöpfe mit Anzahl – immer genau eine Zeile (feste Höhe). Es erscheinen nur
 * Gruppen mit Treffern (plus die gewählte). Passen nicht alle hinein, lässt sich die Zeile
 * wischen bzw. über die Pfeile am Rand verschieben.
 */
export function GroupChips({ groups, counts, total, value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const visible = groups.filter((g) => (counts.get(g.id) ?? 0) > 0 || g.id === value);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);
  // Inhalt (Gruppen, Zahlen) ändert sich → Ränder neu prüfen
  useEffect(update);

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: 'smooth' });

  return (
    <div className="chip-row">
      <div ref={ref} className="group-chips" role="radiogroup" aria-label="Gruppe">
        <button type="button" role="radio" aria-checked={value === ''} className={value === '' ? 'chip active' : 'chip'} onClick={() => onChange('')}>
          Alle <span className="chip-count">{total}</span>
        </button>
        {visible.map((g) => (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={value === g.id}
            className={value === g.id ? 'chip active' : 'chip'}
            onClick={() => onChange(value === g.id ? '' : g.id)}
          >
            <span className="color-dot" style={{ background: g.color }} />
            {g.name} <span className="chip-count">{counts.get(g.id) ?? 0}</span>
          </button>
        ))}
      </div>
      {edges.left && (
        <button type="button" className="chip-scroll chip-scroll-left" aria-label="Weitere Gruppen links" onClick={() => scroll(-1)}>
          ‹
        </button>
      )}
      {edges.right && (
        <button type="button" className="chip-scroll chip-scroll-right" aria-label="Weitere Gruppen rechts" onClick={() => scroll(1)}>
          ›
        </button>
      )}
    </div>
  );
}
