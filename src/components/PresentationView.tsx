import type { CSSProperties, ReactNode } from 'react';
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
import { useElementDrag, type EditHandlers as GenericEditHandlers } from '../hooks/useElementDrag';
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
export type EditHandlers = GenericEditHandlers<LayoutElement>;

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
  const { surfaceRef, elementHandlers, surfaceHandlers } = useElementDrag(edit, layout.elements, moveElement);
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
        {...elementHandlers(element)}
      >
        {content}
      </div>
    );
  };

  return (
    <div className={`pv${preview ? ' pv-preview' : ''}`}>
      <div
        ref={surfaceRef}
        className={`presentation ${isResult ? `presentation-result result-${tone}` : 'presentation-idle'} ${outcomeBg || !isResult ? '' : 'pv-custom'}`}
        style={style}
        role={preview || !isResult ? undefined : 'alert'}
        {...surfaceHandlers}
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
