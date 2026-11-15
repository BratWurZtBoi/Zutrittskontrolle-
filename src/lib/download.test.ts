import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareFile, shareableFile } from './download';

const blob = new Blob(['{"format":"zutrittskontrolle-backup"}'], { type: 'application/octet-stream' });

function mockShare(impl: (data: { files: File[] }) => Promise<void>) {
  const share = vi.fn(impl);
  vi.stubGlobal('navigator', { share, canShare: () => true });
  return share;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Dateien teilen (Quick Share)', () => {
  it('Backup (.zkb) wird als .txt geteilt – Chrome erlaubt .zkb nicht', async () => {
    const file = shareableFile(blob, 'zutrittskontrolle-backup-2026-11-15-1030.zkb');
    expect(file.name).toBe('zutrittskontrolle-backup-2026-11-15-1030.zkb.txt');
    expect(file.type).toBe('text/plain');
    expect(await file.text()).toBe(await blob.text()); // Inhalt unverändert
  });

  it('erlaubte Endungen bleiben unverändert', () => {
    const csv = shareableFile(new Blob(['a;b'], { type: 'text/csv' }), 'aktionen.csv');
    expect(csv.name).toBe('aktionen.csv');
    expect(csv.type).toBe('text/csv');
  });

  it('übergibt die .txt-Datei an das Teilen-Menü', async () => {
    const share = mockShare(async () => undefined);
    expect(await shareFile(blob, 'backup.zkb', 'Backup')).toEqual({ status: 'shared' });
    expect(share.mock.calls[0]?.[0].files[0]?.name).toBe('backup.zkb.txt');
  });

  it('Abbrechen ist kein Fehler, Ablehnung wird gemeldet statt verschluckt', async () => {
    mockShare(async () => {
      throw new DOMException('abgebrochen', 'AbortError');
    });
    expect(await shareFile(blob, 'backup.zkb', 'Backup')).toEqual({ status: 'cancelled' });
    mockShare(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    });
    const r = await shareFile(blob, 'backup.zkb', 'Backup');
    expect(r.status).toBe('failed');
  });

  it('ohne Teilen-Funktion: verständliche Meldung', async () => {
    vi.stubGlobal('navigator', {});
    expect(await shareFile(blob, 'backup.zkb', 'Backup')).toMatchObject({ status: 'failed' });
  });
});
