/** Dekodiert QR-Codes im Hintergrund-Thread, damit die Oberfläche flüssig bleibt. */
import jsQR from 'jsqr';

export interface DecodeRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface DecodeResponse {
  id: number;
  text: string | null;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<DecodeRequest>) => void) | null;
  postMessage(msg: DecodeResponse): void;
};

scope.onmessage = (e) => {
  const { id, width, height, buffer } = e.data;
  let text: string | null = null;
  try {
    text = jsQR(new Uint8ClampedArray(buffer), width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  } catch {
    text = null;
  }
  scope.postMessage({ id, text });
};
