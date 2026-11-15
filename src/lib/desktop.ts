/**
 * Windows-Programm (Electron): Funktionen, die nur dort zur Verfügung stehen.
 * Im Browser ist `getDesktop()` null – die App verhält sich dann wie bisher.
 */

export interface DesktopFolder {
  path: string;
  name: string;
}

export interface DesktopApi {
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
