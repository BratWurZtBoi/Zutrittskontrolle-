/**
 * Notfallliste schnell drucken: Wie wird gedruckt? Reine Logik ohne DOM.
 *
 * - Browser/App: immer über den Druckdialog (ohne Dialog erlauben Browser nicht).
 * - Windows-/Linux-Programm: auf Wunsch ohne Dialog direkt auf den eingestellten Drucker.
 */

export const MAX_EMERGENCY_COPIES = 5;

export interface EmergencyPrintSettings {
  emergencyDirectPrint: boolean;
  emergencyPrinter: string;
  emergencyCopies: number;
}

export type EmergencyPrintPlan = { mode: 'dialog' } | { mode: 'direct'; printer: string; copies: number };

/** Anzahl Ausdrucke auf 1 … MAX_EMERGENCY_COPIES begrenzen. */
export function clampCopies(n: number): number {
  return Math.min(MAX_EMERGENCY_COPIES, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));
}

export function emergencyPrintPlan(settings: EmergencyPrintSettings, desktop: boolean): EmergencyPrintPlan {
  if (!desktop || !settings.emergencyDirectPrint) return { mode: 'dialog' };
  return { mode: 'direct', printer: settings.emergencyPrinter, copies: clampCopies(settings.emergencyCopies) };
}

/** Name des Druckers für Meldungen, z. B. „Büro-Laser“ bzw. „Standarddrucker“. */
export function printerLabel(printer: string): string {
  return printer ? `„${printer}“` : 'den Standarddrucker';
}

/** Rückmeldung nach dem Direktdruck. */
export function directPrintDone(printer: string, copies: number): string {
  return `Notfallliste an ${printerLabel(printer)} gesendet${copies > 1 ? ` (${copies} Ausdrucke)` : ''}.`;
}

/** Fehlermeldung des Programms (Englisch) verständlich machen. */
export function printErrorText(reason: string | undefined): string {
  const r = (reason ?? '').toLowerCase();
  if (r.includes('invalid devicename')) return 'Der eingestellte Drucker wurde nicht gefunden';
  if (r.includes('enumerate printers') || r.includes('no printer')) return 'Es wurde kein Drucker gefunden';
  if (r.includes('cancel')) return 'Der Druck wurde abgebrochen';
  return reason ? `Fehler: ${reason}` : 'Unbekannter Fehler';
}
