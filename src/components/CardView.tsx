import type { CSSProperties, ReactNode } from 'react';
import { textColorOn } from '../domain/color';
import {
  cardSize,
  cardText,
  cardValues,
  isShownOnCard,
  moveCardElement,
  resizeCardElement,
  resolveCardColor,
  sideOf,
  snapCardElement,
  type CardData,
  type CardElement,
  type CardFace,
  type CardLayout,
  type ResizeHandle,
} from '../domain/cardLayout';
import { useElementDrag, type EditHandlers } from '../hooks/useElementDrag';
import { QrImage } from './QrImage';

interface Props {
  layout: CardLayout;
  data: CardData;
  /** Token für den QR-Code. */
  token: string;
  /** Vorder- oder Rückseite. */
  face?: CardFace;
  /** Große Vorschau im Editor (füllt die Breite) statt Originalgröße in mm. */
  large?: boolean;
  edit?: EditHandlers<CardElement>;
  /** Druck: Ecken nicht abrunden (Kartendrucker, Bogen mit Schnittmarken). */
  square?: boolean;
  /** Eigene Platzhalter-Werte (Einladungen) statt der Kartendaten. */
  values?: Record<string, string>;
  /** QR-Code als Ausweis (ZK1) oder Einladung (ZE1). */
  qrKind?: 'card' | 'guest';
}

const CORNERS: ResizeHandle[] = ['nw', 'ne', 'sw', 'se'];

/**
 * Eine Kartenseite nach Layout. Positionen in % der Karte, Schriftgrößen in % der Kartenhöhe
 * (cqh) – dieselbe Darstellung im Druck (echte Millimeter) und in der großen Vorschau.
 */
export function CardView({ layout, data, token, face = 'front', large = false, edit, square = false, values: ownValues, qrKind = 'card' }: Props) {
  const size = cardSize(layout);
  const side = sideOf(layout, face);
  const onGroup = textColorOn(data.groupColor);
  const values = ownValues ?? cardValues(data);
  // Einladungen: keine Unterscheidung mit/ohne Person
  const hasHolder = ownValues ? true : Boolean(data.holder);
  const { surfaceRef, elementHandlers, surfaceHandlers, handleHandlers, guides } = useElementDrag(
    edit,
    side.elements,
    (e, x, y) => moveCardElement(e, x, y, size),
    {
      snap: (e, x, y) => snapCardElement(e, x, y, side.elements, size),
      resize: (start, handle, dx, dy) => resizeCardElement(start, handle, dx, dy, size),
    },
  );
  const color = (c: CardElement['color'], fallback: string) => resolveCardColor(c, data.groupColor, onGroup, fallback);
  const style: CSSProperties = {
    backgroundColor: color(side.background.color, '#ffffff'),
    color: layout.textColor,
    ...(large ? { aspectRatio: `${size.w} / ${size.h}` } : { width: `${size.w}mm`, height: `${size.h}mm` }),
    ...(side.background.image ? { backgroundImage: `url("${side.background.image}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
  };

  const renderElement = (element: CardElement) => {
    const hiddenHere = !isShownOnCard(element, hasHolder);
    if (hiddenHere && !edit) return null;
    const box: CSSProperties = { left: `${element.x}%`, top: `${element.y}%`, width: `${element.w}%` };
    let content: ReactNode = null;
    switch (element.type) {
      case 'band':
        box.height = `${element.h ?? 6}%`;
        box.background = color(element.color ?? 'group', data.groupColor);
        break;
      case 'text': {
        const text = cardText(element, values);
        if (text === null && !edit) return null;
        content = (
          <div
            className="cv-text"
            style={{ fontSize: `${element.size}cqh`, textAlign: element.align, fontWeight: element.bold ? 800 : 500, color: color(element.color, layout.textColor) }}
          >
            {text ?? <span className="cv-empty">{element.text}</span>}
          </div>
        );
        break;
      }
      case 'qr':
        content = <QrImage token={token} kind={qrKind} className="cv-qr" />;
        break;
      case 'photo': {
        const h = data.holder;
        if (h?.photo) content = <img className="cv-photo" src={h.photo} alt="" />;
        else if (h || edit) content = <div className="cv-photo cv-photo-empty">{h ? `${h.firstName[0] ?? ''}${h.lastName[0] ?? ''}`.toUpperCase() : 'Foto'}</div>;
        else return null;
        break;
      }
      case 'logo':
        if (layout.logo) content = <img className="cv-logo" src={layout.logo} alt="" />;
        else if (edit) content = <div className="cv-logo-missing">Logo</div>;
        else return null;
        break;
    }
    const selected = edit?.selectedId === element.id;
    const handles: ResizeHandle[] = selected ? (element.type === 'text' ? [...CORNERS, 'w', 'e'] : CORNERS) : [];
    return (
      <div
        key={element.id}
        className={`cv-el cv-el-${element.type}${selected ? ' cv-selected' : ''}${hiddenHere ? ' cv-hidden-here' : ''}${edit ? ' cv-editable' : ''}`}
        style={box}
        data-element={element.id}
        {...elementHandlers(element)}
      >
        {content}
        {handles.map((h) => (
          <span key={h} className={`cv-handle cv-handle-${h}`} data-handle={h} aria-hidden="true" {...handleHandlers(element, h)} />
        ))}
      </div>
    );
  };

  return (
    <article
      ref={surfaceRef}
      className={`card-view card-${layout.orientation} card-format-${layout.format ?? 'id1'}${large ? ' card-view-large' : ''}${square ? ' card-square' : ''}${face === 'back' ? ' card-back' : ''}`}
      style={style}
      aria-label={edit ? 'Vorschau der Karte – Elemente anklicken und ziehen, Ecken ziehen ändert die Größe, Pfeiltasten verschieben' : `Karte ${data.number}${face === 'back' ? ' (Rückseite)' : ''}`}
      {...surfaceHandlers}
    >
      {side.elements.map(renderElement)}
      {guides.x.map((x) => (
        <span key={`gx${x}`} className="cv-guide cv-guide-x" style={{ left: `${x}%` }} aria-hidden="true" />
      ))}
      {guides.y.map((y) => (
        <span key={`gy${y}`} className="cv-guide cv-guide-y" style={{ top: `${y}%` }} aria-hidden="true" />
      ))}
    </article>
  );
}
