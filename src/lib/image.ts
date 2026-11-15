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
