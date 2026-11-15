import { describe, expect, it } from 'vitest';
import {
  WrongPasswordError,
  changeVaultPassword,
  createVault,
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  passwordProblem,
  unlockVault,
} from './crypto';

const FAST = 1000; // wenige PBKDF2-Runden, damit die Tests schnell laufen

describe('crypto', () => {
  it('verschlüsselt und entschlüsselt Text und JSON (AES-GCM)', async () => {
    const { dataKey } = await createVault('geheim123', FAST);
    const enc = await encryptText(dataKey, 'Max Mustermann');
    expect(enc.iv.length).toBe(12);
    expect(new TextDecoder().decode(enc.data)).not.toContain('Max');
    expect(await decryptText(dataKey, enc)).toBe('Max Mustermann');
    const obj = { firstName: 'Erika', photo: 'data:image/jpeg;base64,AAAA' };
    expect(await decryptJson(dataKey, await encryptJson(dataKey, obj))).toEqual(obj);
  });

  it('verwendet für jede Verschlüsselung einen neuen IV', async () => {
    const { dataKey } = await createVault('geheim123', FAST);
    const a = await encryptText(dataKey, 'gleich');
    const b = await encryptText(dataKey, 'gleich');
    expect(a.iv).not.toEqual(b.iv);
    expect(a.data).not.toEqual(b.data);
  });

  it('entsperrt nur mit dem richtigen Passwort', async () => {
    const { vault, dataKey } = await createVault('geheim123', FAST);
    const enc = await encryptText(dataKey, 'Daten');
    const again = await unlockVault(vault, 'geheim123');
    expect(await decryptText(again, enc)).toBe('Daten');
    await expect(unlockVault(vault, 'falsch123')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('erkennt manipulierte Daten', async () => {
    const { dataKey } = await createVault('geheim123', FAST);
    const enc = await encryptText(dataKey, 'Daten');
    enc.data[0] = (enc.data[0] ?? 0) ^ 1;
    await expect(decryptText(dataKey, enc)).rejects.toThrow();
  });

  it('Passwortwechsel behält die Daten lesbar', async () => {
    const { vault, dataKey } = await createVault('altesPasswort', FAST);
    const enc = await encryptText(dataKey, 'bleibt lesbar');
    const changed = await changeVaultPassword(vault, 'altesPasswort', 'neuesPasswort');
    expect(changed.salt).not.toEqual(vault.salt);
    expect(await decryptText(await unlockVault(changed, 'neuesPasswort'), enc)).toBe('bleibt lesbar');
    await expect(unlockVault(changed, 'altesPasswort')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(changeVaultPassword(vault, 'falsch', 'x12345678')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('der Datenschlüssel im Betrieb ist nicht exportierbar', async () => {
    const { dataKey } = await createVault('geheim123', FAST);
    expect(dataKey.extractable).toBe(false);
  });

  it('prüft Mindestanforderungen an das Passwort', () => {
    expect(passwordProblem('kurz')).toMatch(/8 Zeichen/);
    expect(passwordProblem(' mitLeerzeichen ')).toMatch(/Leerzeichen/);
    expect(passwordProblem('langesPasswort')).toBeNull();
  });
});
