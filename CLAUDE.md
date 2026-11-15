# CLAUDE.md – Projektleitfaden

Offlinefähige Zutritts- und Anwesenheitskontrolle mit QR-Karten als PWA.
Der Nutzer entwickelt **ausschließlich über Claude Code auf dem Smartphone** – es gibt keinen
Entwicklungs-PC. Er testet über die veröffentlichte App (GitHub Pages) auf einem Galaxy S24 Ultra,
Android-Tablets und einem Windows-Rechner mit Webcam.

## Grundregeln

- **Nur fiktive Testdaten** verwenden (siehe `src/db/seed.ts`). Keine echten Namen/Fotos.
- **Keine Cloud-Abhängigkeit** für Daten: alles bleibt in IndexedDB auf dem Gerät.
  Keine externen Requests zur Laufzeit (keine CDNs, Fonts, Analytics).
- **Kein APK/Capacitor** – bewusst entschieden: reine PWA.
- Kleine, testbare Schritte. Vor jedem Commit: `npm run check`.
  Bei UI-Änderungen zusätzlich `npm run build && npm run e2e:local` (simulierte Kamera).
- Oberfläche und Doku auf **Deutsch**, Bezeichner im Code auf Englisch.
- Mobile-first (Touch-Ziele ≥ 44 px), muss auch auf Tablet und Laptop gut aussehen.

## Datenmodell

- **Gruppe** (`Group`): Name, Farbe, Kürzel (fest nach Anlage), Regeln `accessGranted`,
  `allowUnassigned`, `printHolder`. Standardgruppen: Bestandspersonal (M), Besucher (B).
- **Karte** (`Card`): Nummer (`B-001`), Gruppe (fest), QR-Token, gesperrt, Berechtigung,
  Gültigkeit, optional **Inhaber** (`CardHolder`: Name, Firma, Foto, Notiz) – frei änderbar.
  Personenwechsel/Rückgabe bucht die bisherige Person automatisch aus (Quelle `system`).
- **Ereignis** (`AccessEvent`): enthält Momentaufnahmen (Kartennummer, Gruppe, Name), damit
  die Historie nach Änderungen lesbar bleibt. **Anwesenheit** je Karte.

## Architektur

- `src/domain/` – reine Funktionen ohne DOM/DB (Zutrittsentscheidung `decideAccess`,
  QR-Format `ZK1:<Token>`, `ScanDeduper`, Farben). Neue Geschäftslogik zuerst hier + testen.
- `src/db/` – Dexie-Datenbank `zutrittskontrolle-daten`. Schemaänderungen nur über neue
  `this.version(n)` in `db.ts` (niemals bestehende Versionen ändern – sonst Datenverlust auf Geräten).
  Die alte Prototyp-DB `zutrittskontrolle` (nur Testdaten) wird beim Start gelöscht.
- `src/scanner/` – Kamera-Loop + jsQR im Web Worker.
- Routing per `HashRouter` (läuft ohne Server-Konfiguration auf GitHub Pages und offline).
- Vite `base: './'` – relative Pfade, nicht ändern.

## Veröffentlichung

- **Arbeitsablauf (vom Nutzer so gewünscht):** auf dem Arbeitsbranch entwickeln, nach jedem
  abgeschlossenen, geprüften Schritt einen **Pull Request nach `main` erstellen**.
  **Nicht selbst mergen** – der Nutzer übernimmt den PR selbst in der GitHub-App
  (Merge-Commit empfehlen, kein Squash, damit der Branch weiter nutzbar bleibt).
  Nicht direkt auf `main` pushen.
- `.github/workflows/deploy.yml`: jeder Push → Typen, Tests, Build. Push auf `main` → GitHub Pages.
- App-Adresse: https://adminzirkel.github.io/Zutrittskontrolle-/ – Adresse nicht mehr ändern,
  da die lokalen Daten an die Herkunft (Origin) gebunden sind.

## Roadmap (mit dem Nutzer abgestimmt)

1. ✅ Prototyp: Ausweise, Scanner, Protokoll, Anwesenheit
2. ✅ Karten statt Personen, Gruppen mit Farbe/Kürzel/Regeln, Kameraauswahl (Windows)
3. Sicherheit – **Variante A** (vom Nutzer gewählt): Admin-Passwort schützt alles außer dem
   Scanner; Personendaten (Inhaber, Namen im Protokoll) AES-GCM-verschlüsselt mit Datenschlüssel,
   der mit PBKDF2-Schlüssel aus dem Passwort umhüllt wird; nach jedem App-Start einmal entsperren,
   gesperrt entscheidet der Scanner weiter, zeigt aber nur Kartennummer + Gruppe. Dazu: Testmodus
   nur für Admin (Standard aus), CSP-Meta-Tag, Löschfrist fürs Protokoll.
4. Übersicht mit Suche/Filter/Sortierung (Karten + Aktionen) und Dashboard
   (Kamera + Anwesende + Aktionen); Vollbild-Scanner bleibt als Kiosk-Modus.
5. Export/Import: verschlüsseltes Voll-Backup (eigenes Passwort), CSV-Export Historie/Karten.
