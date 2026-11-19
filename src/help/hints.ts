/**
 * Kurze Erklärungen für die ⓘ-Knöpfe an Feldern (`components/InfoTip`). topic = passendes Hilfethema
 * (Link „Mehr in der Hilfe“). Bei geänderten Funktionen hier mit anpassen.
 */
export interface Hint {
  text: string;
  topic?: string;
}

export const HINTS = {
  cooldown: {
    text: 'So lange nach einer Buchung wird dieselbe Karte nicht noch einmal gebucht – es erscheint „Bereits erfasst“. Verhindert Doppelbuchungen, wenn jemand die Karte zu lange vor die Kamera hält. Üblich sind 30–60 Sekunden, 0 schaltet den Schutz ab.',
    topic: 'scannen',
  },
  resultDisplay: {
    text: 'Wie lange das Ergebnis (z. B. „Willkommen“) groß angezeigt wird – im Dashboard, im Kiosk-Scanner und auf dem Gästebildschirm. Ein neuer Scan ersetzt die Anzeige sofort.',
  },
  testMode: {
    text: 'Zeigt im Dashboard ein Feld, mit dem sich Scans ohne Kamera simulieren lassen – zum Ausprobieren und Schulen. Nur für den Admin sichtbar; im Protokoll steht dann „Test“.',
  },
  scanInput: {
    text: '„Nur USB-Scanner“ schaltet die Kamera ab – sinnvoll, wenn ein Scanner fest angeschlossen ist (keine Kamera-Freigabe nötig, weniger Akku). „Nur Kamera“ ignoriert Tastatureingaben, die wie ein Scan aussehen.',
    topic: 'usb-scanner',
  },
  scannerSpeed: {
    text: 'Ein USB-Scanner „tippt“ den Code viel schneller als ein Mensch – daran erkennt die App einen Scan. Bluetooth- oder gedrosselte Scanner sind langsamer: Werden Scans nicht erkannt, „Langsam“ wählen und im Testfeld prüfen.',
    topic: 'usb-scanner',
  },
  groupPrefix: {
    text: 'Steht vor der Kartennummer (z. B. B → B-001, B-002 …). Lässt sich später nicht mehr ändern, weil es auf den gedruckten Karten steht.',
    topic: 'gruppen',
  },
  groupAccess: {
    text: 'Ohne Häkchen werden alle Karten dieser Gruppe abgewiesen („Kein Zutritt“) – z. B. um eine Gruppe vorübergehend zu sperren. Einzelne Karten sperrt man in der Karte selbst.',
    topic: 'gruppen',
  },
  groupPrintHolder: {
    text: 'Mit Häkchen kommen Name, Dienstgrad und Foto auf die gedruckte Karte (persönlicher Ausweis). Ohne Häkchen steht nur Nummer und Gruppe darauf – richtig für Besucherkarten, die immer wieder an andere ausgegeben werden.',
    topic: 'karten-drucken',
  },
  groupUnassigned: {
    text: 'Mit Häkchen gilt eine Karte dieser Gruppe auch dann, wenn ihr keine Person zugeordnet ist – z. B. für Tageskarten ohne Namen. Ohne Häkchen wird abgewiesen („Karte ist keiner Person zugeordnet.“).',
    topic: 'gruppen',
  },
  operatorLogout: {
    text: 'Nach dieser Zeit ohne Bedienung wird der Bediener abgemeldet und muss die PIN neu eingeben. Am Empfang im Dauerbetrieb ruhig länger oder „nie“.',
    topic: 'anmelden',
  },
  confirmTimeout: {
    text: 'Wird eine Anfrage („Einlassen“/„Abweisen“) in dieser Zeit nicht beantwortet, verfällt sie: Es wird nichts gebucht und die Abweisung im Protokoll vermerkt. Die Person kann einfach noch einmal scannen.',
    topic: 'bestaetigen',
  },
  adminLogout: {
    text: 'Nach dieser Zeit ohne Bedienung wird der Admin abgemeldet. Der Scanner zeigt weiter Namen und Fotos – erst „Jetzt sperren“ oder ein Neustart der App sperrt die Daten.',
    topic: 'sicherheit',
  },
  retention: {
    text: 'Ältere Buchungen werden automatisch aus dem Protokoll gelöscht (Datenschutz). Karten, Personen und die aktuelle Anwesenheit bleiben erhalten. Wer die Daten länger braucht: vorher in der Auswertung per CSV-Export sichern.',
    topic: 'sicherheit',
  },
  cardAccess: {
    text: 'Ohne Häkchen wird diese Karte abgewiesen, auch wenn die Gruppe Zutritt hat. Außerhalb von „Gültig ab/bis“ wird ebenfalls abgewiesen. Ohne Datum gilt die Karte unbefristet.',
    topic: 'karten-erstellen',
  },
  printFlip: {
    text: 'Muss zur Einstellung im Druckdialog passen: „Lange Kante“ ist der übliche Standard (wie ein Buch umblättern). Stehen die Rückseiten auf dem Kopf oder versetzt, die andere Kante wählen. Tipp: erst die Probeseite drucken.',
    topic: 'karten-drucken',
  },
  occasionCards: {
    text: 'Standardmäßig kommt beim Einlass nur hinein, wer auf der Gästeliste steht (Einladung oder „Karte … gilt“). Mit Häkchen gelten zusätzlich alle Dienstausweise (Karten) – jeder nur einmal. Erfasst wird im Einlass-Protokoll der Veranstaltung, nicht in der normalen Anwesenheit.',
    topic: 'einlass',
  },
  occasionEntry: {
    text: 'Erscheint auf der Einladung (Platzhalter {einlass}). Gescannt werden kann auch davor und danach – der Einlass läuft, bis er beendet wird.',
    topic: 'einladungen',
  },
  autoBackupKeep: {
    text: 'So viele Sicherungsdateien bleiben im Ordner liegen; die ältesten werden automatisch gelöscht. Jede Datei enthält alle Daten – zum Wiederherstellen genügt die neueste.',
    topic: 'backup',
  },
} satisfies Record<string, Hint>;

export type HintId = keyof typeof HINTS;
