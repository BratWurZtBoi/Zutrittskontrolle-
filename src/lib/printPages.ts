/**
 * Benannte Druckseiten in Kartengröße (Kartendrucker): die Regeln werden zur Laufzeit als
 * eigenes Stylesheet angelegt (CSSOM – kein Inline-Style, verträgt sich mit der CSP).
 */
import { pageName } from '../domain/printLayout';
import type { CardSize } from '../domain/cardLayout';

let sheet: CSSStyleSheet | null = null;
const known = new Set<string>();

/** Sorgt dafür, dass es die Seite `pageName(size)` gibt; liefert den Klassennamen dafür. */
export function ensurePageSize(size: CardSize): string {
  const name = pageName(size);
  if (known.has(name) || typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in document)) return name;
  try {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
    sheet.insertRule(`@page ${name} { size: ${size.w}mm ${size.h}mm; margin: 0; }`, sheet.cssRules.length);
    sheet.insertRule(`.${name} { page: ${name}; }`, sheet.cssRules.length);
    known.add(name);
  } catch {
    // ältere Browser: Seite im Druckdialog von Hand einstellen
  }
  return name;
}
