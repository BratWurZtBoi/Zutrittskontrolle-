/** Farbhilfen für Gruppenfarben. */

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Relative Leuchtdichte nach WCAG. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Schwarz oder Weiß – je nachdem, was auf der Gruppenfarbe besser lesbar ist. */
export function textColorOn(hex: string): '#000000' | '#ffffff' {
  if (!isHexColor(hex)) return '#ffffff';
  const l = luminance(hex);
  const contrastWhite = 1.05 / (l + 0.05);
  const contrastBlack = (l + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

/** Vorschläge für die Farbauswahl (gut unterscheidbar, auch gedruckt). */
export const GROUP_COLOR_PRESETS = [
  '#2563eb',
  '#ea580c',
  '#16a34a',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#db2777',
  '#475569',
  '#000000',
];
