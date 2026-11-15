import type { CSSProperties, ReactNode } from 'react';
import { textColorOn } from '../domain/color';
import {
  cardText,
  cardValues,
  isShownOnCard,
  moveCardElement,
  resolveCardColor,
  type CardData,
  type CardElement,
  type CardLayout,
} from '../domain/cardLayout';
import { useElementDrag, type EditHandlers } from '../hooks/useElementDrag';
import { QrImage } from './QrImage';

interface Props {
  layout: CardLayout;
  data: CardData;
  /** Token für den QR-Code. */
  token: string;
  /** Große Vorschau im Editor (füllt die Breite) statt Originalgröße 85,6 × 54 mm. */
  large?: boolean;
  edit?: EditHandlers<CardElement>;
}

/**
 * Eine Karte nach Layout. Positionen in % der Karte, Schriftgrößen in % der Kartenhöhe
 * (cqh) – dieselbe Darstellung im Druck (echte Millimeter) und in der großen Vorschau.
 */
export function CardView({ layout, data, token, large = false, edit }: Props) {
  const onGroup = textColorOn(data.groupColor);
  const values = cardValues(data);
  const hasHolder = Boolean(data.holder);
  const { surfaceRef, elementHandlers, surfaceHandlers } = useElementDrag(edit, layout.elements, (e, x, y) =>
    moveCardElement(e, x, y, layout.orientation),
  );
  const color = (c: CardElement['color'], fallback: string) => resolveCardColor(c, data.groupColor, onGroup, fallback);
  const style: CSSProperties = {
    backgroundColor: color(layout.background.color, '#ffffff'),
    color: layout.textColor,
    ...(layout.background.image ? { backgroundImage: `url("${layout.background.image}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
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
        content = <QrImage token={token} className="cv-qr" />;
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
    return (
      <div
        key={element.id}
        className={`cv-el cv-el-${element.type}${selected ? ' cv-selected' : ''}${hiddenHere ? ' cv-hidden-here' : ''}${edit ? ' cv-editable' : ''}`}
        style={box}
        data-element={element.id}
        {...elementHandlers(element)}
      >
        {content}
      </div>
    );
  };

  return (
    <article
      ref={surfaceRef}
      className={`card-view card-${layout.orientation}${large ? ' card-view-large' : ''}`}
      style={style}
      aria-label={edit ? 'Vorschau der Karte – Elemente anklicken und ziehen, Pfeiltasten verschieben' : `Karte ${data.number}`}
      {...surfaceHandlers}
    >
      {layout.elements.map(renderElement)}
    </article>
  );
}
