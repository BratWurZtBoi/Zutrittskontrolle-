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

/** Kann das Gerät Dateien teilen (z. B. Android: Quick Share, E-Mail, USB)? */
export function canShareFile(blob: Blob, filename: string): boolean {
  try {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch {
    return false; // abgebrochen oder nicht unterstützt
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
