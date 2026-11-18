/**
 * Einseitiges PDF mit einem JPEG-Bild über die ganze Seite (z. B. eine Einladung).
 * Reine Funktion ohne Abhängigkeiten – die Seite wird vorher in einem Canvas gezeichnet.
 */

const MM_TO_PT = 72 / 25.4;

export function jpegPagePdf(jpeg: Uint8Array, pixel: { w: number; h: number }, pageMm: { w: number; h: number }, title = 'Einladung'): Uint8Array {
  const enc = new TextEncoder();
  const w = Math.round(pageMm.w * MM_TO_PT * 100) / 100;
  const h = Math.round(pageMm.h * MM_TO_PT * 100) / 100;
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const safeTitle = title.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');
  const objects: (string | Uint8Array)[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`],
    [
      `<< /Type /XObject /Subtype /Image /Width ${pixel.w} /Height ${pixel.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      jpeg,
      '\nendstream',
    ],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
    [`<< /Title (${safeTitle}) /Producer (Zutrittskontrolle) >>`],
  ];
  const chunks: Uint8Array[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-ÿ]/g, 'x'));
  const offsets: number[] = [];
  objects.forEach((parts, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    parts.forEach(push);
    push('\nendobj\n');
  });
  const xref = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const o of offsets) push(`${String(o).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
