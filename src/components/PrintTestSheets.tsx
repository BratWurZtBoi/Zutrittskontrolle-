import { A4, SHEET_MARGIN_MM, type FlipEdge } from '../domain/printLayout';

/** Kreuz zum Prüfen der Duplex-Ausrichtung (Position auf der Vorderseite in mm). */
const CROSS = { x: 40, y: 60 };

/**
 * Probeseite zum Nachmessen: Lineale (100 mm), eine Scheckkarte in Originalgröße und der
 * Druckrand – bei „beidseitig“ zusätzlich eine Rückseite mit einem Kreuz, das genau hinter
 * dem Kreuz der Vorderseite liegen muss.
 */
export function PrintTestSheets({ duplex, flip }: { duplex: boolean; flip: FlipEdge }) {
  // Hochformat: lange Kante = senkrechte Achse → x spiegeln; kurze Kante → y spiegeln
  const back = flip === 'long' ? { x: A4.w - CROSS.x, y: CROSS.y } : { x: CROSS.x, y: A4.h - CROSS.y };
  return (
    <>
      <p className="no-print sheet-label">Probeseite · Vorderseite</p>
      <section className="print-sheet sheet-portrait test-sheet" style={{ width: `${A4.w}mm`, height: `${A4.h}mm` }} aria-label="Probeseite">
        <span className="test-margin" style={{ inset: `${SHEET_MARGIN_MM}mm` }} />
        <div className="test-text" style={{ left: '20mm', top: '16mm', width: '170mm' }}>
          <strong>Probeseite – Maßstab prüfen</strong>
          <br />
          Die Lineale müssen genau 100 mm lang sein, das Rechteck genau so groß wie eine Scheckkarte (85,6 × 54 mm). Sonst im
          Druckdialog „Tatsächliche Größe“ bzw. Maßstab 100 % wählen. Die gestrichelte Linie zeigt den Druckrand (8 mm).
        </div>
        <Ruler x={20} y={150} horizontal />
        <Ruler x={150} y={40} />
        <div className="test-card" style={{ left: '20mm', top: '170mm', width: '85.6mm', height: '54mm' }}>
          Scheckkarte 85,6 × 54 mm
        </div>
        <Cross x={CROSS.x} y={CROSS.y} />
        {duplex && (
          <div className="test-text" style={{ left: `${CROSS.x + 8}mm`, top: `${CROSS.y - 3}mm`, width: '90mm' }}>
            Kreuz der Vorderseite – gegen das Licht halten: das Kreuz der Rückseite muss genau dahinter liegen.
          </div>
        )}
      </section>
      {duplex && (
        <>
          <p className="no-print sheet-label">Probeseite · Rückseite (beidseitig, an {flip === 'long' ? 'langer' : 'kurzer'} Kante wenden)</p>
          <section className="print-sheet sheet-portrait test-sheet" style={{ width: `${A4.w}mm`, height: `${A4.h}mm` }} aria-label="Probeseite Rückseite">
            <Cross x={back.x} y={back.y} />
            <div className="test-text" style={{ left: '20mm', top: '120mm', width: '170mm' }}>
              <strong>Rückseite</strong>
              <br />
              Liegt das Kreuz nicht hinter dem der Vorderseite, im Druck „Wenden an {flip === 'long' ? 'kurzer' : 'langer'} Kante“ probieren.
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Ruler({ x, y, horizontal = false }: { x: number; y: number; horizontal?: boolean }) {
  const ticks = Array.from({ length: 101 }, (_, i) => i);
  return (
    <div className={horizontal ? 'test-ruler test-ruler-h' : 'test-ruler test-ruler-v'} style={{ left: `${x}mm`, top: `${y}mm` }} aria-label="Lineal 100 mm">
      {ticks.map((i) => {
        const len = i % 10 === 0 ? 4 : i % 5 === 0 ? 2.5 : 1.5;
        return (
          <span
            key={i}
            className="test-tick"
            style={horizontal ? { left: `${i}mm`, top: 0, height: `${len}mm` } : { top: `${i}mm`, left: 0, width: `${len}mm` }}
          >
            {i % 10 === 0 && <span className="test-tick-label">{i}</span>}
          </span>
        );
      })}
    </div>
  );
}

function Cross({ x, y }: { x: number; y: number }) {
  return (
    <>
      <span className="test-cross test-cross-h" style={{ left: `${x - 6}mm`, top: `${y}mm` }} />
      <span className="test-cross test-cross-v" style={{ left: `${x}mm`, top: `${y - 6}mm` }} />
    </>
  );
}
