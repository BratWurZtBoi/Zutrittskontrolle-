/**
 * Windows- und Linux-Programm (Electron): Funktionen, die nur dort zur Verfügung stehen.
 * Im Browser ist `getDesktop()` null – die App verhält sich dann wie bisher.
 */

export interface DesktopFolder {
  path: string;
  name: string;
}

export interface DesktopApi {
  /** 'win32' oder 'linux' */
  platform: string;
  info(): Promise<{ version: string; dataPath: string }>;
  /** Präsentationsfenster: auf dem zweiten Bildschirm im Vollbild, sonst als Fenster. */
  openPresentation(): Promise<'other-screen' | 'window'>;
  chooseBackupFolder(): Promise<DesktopFolder | null>;
  backupFolder(): Promise<DesktopFolder | null>;
  clearBackupFolder(): Promise<void>;
  backupList(): Promise<string[]>;
  backupWrite(filename: string, content: string): Promise<void>;
  backupRemove(filename: string): Promise<void>;
  getAutostart(): Promise<boolean>;
  setAutostart(on: boolean): Promise<boolean>;
  /** Installierte Drucker (für den Direktdruck der Notfallliste). */
  printers(): Promise<DesktopPrinter[]>;
  /** Aktuelle Seite ohne Druckdialog drucken ('' = Standarddrucker). */
  printDirect(options: { printer: string; copies: number }): Promise<{ ok: boolean; error?: string }>;
}

export interface DesktopPrinter {
  name: string;
  displayName: string;
}

declare global {
  interface Window {
    zkDesktop?: DesktopApi;
  }
}

export function getDesktop(): DesktopApi | null {
  return typeof window !== 'undefined' && window.zkDesktop ? window.zkDesktop : null;
}

export function isDesktopApp(): boolean {
  return getDesktop() !== null;
}
