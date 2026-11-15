import type { CSSProperties } from 'react';
import { textColorOn } from '../domain/color';
import { idleTexts, type LayoutResult, type LayoutTone, type PresentationLayout } from '../domain/presentationLayout';
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

function textColor(layout: PresentationLayout): string {
  return layout.textColor === 'dark' ? '#0f172a' : '#ffffff';
}

interface Props {
  layout: PresentationLayout;
  /** null = Ruhebildschirm */
  result: LayoutResult | null;
  orgName: string;
  now: Date;
  /** In der Vorschau des Editors (keine Vollbild-Schaltfläche, Maus sichtbar). */
  preview?: boolean;
}

/**
 * Gästebildschirm nach Layout. Größen in Container-Einheiten (cqw/cqh), damit
 * dieselbe Darstellung im Vollbild und als kleine Vorschau im Editor passt.
 */
export function PresentationView({ layout, result, orgName, now, preview = false }: Props) {
  const rootClass = `pv ${preview ? 'pv-preview' : ''}`;
  if (!result) {
    const { title, hint } = idleTexts(layout, orgName, now);
    const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return (
      <div className={rootClass}>
        <div className="presentation presentation-idle pv-screen" style={{ ...layoutBackground(layout), color: textColor(layout) }}>
          {layout.logo && <img className="pv-logo" src={layout.logo} alt="" />}
          {layout.show.org && <div className="presentation-org">{orgName}</div>}
          {title && <div className="presentation-welcome">{title}</div>}
          {hint && <div className="presentation-hint">{hint}</div>}
          {layout.show.clock && (
            <>
              <div className="presentation-clock">{time}</div>
              <div className="presentation-date">{date}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  const Icon = ICONS[result.tone];
  const toneColor = TONE_COLORS[result.tone];
  const outcomeBg = layout.resultBackground === 'outcome';
  const style: CSSProperties = outcomeBg
    ? { background: toneColor, color: '#ffffff' }
    : { ...layoutBackground(layout), color: textColor(layout), '--pv-tone': toneColor } as CSSProperties;
  const arrangement = layout.arrangement === 'side' && !result.photo ? 'center' : layout.arrangement;

  const group = result.groupName && (
    <span
      className="presentation-group"
      style={result.groupColor ? { background: result.groupColor, color: textColorOn(result.groupColor) } : undefined}
    >
      {result.groupName}
    </span>
  );

  return (
    <div className={rootClass}>
      <div
        className={`presentation presentation-result result-${result.tone} pv-screen pv-${arrangement} ${outcomeBg ? '' : 'pv-custom'}`}
        style={style}
        role={preview ? undefined : 'alert'}
      >
        {!outcomeBg && <div className="pv-tone-band" aria-hidden="true" />}
        {layout.logo && <img className="pv-logo pv-logo-small" src={layout.logo} alt="" />}
        {arrangement === 'side' ? (
          <div className="pv-side-row">
            <img className="presentation-photo" src={result.photo} alt="" />
            <div className="pv-side-text">
              <div className="presentation-title">
                <Icon className="presentation-icon" />
                {result.title}
              </div>
              {result.name && <div className="presentation-name">{result.name}</div>}
              {result.company && <div className="presentation-company">{result.company}</div>}
              {group}
              {result.text && <div className="presentation-detail">{result.text}</div>}
            </div>
          </div>
        ) : (
          <>
            <div className="presentation-title">
              <Icon className="presentation-icon" />
              {result.title}
            </div>
            {arrangement === 'center' && result.photo && <img className="presentation-photo" src={result.photo} alt="" />}
            {result.name && <div className="presentation-name">{result.name}</div>}
            {arrangement === 'center' && result.company && <div className="presentation-company">{result.company}</div>}
            {arrangement === 'center' && group}
            {result.text && <div className="presentation-detail">{result.text}</div>}
          </>
        )}
      </div>
    </div>
  );
}
