/** Fotos werden auf ein Passbild-Format (3:4) zugeschnitten und als JPEG verkleinert gespeichert. */

const OUT_W = 360;
const OUT_H = 480;

type Source = HTMLVideoElement | HTMLImageElement;

function sourceSize(src: Source): { w: number; h: number } {
  return src instanceof HTMLVideoElement
    ? { w: src.videoWidth, h: src.videoHeight }
    : { w: src.naturalWidth, h: src.naturalHeight };
}

export function captureToDataUrl(src: Source, mirror = false): string {
  const { w, h } = sourceSize(src);
  if (!w || !h) throw new Error('Kein Bild verfügbar.');
  const targetRatio = OUT_W / OUT_H;
  let cw = w;
  let ch = h;
  if (w / h > targetRatio) cw = h * targetRatio;
  else ch = w / targetRatio;
  const sx = (w - cw) / 2;
  const sy = (h - ch) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar.');
  if (mirror) {
    ctx.translate(OUT_W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, OUT_W, OUT_H);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function fileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return captureToDataUrl(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ScaleOptions {
  maxWidth: number;
  maxHeight: number;
  /** JPEG für Fotos/Hintergründe, PNG für Logos mit Transparenz. */
  type: 'image/jpeg' | 'image/png';
  quality?: number;
}

/** Größte erlaubte Bilddatei (vor dem Verkleinern). */
export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Bild aus einer Datei verkleinern (Seitenverhältnis bleibt) und als Data-URL liefern –
 * z. B. Hintergrundbild oder Logo für den Präsentationsbildschirm. Alles lokal.
 */
export async function fileToScaledDataUrl(file: File, opts: ScaleOptions): Promise<string> {
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error('Die Bilddatei ist zu groß (höchstens 20 MB).');
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei wählen (JPG, PNG …).');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error('Das Bild konnte nicht gelesen werden.');
    }
    const scale = Math.min(1, opts.maxWidth / img.naturalWidth, opts.maxHeight / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas nicht verfügbar.');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL(opts.type, opts.quality ?? 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
