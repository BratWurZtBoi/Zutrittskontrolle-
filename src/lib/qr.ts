import QRCode from 'qrcode';

/** Erzeugt einen QR-Code als SVG-Data-URL (scharf beim Drucken). */
export async function qrSvgDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
