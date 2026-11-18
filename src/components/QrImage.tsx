import { useEffect, useState } from 'react';
import { encodeCardPayload, encodeGuestPayload } from '../domain/cardCode';
import { qrSvgDataUrl } from '../lib/qr';

/** QR-Code eines Ausweises (ZK1:<Token>) bzw. einer Einladung (ZE1:<Token>). */
export function QrImage({ token, kind = 'card', className = '' }: { token: string; kind?: 'card' | 'guest'; className?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let active = true;
    void qrSvgDataUrl(kind === 'guest' ? encodeGuestPayload(token) : encodeCardPayload(token)).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [token, kind]);
  const alt = kind === 'guest' ? 'QR-Code der Einladung' : 'QR-Code des Ausweises';
  return src ? <img className={`qr ${className}`} src={src} alt={alt} /> : <div className={`qr ${className}`} />;
}
