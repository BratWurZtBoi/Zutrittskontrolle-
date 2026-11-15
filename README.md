# Zutrittskontrolle

Offlinefähige Zutritts- und Anwesenheitskontrolle für bis zu 100 Personen –
als **Web-App (PWA)** für Android-Smartphones, Tablets und Windows-Laptops mit Webcam.
Keine APK, keine Installation aus fremden Quellen, keine Cloud für Daten.

> **Testbetrieb:** Es werden ausschließlich fiktive Testpersonen verwendet.

## So funktioniert es

- Die App wird einmal über GitHub Pages geladen und danach **vollständig auf dem Gerät gespeichert**.
  Sie läuft anschließend auch ohne Internet (Flugmodus).
- **Alle Daten** (Personen, Fotos, Protokolle, Anwesenheit) liegen **nur lokal** im Browser-Speicher
  (IndexedDB) des jeweiligen Geräts. Nichts davon wird hochgeladen.
- Die QR-Erkennung läuft lokal auf dem Gerät (jsQR), es wird kein Bild übertragen.

**App-Adresse:** https://bratwurztboi.github.io/Zutrittskontrolle-/

## Einmalige Einrichtung (im Handy-Browser auf github.com)

1. **Repository öffentlich machen:** Repository → *Settings* → ganz unten *Danger Zone* →
   *Change visibility* → *Public*. (Im Code stehen nur fiktive Testdaten.)
2. **GitHub Pages aktivieren:** *Settings* → *Pages* → *Build and deployment* → *Source*:
   **GitHub Actions** auswählen.
3. Sobald Änderungen auf `main` landen, veröffentlicht GitHub Actions die App automatisch
   (ca. 1–2 Minuten, Fortschritt unter dem Reiter *Actions*).

## App installieren

**Galaxy S24 Ultra / Android-Tablet (Chrome):** App-Adresse öffnen → Menü ⋮ →
*Zum Startbildschirm hinzufügen* → *Installieren*. Beim ersten Scannen die Kamera erlauben.

**Windows-Laptop (Edge oder Chrome):** App-Adresse öffnen → in der Adressleiste auf das
Installieren-Symbol klicken (oder Menü → *Apps* → *Diese Seite als App installieren*).

**Updates:** App schließen und neu öffnen – neue Versionen werden automatisch geladen.
Die installierte Version steht unter *Einstellungen → Gerät & App*.

## Erste Schritte zum Testen

1. *Personen* → **Testpersonen anlegen** (12 fiktive Personen mit Platzhalter-Fotos,
   darunter ein gesperrter Ausweis, eine abgelaufene und eine noch nicht gültige Berechtigung).
2. *Scanner* → Testmodus aufklappen → Person wählen → **Ausweis scannen** simuliert einen Scan.
3. Echter Kameratest: *Personen* → **Ausweise drucken** auf dem Laptop öffnen (oder als PDF
   speichern) und die QR-Codes mit dem Handy scannen.
4. *Anwesenheit* zeigt, wer eingebucht ist, und die Zutrittshistorie.

## Wichtige Hinweise zum Speicher

- Die Daten hängen an **Browser + Adresse**. „Websitedaten löschen“ in Chrome löscht sie.
- Die App bittet beim Start um *dauerhaften Speicher* (Status unter *Einstellungen*).
- Jedes Gerät hat seinen eigenen Datenbestand. Verschlüsselte Backups/Übertragung folgen.

## Funktionsumfang

| Funktion | Stand |
| --- | --- |
| Personenverwaltung (Name, ID, Foto per Kamera oder Datei) | ✅ |
| QR-Ausweise im Scheckkartenformat erstellen und drucken / als PDF | ✅ |
| Zutrittsberechtigung, Gültigkeitszeitraum, Ausweis sperren / neu ausstellen | ✅ |
| Dauerhaft aktive Kamera mit automatischer QR-Erkennung | ✅ |
| Große Anzeige von Name, Foto und Entscheidung, Ton & Vibration | ✅ |
| Automatische Ein-/Ausbuchung (Auto, nur Eingang, nur Ausgang) | ✅ |
| Anwesenheitsübersicht und Zutrittshistorie | ✅ |
| Doppelscan-Schutz (einstellbar, Standard 30 s) | ✅ |
| Offline-Betrieb (PWA) | ✅ |
| Geschützter Administrationsbereich (PIN) | ⏳ nächster Schritt |
| Verschlüsselte Backups (Export/Import) | ⏳ geplant |
| Historie filtern/exportieren (CSV), „Alle ausbuchen“ | ⏳ geplant |

## Technik

React 19 · TypeScript · Vite · vite-plugin-pwa (Workbox) · Dexie (IndexedDB) · jsQR · qrcode

```
src/
  domain/     Reine Logik: Zutrittsentscheidung, QR-Format, Doppelscan-Schutz (mit Tests)
  db/         Lokale Datenbank: Personen, Scans/Protokoll, Einstellungen, Testdaten (mit Tests)
  scanner/    Kamera-Scanner und QR-Decoder (Web Worker)
  lib/        Kamera, Fotos, QR-Erzeugung, Ton, Bildschirm-an
  components/ Wiederverwendbare Oberflächenbausteine
  pages/      Scanner, Personen, Ausweise, Anwesenheit, Einstellungen
```

**QR-Inhalt:** `ZK1:` + 26 Zeichen Zufallstoken (128 Bit). Der Code enthält keine
personenbezogenen Daten. „Neuen Ausweis ausstellen“ erzeugt ein neues Token, der alte
Code wird ungültig.

## Entwicklung (über Claude Code)

```bash
npm install
npm run dev         # Entwicklungsserver
npm run check       # Typprüfung + Unit-Tests + Build (vor jedem Commit)
npm run e2e:local   # End-to-End-Test mit simulierter Kamera (Cloud-Umgebung)
npm run icons       # App-Icons aus public/favicon.svg neu erzeugen
```

GitHub Actions prüft jeden Push; Pushes auf `main` werden veröffentlicht.
