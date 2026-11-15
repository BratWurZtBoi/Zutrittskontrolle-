# Zutrittskontrolle

Offlinefähige Zutritts- und Anwesenheitskontrolle mit QR-Karten –
als **Web-App (PWA)** für Android-Smartphones, Tablets und Windows-Rechner mit Webcam.
Keine APK, keine Installation aus fremden Quellen, keine Cloud für Daten.

> **Testbetrieb:** Es werden ausschließlich fiktive Testdaten verwendet.

**App-Adresse:** https://adminzirkel.github.io/Zutrittskontrolle-/

## So funktioniert es

- Die App wird einmal über GitHub Pages geladen und danach **vollständig auf dem Gerät gespeichert**.
  Sie läuft anschließend auch ohne Internet (Flugmodus).
- **Alle Daten** (Karten, Personendaten, Fotos, Protokolle, Anwesenheit) liegen **nur lokal**
  im Browser-Speicher (IndexedDB) des jeweiligen Geräts. Nichts davon wird hochgeladen.
- Die QR-Erkennung läuft lokal auf dem Gerät (jsQR), es wird kein Bild übertragen.

### Sicherheit

- **Admin-Passwort:** Beim ersten Öffnen der Verwaltung wird ein Passwort festgelegt. Es schützt
  alles außer dem Scanner (Karten, Gruppen, Anwesenheit, Einstellungen).
- **Verschlüsselung:** Namen, Fotos und Notizen werden mit AES-256 verschlüsselt gespeichert.
  Der Schlüssel wird aus dem Passwort abgeleitet (PBKDF2, 600 000 Runden) und nie gespeichert.
- **Nach jedem App-Start** einmal mit dem Passwort entsperren. Gesperrt prüft der Scanner den
  Zutritt weiter, zeigt aber nur Kartennummer und Gruppe – die Buchungen werden trotzdem mit
  (verschlüsseltem) Namen protokolliert.
- **Abmelden** beendet die Verwaltung, der Scanner zeigt weiter Namen. **Jetzt sperren** blendet
  auch im Scanner Namen und Fotos aus. Automatische Abmeldung nach Inaktivität (Standard 15 Min.).
- **Bediener-PIN** (*Einstellungen → Bediener & Bestätigung*): eingeschränkter Zugang für den
  Empfang – nur Dashboard und Übersicht, Eintritte bestätigen, „Alle ausbuchen“. Karten, Gruppen,
  CSV-Export, Testmodus und Einstellungen bleiben dem Admin vorbehalten. Die PIN entschlüsselt
  nichts: Nach einem Neustart entsperrt der Admin die Daten einmal mit dem Passwort, danach kann
  sich der Bediener mit der PIN anmelden. Eigene automatische Abmeldung (Standard: nie).
- **Löschfrist:** Protokolleinträge werden automatisch gelöscht (Standard 90 Tage, einstellbar).
- **Testmodus** (Scans simulieren) ist standardmäßig aus und nur für angemeldete Admins sichtbar.
- **Content Security Policy:** Der Browser verhindert technisch, dass die App Daten an fremde
  Server sendet.
- ⚠️ **Passwort vergessen = verschlüsselte Daten verloren.** Bitte sicher notieren.

### Dashboard und Übersicht

- **Dashboard** (für den Windows-Rechner am Empfang, auch Tablet quer):
  - **Statusleiste** oben: Scan-Modus, Anwesende je Gruppe, Buchungen und Abweisungen von heute
    (antippen öffnet die passende Liste), Präsentation öffnen bzw. „Präsentation läuft“,
    Backup-Erinnerung.
  - **Links** eine kleine Kameravorschau (**Klein / Groß / Aus** – bei „Aus“ wird weiter
    gescannt), darunter das letzte Ergebnis mit Foto und die letzten Scans. Die Spalte bleibt
    beim Scrollen stehen.
  - **Rechts eine Liste mit Reitern:** *Anwesend*, *Aktionen heute*, *Abgewiesen* – eine Zeile pro
    Eintrag, Gruppenfarbe als Balken, Suche und Gruppen-Schaltflächen für alle Reiter,
    **Weitere Filter** (Zeitraum, Richtung, Ergebnis, auch Abwesende) bei Bedarf.
  - Nur die Seite scrollt, keine Scrollbereiche innerhalb der Kacheln. Auf dem Handy untereinander.
- **Übersicht → Anwesenheit:** alle Personen mit Status anwesend/abwesend und „seit wann“,
  Suche (Name, Firma, Karte), Filter nach Status und Gruppe, Sortierung per Spaltenkopf,
  **„Alle ausbuchen“** (z. B. am Tagesende).
- **Übersicht → Aktionen:** Zutrittsprotokoll mit Zeitraum (heute, gestern, 7/30 Tage, frei
  wählbar), Filter nach Ergebnis, Richtung und Gruppe, Suche und Sortierung.
- Der **Vollbild-Scanner** bleibt als Kiosk-Modus für Geräte am Eingang (ohne Anmeldung nutzbar).

### Am Empfang: manuell buchen, korrigieren, Besucher anmelden

- **Karte vergessen:** Im Dashboard den Namen suchen – die Suche zeigt auch Abwesende – und
  **Einbuchen** bzw. **Ausbuchen** klicken. Es gelten dieselben Regeln wie beim Scan (gesperrt,
  abgelaufen …). Im Protokoll steht „manuell“.
- **Fehlbuchung korrigieren:** **↺ Rückgängig** am letzten Ergebnis oder im Reiter *Aktionen*
  (je Karte die letzte Buchung). Es wird eine Gegenbuchung „Korrektur“ eingetragen, nichts gelöscht.
- **+ Besucher anmelden** (Statusleiste): freie Karte wählen – oder die ausgegebene Karte einfach
  vor die Kamera halten –, Name, Firma, Notiz und optional Foto eintragen, gültig „nur heute“,
  auf Wunsch gleich einbuchen. Vergebene Karten werden nie überschrieben.
- **Zurückgeben** (bei Besucherkarten in der Anwesenheitsliste): ausbuchen und Personendaten
  entfernen – die Karte ist wieder frei.
- **Notfallliste** (Statusleiste): alle Anwesenden nach Gruppen mit Kästchen zum Abhaken am
  Sammelplatz, zum Ausdrucken (optional mit Fotos). Auch für Bediener.

### Eintritt bestätigen (je Gruppe)

- *Einstellungen → Gruppen verwalten → Bearbeiten*: **„Eintritt muss bestätigt werden“**.
  Ohne Häkchen wird wie bisher automatisch eingelassen.
- Mit Häkchen erscheint beim Scan im Dashboard eine Anfrage mit großem Foto, Name, Firma und
  Notiz: **Einlassen** (Taste **Enter**) oder **Abweisen** (Taste **Esc**). Der Gast sieht auf dem
  Präsentationsbildschirm „Bitte kurz warten“. Gebucht wird erst nach der Bestätigung.
- Mehrere Anfragen werden der Reihe nach angezeigt. Unbeantwortete Anfragen verfallen nach
  90 Sekunden (einstellbar). Bestätigen, Abweisen und Verfallen stehen im Protokoll
  („bestätigt“, CSV-Spalte „Bestätigt von“).
- Am Kiosk-Scanner (ohne Bediener) werden solche Karten abgewiesen: „Bitte am Empfang melden“.
- Das Ausbuchen bleibt immer automatisch.

### Präsentationsansicht für Gäste (2. Bildschirm)

- Im *Dashboard* auf **„Präsentation öffnen“** klicken. Ist ein zweiter Bildschirm angeschlossen,
  öffnet sich das Fenster direkt dort (Chrome/Edge fragen beim ersten Mal nach der Erlaubnis zur
  **Fensterverwaltung** – erlauben). Sonst das Fenster auf den zweiten Bildschirm ziehen.
- Im Präsentationsfenster einmal **„Vollbild“** anklicken (oder **F11**).
- Das Dashboard zeigt **„Präsentation läuft“**, solange das Fenster geöffnet ist.
- Bei jedem Scan sieht der Gast groß „Willkommen“, „Auf Wiedersehen“ oder „Kein Zutritt“ mit Name,
  Foto und Gruppe; dazwischen einen Begrüßungsbildschirm mit Uhrzeit und Organisationsname.
- Funktioniert ohne Internet: Die Ergebnisse gehen direkt von Fenster zu Fenster im selben Browser.

### Gästebildschirm gestalten (Ruhebildschirm und Scan-Anzeige)

- *Einstellungen → Präsentation*. **Ruhebildschirm** (solange niemand scannt) und **Anzeige beim
  Scannen** werden getrennt gestaltet. Mitgeliefert ist jeweils „Standard“ – unverändert, als
  Vorlage zum Kopieren.
- **Ruhebildschirm:** beliebig viele Designs, eines ist **aktiv** (z. B. Alltag und Betriebsfest).
- **Scan-Anzeige:** zuweisbar an Gruppen (*Gruppen verwalten*) oder einzelne Karten (Kartenseite);
  es gilt Karte vor Gruppe vor Standard.
- **Elemente frei platzieren:** Textfeld, Foto, Gruppe, Uhrzeit, Datum, Logo hinzufügen und
  entfernen; in der Vorschau **anklicken und ziehen** (Maus oder Finger), Feinschritte mit den
  **Pfeiltasten** (Umschalt = größere Schritte) oder als Zahl. Je Element: Schriftgröße, Breite,
  Ausrichtung, fett, eigene Farbe; bei der Scan-Anzeige **„Anzeigen bei“** Eingang / Ausgang /
  Kein Zutritt / Bitte warten.
- **Vorlagen:** Zentriert, Foto links, Nur Text (Scan-Anzeige); Klassisch, Große Uhr, Nur Text
  (Ruhebildschirm).
- **Texte mit Platzhaltern:** `{titel}` und `{meldung}` (je Ergebnis einstellbar, z. B.
  „Willkommen“), `{vorname}`, `{nachname}`, `{name}`, `{firma}`, `{gruppe}`, `{uhrzeit}`,
  `{datum}`, `{organisation}`, `{grund}`. Datenschutz: Name voll, nur Vorname oder gar nicht.
- **Hintergrund:** einfarbig, Verlauf oder eigenes Bild (lokal, abdunkelbar); bei der Scan-Anzeige
  wahlweise Ergebnisfarbe (grün/blau/rot) oder eigener Hintergrund mit farbigem Streifen.
- Layouts sind im Backup enthalten. Layouts aus Version 0.7 werden automatisch übernommen
  (der bisherige Ruhebildschirm wird zu einem eigenen Design). Texte sind unverschlüsselt
  gespeichert – Namen daher nur über Platzhalter.

### Personenlisten importieren (CSV)

- *Karten* → **CSV-Import** → **Vorlage herunterladen** (liegt auch im Repository unter
  [`vorlagen/zutritt-import-vorlage.csv`](vorlagen/zutritt-import-vorlage.csv)).
- In Excel/LibreOffice ausfüllen, als CSV speichern, im Import wählen. Vor dem Import zeigt eine
  **Vorschau** jede Zeile mit Aktion (neue Karte / Zuweisung) oder Fehlergrund.
- Spalten: Kartennummer (optional: leer = neue Karte, vorhandene Nummer = Person dieser Karte
  zuweisen), Gruppe (Name oder Kürzel), Vorname, Nachname, Firma/Abteilung, Notiz,
  Zutritt erlaubt (ja/nein), Gültig ab, Gültig bis (TT.MM.JJJJ).
- Bestehende Personendaten werden nur überschrieben, wenn das ausdrücklich angehakt ist.

### Mehrfachauswahl

- *Karten* → **Auswählen** → Karten antippen oder „Alle angezeigten“ → **Personendaten entfernen**
  (z. B. alle Besucherkarten des Tages freigeben), **Sperren**, **Entsperren**, **Drucken**, **Löschen**.

### Einstellungen

- *Einstellungen* zeigt eine Übersicht mit allen Bereichen (Allgemein, Scanner, Gruppen,
  Präsentation, Sicherheit, Bediener & Bestätigung, Datensicherung, Daten, Gerät & App) und dem
  aktuellen Stand. Am Computer wechselt man über die Seitenleiste, am Handy über „← Einstellungen“.

### Hell und dunkel

- *Einstellungen → Darstellung*: Automatisch (wie das Gerät), Hell oder Dunkel – je Gerät.
  Gedruckte Karten bleiben immer hell.

### Datensicherung und Export

- **Backup erstellen** (*Einstellungen → Datensicherung*): eine Datei (`.zkb`) mit allen Karten,
  Personendaten, Fotos, Gruppen, dem Protokoll und den Einstellungen – verschlüsselt mit einem
  eigenen **Backup-Passwort** (AES-256). Sie landet im Download-Ordner und kann auch direkt
  geteilt werden (**Teilen …**, z. B. Quick Share zum Laptop). Beim Teilen heißt sie `….zkb.txt`,
  weil Chrome die Endung `.zkb` nicht teilen lässt – der Inhalt bleibt verschlüsselt, „Backup
  einspielen“ nimmt beide Varianten an.
- **Backup einspielen:** Datei wählen, Passwort eingeben, Vorschau prüfen, bestätigen. Die Daten
  auf dem Gerät werden **ersetzt**; das Admin-Passwort des Geräts bleibt. So lassen sich Daten
  z. B. vom Handy auf den Windows-Rechner übertragen.
- **Automatische Sicherung** (*Einstellungen → Datensicherung*, Chrome/Edge am Computer): Ordner
  wählen (z. B. USB-Stick oder Netzlaufwerk), eigenes Passwort, täglich bis stündlich; die letzten
  7/14/30 Sicherungen bleiben. Läuft, solange die App geöffnet und entsperrt ist. Fragt der
  Browser nach einem Neustart erneut nach dem Ordnerzugriff, zeigt das Dashboard
  „Auto-Backup: Problem“ – „Jetzt sichern“ erlaubt ihn wieder.
- **CSV-Export für Excel** (*Übersicht*): die gerade gefilterte und sortierte Liste der Anwesenheit
  bzw. der Aktionen. ⚠️ CSV-Dateien sind **nicht** verschlüsselt.
- Das Dashboard erinnert, wenn das letzte Backup länger als 7 Tage zurückliegt.

### Karten, Personen und Gruppen

- **Karten** werden eigenständig erstellt – einzeln oder in Serie (z. B. 20 Besucherkarten).
  Jede Karte hat eine Kartennummer (z. B. `B-001`), einen QR-Code und eine **Gruppe**.
- **Personendaten** (Name, Firma/Abteilung, Foto, Notiz) werden einer Karte zugewiesen und
  können jederzeit geändert oder entfernt werden. **„Karte zurückgeben“** bucht aus und entfernt
  die Personendaten – ideal für Besucherkarten.
- **Gruppen** (z. B. Bestandspersonal = blau, Besucher = orange) werden unter
  *Einstellungen → Gruppen verwalten* angelegt: Name, Farbe, Kürzel für die Kartennummern und
  Regeln (Zutritt für die Gruppe, Name/Foto auf die Karte drucken, Zutritt ohne zugeordnete Person).
- Die Gruppenfarbe erscheint auf der gedruckten Karte, in den Listen und im Scanner.

### Verlorene Karten

- Kartenseite → **„Als verloren melden“**: Die Karte ist sofort gesperrt (Status „Verloren“,
  Filter „Nur verlorene Karten“ in der Kartenliste).
- Wird sie gescannt, zeigt das Dashboard **„Verlorene Karte!“** mit Name und Datum der Meldung
  (gelb umrandet, eigener Warnton). Der Gast sieht nur neutral „Kein Zutritt – Bitte wenden Sie sich
  an den Empfang“, ohne Name oder Foto.
- **„Ersatzkarte ausstellen“**: neue Karte (nächste Nummer) mit Person, Berechtigung, Gültigkeit und
  Anwesenheit; danach direkt drucken. Die verlorene Karte bleibt gesperrt und verweist auf den Ersatz.
- Alternativ **„Neuer QR-Code“**: gleiche Kartennummer, neu drucken – der alte Code ist ungültig.
- **„Wiedergefunden – entsperren“** hebt die Meldung auf.

## Einmalige Einrichtung (im Browser auf github.com)

1. Repository öffentlich: *Settings* → *Danger Zone* → *Change visibility* → *Public*.
2. GitHub Pages: *Settings* → *Pages* → *Source*: **GitHub Actions**.
3. Jeder Merge nach `main` veröffentlicht die App automatisch (ca. 1–2 Minuten, Reiter *Actions*).

## App installieren

**Galaxy S24 Ultra / Android-Tablet (Chrome):** App-Adresse öffnen → Menü ⋮ →
*Zum Startbildschirm hinzufügen* → *Installieren*. Beim ersten Scannen die Kamera erlauben.

**Windows-Rechner mit Webcam (Edge oder Chrome):** App-Adresse öffnen → in der Adressleiste auf
das Installieren-Symbol klicken (oder Menü → *Apps* → *Diese Seite als App installieren*).
Bei mehreren Kameras (z. B. eingebaut + USB-Webcam) die gewünschte im Scanner oder unter
*Einstellungen → Kamera* auswählen.

**Updates:** App schließen und neu öffnen – neue Versionen werden automatisch geladen.

### Windows-Programm (ohne Browser)

Zusätzlich zur Web-App gibt es ein eigenständiges Windows-Programm (Electron) – gleiche Funktionen,
gleicher Programmcode.

- **Herunterladen:** auf GitHub im Repository unter **Releases** die Datei
  `Zutrittskontrolle-Setup-<Version>.exe` (wird bei jedem Merge nach `main` automatisch gebaut,
  je Version eine Ausgabe).
- **Installieren:** Datei starten. Windows meldet „Unbekannter Herausgeber“, weil das Programm
  (noch) nicht signiert ist → **Weitere Informationen** → **Trotzdem ausführen**. Danach gibt es
  einen Eintrag im Startmenü und auf dem Desktop.
- **Daten:** liegen im Programmordner `%APPDATA%\Zutrittskontrolle` – unabhängig vom Browser
  (Aufräumprogramme oder „Browserdaten löschen“ betreffen sie nicht). Sie bleiben bei Updates und
  beim Deinstallieren erhalten.
- **Umstieg von der Web-App:** in der Web-App ein Backup erstellen und im Programm einspielen.
- **Updates:** neue Installationsdatei herunterladen und über die bisherige Version installieren.
  Vorher zur Sicherheit ein Backup erstellen.
- **Unterschiede zur Web-App:** die Präsentation öffnet sich ohne Rückfrage im Vollbild auf dem
  zweiten Bildschirm; Kamera ohne Rückfrage; automatische Sicherung in einen Ordner ohne erneute
  Freigabe nach dem Neustart; *Einstellungen → Gerät & App*: „Beim Anmelden an Windows automatisch
  starten“; **F11** = Vollbild. Das Programm baut keine Verbindungen ins Internet auf.

## Erste Schritte zum Testen

1. *Verwaltung* → Admin-Passwort einrichten.
2. *Karten* → **Testkarten anlegen** (9 Personalkarten, 5 Besucherkarten – davon 3 frei;
   darunter eine gesperrte, eine abgelaufene und eine noch nicht gültige Karte).
3. *Einstellungen* → **Testmodus** einschalten → *Scanner* → Testmodus aufklappen → Karte wählen →
   **Karte scannen** simuliert einen Scan.
4. Freie Besucherkarte öffnen → **Person zuweisen** → **Nur heute** → Speichern → scannen →
   danach **Karte zurückgeben**.
5. Echter Kameratest: *Karten* → **Drucken** → als PDF speichern, auf einem zweiten Gerät öffnen
   und mit dem Gerät scannen, auf dem die Karten erstellt wurden.
6. *Dashboard* und *Übersicht* zeigen, wer eingebucht ist und welche Aktionen es gab.

## Wichtige Hinweise zum Speicher

- Die Daten hängen an **Browser + Adresse**. „Websitedaten löschen“ löscht sie.
- Jedes Gerät hat seinen eigenen Datenbestand. Übertragen und sichern per Backup-Datei.
- **Regelmäßig ein Backup erstellen** und die Datei auf einem anderen Gerät aufbewahren.

## Funktionsumfang

| Funktion | Stand |
| --- | --- |
| Karten einzeln oder in Serie erstellen, Personendaten flexibel zuweisen/ändern/entfernen | ✅ |
| Gruppen mit Farbe, Kürzel und Regeln (Einstellungsmenü), Auswahl per Dropdown | ✅ |
| Karten im Scheckkartenformat mit Gruppenfarbe drucken / als PDF (8 pro A4-Seite) | ✅ |
| Zutrittsberechtigung, Gültigkeit („Nur heute“), Karte sperren, neuer QR-Code | ✅ |
| Dauerhaft aktive Kamera, automatische QR-Erkennung, Kameraauswahl (Windows/USB-Webcam) | ✅ |
| Große Anzeige von Name, Foto, Gruppe und Entscheidung, Ton & Vibration | ✅ |
| Automatische Ein-/Ausbuchung, Doppelscan-Schutz, Protokoll, Anwesenheit | ✅ |
| Offline-Betrieb (PWA) auf Android und Windows | ✅ |
| Admin-Passwort, verschlüsselte Personendaten (AES-256), Entsperren beim Start | ✅ |
| Automatische Abmeldung, Löschfrist fürs Protokoll, Content Security Policy | ✅ |
| Übersicht mit Suche/Filter/Sortierung, Dashboard (Kamera + Anwesende + Aktionen) | ✅ |
| „Alle ausbuchen“ | ✅ |
| Verschlüsseltes Backup (Export/Import), CSV-Export für Excel | ✅ |
| CSV-Import von Personenlisten mit Vorlage und Vorschau | ✅ |
| Mehrfachauswahl: Personendaten entfernen, sperren, drucken, löschen | ✅ |
| Präsentationsansicht für Gäste auf zweitem Bildschirm | ✅ |
| Helles und dunkles Layout | ✅ |

## Technik

React 19 · TypeScript · Vite · vite-plugin-pwa (Workbox) · Dexie (IndexedDB) · jsQR · qrcode

```
src/
  domain/     Reine Logik: Zutrittsentscheidung, QR-Format, Doppelscan-Schutz, Farben,
              Filter/Sortierung für Übersicht und Dashboard (mit Tests)
  db/         Lokale Datenbank: Gruppen, Karten, Scans/Protokoll, Einstellungen, Testdaten (mit Tests)
  security/   Verschlüsselung (Web Crypto), Passwort-Tresor, Admin-Sitzung (mit Tests)
  scanner/    Kamera-Scanner und QR-Decoder (Web Worker)
  lib/        Kamera (inkl. Geräteauswahl), Fotos, QR-Erzeugung, Ton, Bildschirm-an
  components/ Wiederverwendbare Oberflächenbausteine
  pages/      Scanner, Dashboard, Übersicht, Präsentation, Anmeldung, Karten, Import, Druck,
              Gruppen, Einstellungen
vorlagen/     CSV-Vorlage für den Personenimport
```

**QR-Inhalt:** `ZK1:` + 26 Zeichen Zufallstoken (128 Bit). Der Code enthält keine
personenbezogenen Daten. „Neuer QR-Code“ erzeugt ein neues Token, der alte Code wird ungültig.

## Entwicklung (über Claude Code)

```bash
npm install
npm run dev         # Entwicklungsserver
npm run check       # Typprüfung + Unit-Tests + Build (vor jedem Commit)
npm run e2e:local   # End-to-End-Test mit simulierter Kamera (Cloud-Umgebung)
npm run icons       # App-Icons aus public/favicon.svg neu erzeugen
```

GitHub Actions prüft jeden Push; Merges nach `main` werden veröffentlicht.
