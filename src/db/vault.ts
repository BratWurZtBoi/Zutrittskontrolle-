import type { VaultRecord } from '../security/crypto';
import { encryptJson, encryptText } from '../security/crypto';
import { holderName } from '../domain/texts';
import { VAULT_KEY, db } from './db';

export async function loadVault(): Promise<VaultRecord | undefined> {
  const rec = await db.settings.get(VAULT_KEY);
  return rec?.value as VaultRecord | undefined;
}

export async function saveVault(vault: VaultRecord): Promise<void> {
  await db.settings.put({ key: VAULT_KEY, value: vault });
}

/**
 * Wandelt unverschlüsselte Altbestände (Personendaten auf Karten, Namen im
 * Protokoll) in verschlüsselte Daten um. Wird bei der Ersteinrichtung ausgeführt.
 * Liefert die Anzahl umgewandelter Datensätze.
 */
export async function migratePlaintext(key: CryptoKey): Promise<number> {
  // Lesen → verschlüsseln (außerhalb einer Transaktion) → schreiben
  const cards = (await db.cards.toArray()).filter((c) => c.holder);
  const events = (await db.events.toArray()).filter((e) => e.holderName !== undefined);

  const cardUpdates = await Promise.all(
    cards.map(async (c) => {
      const { holder, ...rest } = c;
      return {
        ...rest,
        holderEnc: await encryptJson(key, holder),
        nameEnc: await encryptText(key, holderName(holder) ?? ''),
      };
    }),
  );
  const eventUpdates = await Promise.all(
    events.map(async (e) => {
      const { holderName: name, ...rest } = e;
      return { ...rest, holderNameEnc: await encryptText(key, name ?? '') };
    }),
  );

  await db.transaction('rw', [db.cards, db.events], async () => {
    await db.cards.bulkPut(cardUpdates);
    await db.events.bulkPut(eventUpdates);
  });
  return cardUpdates.length + eventUpdates.length;
}
