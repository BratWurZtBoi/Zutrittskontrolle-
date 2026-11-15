import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { clearAllData, db } from '../../db/db';
import { ensureDefaultGroups } from '../../db/groups';
import { clearEvents } from '../../db/scans';
import { removeTestCards, seedTestCards } from '../../db/seed';
import { SettingsShell } from './SettingsShell';

export function DataSettings() {
  const counts = useLiveQuery(
    async () => ({ cards: await db.cards.count(), events: await db.events.count() }),
    [],
    { cards: 0, events: 0 },
  );
  const [message, setMessage] = useState<string | null>(null);
  const run = async (confirmText: string | null, action: () => Promise<string>) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setMessage(await action());
  };

  return (
    <SettingsShell title="Daten">
      <section className="card form">
        <p className="muted">
          Alle Daten liegen ausschließlich auf diesem Gerät ({counts.cards} Karten, {counts.events} Protokolleinträge).
        </p>
        <div className="button-row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              void run(null, async () => {
                const n = await seedTestCards();
                return n ? `${n} Testkarten angelegt.` : 'Testkarten sind bereits vorhanden.';
              })
            }
          >
            Testkarten anlegen
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void run('Alle Testkarten und deren Buchungen löschen?', async () => `${await removeTestCards()} Testkarte(n) entfernt.`)
            }
          >
            Testkarten entfernen
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void run('Gesamtes Protokoll und Anwesenheit löschen?', async () => {
                await clearEvents();
                return 'Protokoll und Anwesenheit gelöscht.';
              })
            }
          >
            Protokoll leeren
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() =>
              void run('ALLE Daten auf diesem Gerät unwiderruflich löschen? (Das Admin-Passwort bleibt erhalten.)', async () => {
                await clearAllData();
                await ensureDefaultGroups();
                return 'Alle Daten gelöscht. Die Standardgruppen wurden neu angelegt.';
              })
            }
          >
            Alle Daten löschen
          </button>
        </div>
        {message && <p className="form-success">{message}</p>}
      </section>
    </SettingsShell>
  );
}
