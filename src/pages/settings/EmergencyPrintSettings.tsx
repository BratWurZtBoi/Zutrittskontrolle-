import { useEffect, useState } from 'react';
import { saveSettings, type AppSettings } from '../../db/settings';
import { MAX_EMERGENCY_COPIES } from '../../domain/emergencyPrint';
import { getDesktop, type DesktopPrinter } from '../../lib/desktop';

/**
 * Notfallliste (Teil der Seite „Allgemein & Gerät“, je Gerät): Fotos, im Windows-/Linux-Programm
 * außerdem Drucken ohne Druckdialog auf einen festen Drucker mit Anzahl der Ausdrucke.
 */
export function EmergencyPrintSettings({ settings }: { settings: AppSettings }) {
  const desktop = getDesktop();
  const [printers, setPrinters] = useState<DesktopPrinter[] | null>(null);
  const save = (patch: Partial<AppSettings>) => void saveSettings(patch);

  useEffect(() => {
    if (!desktop) return;
    desktop.printers().then(setPrinters, () => setPrinters([]));
  }, [desktop]);

  // Eingestellter Drucker fehlt (abgesteckt/umbenannt)? Trotzdem anzeigen, damit nichts still verloren geht.
  const missing = Boolean(settings.emergencyPrinter) && printers !== null && !printers.some((p) => p.name === settings.emergencyPrinter);

  return (
    <section className="card form">
      <h2>Notfallliste</h2>
      <p className="muted">
        Der rote Knopf <strong>„⚠ Notfallliste“</strong> im Dashboard bzw. <strong>„⚠ Notfall“</strong> oben im Menü druckt sofort die
        Liste aller Anwesenden.
        {!desktop && ' Im Browser öffnet sich dafür direkt der Druckdialog – nur noch „Drucken“ bestätigen.'}
      </p>
      <label className="checkbox">
        <input type="checkbox" checked={settings.emergencyPhotos} onChange={(e) => save({ emergencyPhotos: e.target.checked })} />
        Mit Fotos drucken (hilft beim Erkennen, braucht mehr Papier)
      </label>

      {desktop ? (
        <>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.emergencyDirectPrint}
              onChange={(e) => save({ emergencyDirectPrint: e.target.checked })}
            />
            Ohne Druckdialog sofort drucken (dieses Gerät)
          </label>
          {settings.emergencyDirectPrint && (
            <>
              <label>
                Drucker
                <select value={settings.emergencyPrinter} onChange={(e) => save({ emergencyPrinter: e.target.value })}>
                  <option value="">Standarddrucker des Systems</option>
                  {missing && <option value={settings.emergencyPrinter}>{settings.emergencyPrinter} (nicht gefunden)</option>}
                  {(printers ?? []).map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
              {missing && <p className="form-error">Der eingestellte Drucker ist zurzeit nicht verfügbar.</p>}
              {printers?.length === 0 && <p className="hint">Es wurde kein Drucker gefunden – bitte den Drucker zuerst in {desktop.platform === 'linux' ? 'Linux' : 'Windows'} einrichten.</p>}
              <label>
                Anzahl Ausdrucke (z. B. einer je Sammelplatz)
                <select value={settings.emergencyCopies} onChange={(e) => save({ emergencyCopies: Number(e.target.value) })}>
                  {Array.from({ length: MAX_EMERGENCY_COPIES }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">Tipp: Einmal mit dem roten Knopf ausprobieren, ob die Liste am richtigen Drucker ankommt.</p>
            </>
          )}
        </>
      ) : (
        <p className="muted">Ganz ohne Druckdialog drucken kann nur das Programm für Windows/Linux – Browser erlauben das nicht.</p>
      )}
    </section>
  );
}
