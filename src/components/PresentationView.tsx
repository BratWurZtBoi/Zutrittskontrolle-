import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { textColorOn } from '../domain/color';
import {
  idleText,
  isVisibleFor,
  moveElement,
  type LayoutElement,
  type LayoutResult,
  type LayoutTone,
  type PresentationLayout,
} from '../domain/presentationLayout';
import { AlertIcon, CheckIcon, CrossIcon, ExitIcon } from './Icons';

const ICONS = { ok: CheckIcon, out: ExitIcon, deny: CrossIcon, warn: AlertIcon };

/** Ergebnisfarben – fest, damit Gäste „erlaubt/abgewiesen“ immer sicher erkennen. */
const TONE_COLORS: Record<LayoutTone, string> = { ok: '#15803d', out: '#1d4ed8', deny: '#dc2626', warn: '#b45309' };

/** Hintergrund des Layouts als CSS (Farbe, Verlauf oder Bild mit Abdunklung). */
export function layoutBackground(layout: PresentationLayout): CSSProperties {
  const { kind, color, color2, image, dim } = layout.background;
  if (kind === 'image' && image) {
    const shade = Math.min(0.7, Math.max(0, dim));
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(rgba(0,0,0,${shade}), rgba(0,0,0,${shade})), url("${image}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (kind === 'gradient') return { background: `radial-gradient(circle at 50% 30%, ${color2} 0%, ${color} 70%)` };
  return { background: color };
}

/** Bearbeitungsmodus im Editor: Elemente anklicken, ziehen, mit Pfeiltasten verschieben. */
export interface EditHandlers {
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onChange: (element: LayoutElement) => void;
}

interface Props {
  layout: PresentationLayout;
  /** Scan-Anzeige: Inhalt des Ergebnisses; Ruhebildschirm: null */
  result: LayoutResult | null;
  orgName: string;
  now: Date;
  /** Kleine Vorschau (Editor, Liste): Maus sichtbar, keine Ansage für Screenreader. */
  preview?: boolean;
  edit?: EditHandlers;
}

/**
 * Gästebildschirm nach Layout. Elemente sind in Prozent positioniert, Schriftgrößen
 * in Container-Einheiten (cqh) – dieselbe Darstellung im Vollbild und als Vorschau.
 */
export function PresentationView({ layout, result, orgName, now, preview = false, edit }: Props) {
  const screenRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null);
  const isResult = layout.kind === 'result' && result !== null;
  const outcomeBg = isResult && layout.resultBackground === 'outcome';
  const tone = result?.tone ?? 'ok';
  const baseColor = outcomeBg ? '#ffffff' : layout.textColor === 'dark' ? '#0f172a' : '#ffffff';
  const style: CSSProperties = outcomeBg
    ? { background: TONE_COLORS[tone], color: baseColor }
    : ({ ...layoutBackground(layout), color: baseColor, '--pv-tone': TONE_COLORS[tone] } as CSSProperties);
  const Icon = ICONS[tone];
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // --- Ziehen im Editor -----------------------------------------------------
  const onPointerDown = (e: PointerEvent<HTMLElement>, element: LayoutElement) => {
    if (!edit) return;
    e.preventDefault();
    e.stopPropagation();
    edit.onSelect(element.id);
    drag.current = { id: element.id, px: e.clientX, py: e.clientY, x: element.x, y: element.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>, element: LayoutElement) => {
    const d = drag.current;
    const rect = screenRef.current?.getBoundingClientRect();
    if (!edit || !d || d.id !== element.id || !rect) return;
    const dx = ((e.clientX - d.px) / rect.width) * 100;
    const dy = ((e.clientY - d.py) / rect.height) * 100;
    edit.onChange(moveElement(element, Math.round((d.x + dx) * 2) / 2, Math.round((d.y + dy) * 2) / 2));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const selected = layout.elements.find((x) => x.id === edit?.selectedId);
    if (!edit || !selected) return;
    const step = e.shiftKey ? 5 : 0.5;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    edit.onChange(moveElement(selected, selected.x + m[0], selected.y + m[1]));
  };

  const renderElement = (element: LayoutElement) => {
    const hiddenHere = isResult && !isVisibleFor(element, result.kind);
    if (hiddenHere && !edit) return null;
    const box: CSSProperties = {
      left: `${element.x}%`,
      top: `${element.y}%`,
      width: `${element.w}%`,
      textAlign: element.align,
      color: element.color,
      fontWeight: element.bold ? 800 : element.type === 'clock' ? 300 : 500,
    };
    const font = { fontSize: `${element.size}cqh` };
    let content: ReactNode = null;
    switch (element.type) {
      case 'text': {
        const text = isResult ? (result.texts[element.id] ?? element.text ?? '') : idleText(element.text ?? '', orgName, now);
        if (!text && !edit) return null;
        content = (
          <div className="pv-text" style={{ ...font, justifyContent: flexAlign(element.align) }}>
            {element.withIcon && isResult && <Icon className="pv-icon" />}
            <span>{text || (edit ? '(leer)' : '')}</span>
          </div>
        );
        break;
      }
      case 'clock':
        content = (
          <div className="pv-clock" style={font}>
            {time}
          </div>
        );
        break;
      case 'date':
        content = <div style={font}>{date}</div>;
        break;
      case 'photo':
        if (!isResult) return null;
        if (result.photo) content = <img className="pv-photo" src={result.photo} alt="" />;
        else if (result.initials || edit) content = <div className="pv-photo pv-photo-empty">{result.initials ?? ''}</div>;
        else return null;
        break;
      case 'group':
        if (!isResult || (!result.groupName && !edit)) return null;
        content = (
          <span
            className="presentation-group"
            style={{ ...font, ...(result.groupColor ? { background: result.groupColor, color: textColorOn(result.groupColor) } : {}) }}
          >
            {result.groupName ?? 'Gruppe'}
          </span>
        );
        break;
      case 'logo':
        if (!layout.logo) return edit ? <div key={element.id} className="pv-el pv-logo-missing" style={box}>Logo (noch keins hochgeladen)</div> : null;
        content = <img className="pv-logo" src={layout.logo} alt="" />;
        break;
    }
    const selected = edit?.selectedId === element.id;
    return (
      <div
        key={element.id}
        className={`pv-el pv-${element.type}-box${selected ? ' pv-selected' : ''}${hiddenHere ? ' pv-hidden-here' : ''}${edit ? ' pv-editable' : ''}`}
        style={box}
        data-element={element.id}
        onPointerDown={edit ? (e) => onPointerDown(e, element) : undefined}
        onPointerMove={edit ? (e) => onPointerMove(e, element) : undefined}
        onPointerUp={edit ? onPointerUp : undefined}
        onPointerCancel={edit ? onPointerUp : undefined}
      >
        {content}
      </div>
    );
  };

  return (
    <div className={`pv${preview ? ' pv-preview' : ''}`}>
      <div
        ref={screenRef}
        className={`presentation ${isResult ? `presentation-result result-${tone}` : 'presentation-idle'} ${outcomeBg || !isResult ? '' : 'pv-custom'}`}
        style={style}
        role={preview || !isResult ? undefined : 'alert'}
        tabIndex={edit ? 0 : undefined}
        onKeyDown={edit ? onKeyDown : undefined}
        onPointerDown={edit ? () => edit.onSelect(undefined) : undefined}
        aria-label={edit ? 'Vorschau – Elemente anklicken und ziehen, Pfeiltasten verschieben' : undefined}
      >
        {isResult && !outcomeBg && <div className="pv-tone-band" aria-hidden="true" />}
        {layout.elements.map(renderElement)}
      </div>
    </div>
  );
}

function flexAlign(align: LayoutElement['align']): CSSProperties['justifyContent'] {
  return align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
}
