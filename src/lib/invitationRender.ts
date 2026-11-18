/**
 * Einladungen als Datei: jede Einladung wird in einem Canvas gezeichnet (wie die Vorschau:
 * Positionen in %, Schrift in % der Höhe) und als einseitiges PDF verpackt; alle zusammen als ZIP.
 * Läuft vollständig im Browser bzw. Programm – ohne Internet, ohne Zusatzbibliotheken (außer QR).
 */
import QRCode from 'qrcode';
import { cardSize, cardText, isShownOnCard, resolveCardColor, type CardData, type CardElement, type CardLayout } from '../domain/cardLayout';
import { encodeGuestPayload } from '../domain/cardCode';
import { textColorOn } from '../domain/color';
import { invitationCardData, invitationFilename, invitationValues } from '../domain/invitation';
import type { Guest, Occasion } from '../domain/occasion';
import { jpegPagePdf } from '../domain/pdf';
import { wrapLines } from '../domain/textWrap';
import { createZip, type ZipEntry } from '../domain/zip';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const LINE_HEIGHT = 1.15; // wie .card-view
export const PDF_DPI = 200;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

async function drawElement(
  ctx: CanvasRenderingContext2D,
  e: CardElement,
  W: number,
  H: number,
  layout: CardLayout,
  data: CardData,
  values: Record<string, string>,
  qrPayload: string,
) {
  const onGroup = textColorOn(data.groupColor);
  const color = (c: CardElement['color'], fallback: string) => resolveCardColor(c, data.groupColor, onGroup, fallback);
  const x = (e.x / 100) * W;
  const y = (e.y / 100) * H;
  const w = (e.w / 100) * W;
  switch (e.type) {
    case 'band':
      ctx.fillStyle = color(e.color ?? 'group', data.groupColor);
      ctx.fillRect(x, y, w, ((e.h ?? 6) / 100) * H);
      return;
    case 'text': {
      const text = cardText(e, values);
      if (!text) return;
      const px = (e.size / 100) * H;
      ctx.font = `${e.bold ? 800 : 500} ${px}px ${FONT}`;
      ctx.fillStyle = color(e.color, layout.textColor);
      ctx.textAlign = e.align;
      ctx.textBaseline = 'alphabetic';
      const m = ctx.measureText('Hg');
      const ascent = m.fontBoundingBoxAscent || px * 0.93;
      const descent = m.fontBoundingBoxDescent || px * 0.24;
      const lh = px * LINE_HEIGHT;
      const baseline = (lh - (ascent + descent)) / 2 + ascent;
      const tx = e.align === 'center' ? x + w / 2 : e.align === 'right' ? x + w : x;
      wrapLines(text, w, (s) => ctx.measureText(s).width).forEach((line, i) => ctx.fillText(line, tx, y + i * lh + baseline));
      return;
    }
    case 'qr': {
      const qr = QRCode.create(qrPayload, { errorCorrectionLevel: 'M' });
      const n = qr.modules.size;
      const margin = 2; // wie in der Vorschau
      const cell = w / (n + 2 * margin);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, w);
      ctx.fillStyle = '#000000';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.modules.get(r, c)) ctx.fillRect(Math.floor(x + (c + margin) * cell), Math.floor(y + (r + margin) * cell), Math.ceil(cell), Math.ceil(cell));
        }
      }
      return;
    }
    case 'logo': {
      if (!layout.logo) return;
      const img = await loadImage(layout.logo);
      ctx.drawImage(img, x, y, w, (w * img.naturalHeight) / img.naturalWidth);
      return;
    }
    case 'photo':
      return; // Einladungen haben keine Fotos
  }
}

/** Zeichnet eine Seite des Layouts in ein Canvas (dpi = Auflösung). */
export async function renderLayout(layout: CardLayout, data: CardData, values: Record<string, string>, qrPayload: string, dpi = PDF_DPI): Promise<HTMLCanvasElement> {
  const size = cardSize(layout);
  const W = Math.round((size.w / 25.4) * dpi);
  const H = Math.round((size.h / 25.4) * dpi);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Zeichnen wird von diesem Browser nicht unterstützt.');
  const onGroup = textColorOn(data.groupColor);
  ctx.fillStyle = resolveCardColor(layout.background.color, data.groupColor, onGroup, '#ffffff');
  ctx.fillRect(0, 0, W, H);
  if (layout.background.image) {
    const img = await loadImage(layout.background.image);
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const iw = img.naturalWidth * scale;
    const ih = img.naturalHeight * scale;
    ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
  }
  for (const e of layout.elements) {
    if (!isShownOnCard(e, true)) continue;
    await drawElement(ctx, e, W, H, layout, data, values, qrPayload);
  }
  return canvas;
}

function canvasJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error('Bild konnte nicht erzeugt werden.'))),
      'image/jpeg',
      quality,
    );
  });
}

/** PDF einer Einladung für einen Gast. */
export async function invitationPdf(layout: CardLayout, occasion: Occasion, guest: Guest, orgName: string): Promise<Uint8Array> {
  const canvas = await renderLayout(layout, invitationCardData(occasion, guest, orgName), invitationValues(occasion, guest, orgName), encodeGuestPayload(guest.token));
  const jpeg = await canvasJpeg(canvas);
  return jpegPagePdf(jpeg, { w: canvas.width, h: canvas.height }, cardSize(layout), `Einladung ${guest.number} - ${occasion.name}`);
}

/** Alle Einladungen als einzelne PDFs (Dateiname je Gast). Fortschritt über onProgress(fertig, gesamt). */
export async function invitationFiles(
  layout: CardLayout,
  occasion: Occasion,
  guests: Guest[],
  orgName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ZipEntry[]> {
  const files: ZipEntry[] = [];
  for (const [i, guest] of guests.entries()) {
    files.push({ name: invitationFilename(guest), data: await invitationPdf(layout, occasion, guest, orgName) });
    onProgress?.(i + 1, guests.length);
    await new Promise((r) => setTimeout(r, 0)); // Oberfläche zwischendurch aktualisieren
  }
  return files;
}

export function zipFiles(files: ZipEntry[]): Blob {
  const bytes = createZip(files);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' });
}
