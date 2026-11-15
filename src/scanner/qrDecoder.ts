/**
 * QR-Dekodierung vollständig lokal (jsQR). Läuft bevorzugt in einem Web Worker,
 * fällt bei Problemen auf den Hauptthread zurück.
 */
import type { DecodeRequest, DecodeResponse } from './qrWorker';

export interface QrDecoder {
  decode(image: ImageData): Promise<string | null>;
  dispose(): void;
}

export function createQrDecoder(): QrDecoder {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./qrWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  if (!worker) return mainThreadDecoder();

  let nextId = 1;
  const pending = new Map<number, (text: string | null) => void>();
  worker.onmessage = (e: MessageEvent<DecodeResponse>) => {
    pending.get(e.data.id)?.(e.data.text);
    pending.delete(e.data.id);
  };
  worker.onerror = () => {
    pending.forEach((resolve) => resolve(null));
    pending.clear();
  };
  const w = worker;

  return {
    decode(image) {
      const id = nextId++;
      const req: DecodeRequest = { id, width: image.width, height: image.height, buffer: image.data.buffer as ArrayBuffer };
      return new Promise((resolve) => {
        pending.set(id, resolve);
        w.postMessage(req, [req.buffer]);
      });
    },
    dispose() {
      w.terminate();
      pending.forEach((resolve) => resolve(null));
      pending.clear();
    },
  };
}

function mainThreadDecoder(): QrDecoder {
  let jsQR: typeof import('jsqr').default | null = null;
  return {
    async decode(image) {
      jsQR ??= (await import('jsqr')).default;
      return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
    },
    dispose() {},
  };
}
