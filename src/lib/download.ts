/** Dateien speichern oder teilen – funktioniert auf Android (Chrome) und Windows (Edge/Chrome). */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // etwas warten, damit der Download sicher gestartet ist
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), filename);
}

/**
 * Dateiendungen, die Chrome (Android und Windows) beim Teilen erlaubt. Andere Dateien
 * lehnt der Browser mit „NotAllowedError“ ab – deshalb reagierte „Teilen“ beim
 * Backup (.zkb) früher nicht.
 */
const SHAREABLE_EXTENSIONS = new Set([
  'avif', 'bmp', 'css', 'csv', 'gif', 'htm', 'html', 'ico', 'jpeg', 'jpg', 'm4a', 'mp3', 'mp4',
  'oga', 'ogg', 'opus', 'pdf', 'png', 'svg', 'text', 'tif', 'tiff', 'txt', 'wav', 'weba', 'webm', 'webp',
]);

/**
 * Datei in einer Form, die geteilt werden darf: unbekannte Endungen (z. B. .zkb) bekommen
 * zusätzlich „.txt“ und den Typ text/plain. Der Inhalt bleibt unverändert (beim Backup:
 * weiterhin verschlüsselt); „Backup einspielen“ nimmt beide Varianten an.
 */
export function shareableFile(blob: Blob, filename: string): File {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';
  if (SHAREABLE_EXTENSIONS.has(ext)) return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  return new File([blob], `${filename}.txt`, { type: 'text/plain' });
}

/** Kann das Gerät Dateien teilen (z. B. Android: Quick Share, E-Mail; Windows: Teilen-Dialog)? */
export function canShareFile(blob: Blob, filename: string): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [shareableFile(blob, filename)] });
  } catch {
    return false;
  }
}

export type ShareResult = { status: 'shared' } | { status: 'cancelled' } | { status: 'failed'; message: string };

/** Datei über das Teilen-Menü des Geräts senden (Quick Share, E-Mail, …). */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<ShareResult> {
  if (typeof navigator.share !== 'function') {
    return { status: 'failed', message: 'Dieses Gerät bzw. dieser Browser kann keine Dateien teilen.' };
  }
  const file = shareableFile(blob, filename);
  try {
    await navigator.share({ files: [file], title });
    return { status: 'shared' };
  } catch (err) {
    const name = err instanceof DOMException || err instanceof Error ? err.name : '';
    if (name === 'AbortError') return { status: 'cancelled' }; // Teilen-Menü geschlossen
    if (name === 'NotAllowedError') {
      return { status: 'failed', message: 'Der Browser hat das Teilen nicht erlaubt. Bitte noch einmal antippen.' };
    }
    return { status: 'failed', message: err instanceof Error && err.message ? err.message : 'Teilen fehlgeschlagen.' };
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
