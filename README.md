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

## Erste Schritte zum Testen

1. *Karten* → **Testkarten anlegen** (9 Personalkarten, 5 Besucherkarten – davon 3 frei;
   darunter eine gesperrte, eine abgelaufene und eine noch nicht gültige Karte).
2. *Scanner* → Testmodus aufklappen → Karte wählen → **Karte scannen** simuliert einen Scan.
3. Freie Besucherkarte öffnen → **Person zuweisen** → **Nur heute** → Speichern → scannen →
   danach **Karte zurückgeben**.
4. Echter Kameratest: *Karten* → **Drucken** → als PDF speichern, auf einem zweiten Gerät öffnen
   und mit dem Gerät scannen, auf dem die Karten erstellt wurden.
5. *Anwesenheit* zeigt, wer eingebucht ist, und die Zutrittshistorie.

## Wichtige Hinweise zum Speicher

- Die Daten hängen an **Browser + Adresse**. „Websitedaten löschen“ löscht sie.
- Jedes Gerät hat seinen eigenen Datenbestand. Export/Import folgt.

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
| Admin-Passwort, verschlüsselte Personendaten, Sperrbildschirm | ⏳ Schritt 3 |
| Übersicht mit Suche/Filter/Sortierung, Dashboard (Kamera + Anwesende + Aktionen) | ⏳ Schritt 4 |
| Export/Import (verschlüsseltes Backup, CSV) | ⏳ Schritt 5 |

## Technik

React 19 · TypeScript · Vite · vite-plugin-pwa (Workbox) · Dexie (IndexedDB) · jsQR · qrcode

```
src/
  domain/     Reine Logik: Zutrittsentscheidung, QR-Format, Doppelscan-Schutz, Farben (mit Tests)
  db/         Lokale Datenbank: Gruppen, Karten, Scans/Protokoll, Einstellungen, Testdaten (mit Tests)
  scanner/    Kamera-Scanner und QR-Decoder (Web Worker)
  lib/        Kamera (inkl. Geräteauswahl), Fotos, QR-Erzeugung, Ton, Bildschirm-an
  components/ Wiederverwendbare Oberflächenbausteine
  pages/      Scanner, Karten, Druck, Gruppen, Anwesenheit, Einstellungen
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
