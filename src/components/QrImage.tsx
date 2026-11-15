import { useEffect, useState } from 'react';
import { encodeCardPayload } from '../domain/cardCode';
import { qrSvgDataUrl } from '../lib/qr';

/** QR-Code des Ausweises (Inhalt: ZK1:<Token>). */
export function QrImage({ token, className = '' }: { token: string; className?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let active = true;
    void qrSvgDataUrl(encodeCardPayload(token)).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [token]);
  return src ? <img className={`qr ${className}`} src={src} alt="QR-Code des Ausweises" /> : <div className={`qr ${className}`} />;
}
