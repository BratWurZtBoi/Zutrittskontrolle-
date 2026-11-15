import { useState } from 'react';
import { listCards } from '../db/cards';
import { encodeCardPayload } from '../domain/cardCode';
import { holderName } from '../domain/texts';
import { useSecureLiveQuery } from '../hooks/useSecureLiveQuery';

/** Nur im Testmodus: Scans ohne zweiten Bildschirm oder gedruckte Karte simulieren. */
export function TestScanPanel({ onScan }: { onScan: (text: string) => void }) {
  const cards = useSecureLiveQuery(listCards, [], []);
  const [selected, setSelected] = useState('');
  const current = cards.find(({ card }) => card.id === selected) ?? cards[0];

  return (
    <details className="test-panel no-print">
      <summary>Testmodus: Scan simulieren</summary>
      {cards.length === 0 ? (
        <p>Noch keine Karten vorhanden. Unter „Karten“ können Testkarten erzeugt werden.</p>
      ) : (
        <div className="button-row">
          <select value={current?.card.id ?? ''} onChange={(e) => setSelected(e.target.value)} aria-label="Karte für Testscan">
            {cards.map(({ card, group }) => (
              <option key={card.id} value={card.id}>
                {card.number} – {card.holder ? holderName(card.holder) : 'frei'} ({group?.name ?? '?'})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => current && onScan(encodeCardPayload(current.card.token))}>
            Karte scannen
          </button>
          <button type="button" className="btn" onClick={() => onScan('https://example.com/kein-ausweis')}>
            Fremder QR-Code
          </button>
        </div>
      )}
    </details>
  );
}
