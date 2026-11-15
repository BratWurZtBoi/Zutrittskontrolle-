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
- Gespeichert werden `CardRecord`/`AccessEventRecord` (Personendaten verschlüsselt), die
  Oberfläche bekommt `Card`/`AccessEvent` (entschlüsselt, sofern entsperrt; `hasHolder` immer).

## Sicherheit (umgesetzt, Variante A)

- `src/security/crypto.ts`: zufälliger AES-256-GCM-Datenschlüssel, umhüllt mit PBKDF2-SHA-256
  (600 000 Runden) aus dem Admin-Passwort; Tresor liegt in `settings` unter `vault`.
- Verschlüsselt: `holderEnc` (CardHolder als JSON), `nameEnc` (Name), `holderNameEnc` im Protokoll.
  Beim Scan wird `nameEnc` unverändert ins Protokoll kopiert → funktioniert auch gesperrt.
- **Web Crypto nie innerhalb einer Dexie-Transaktion aufrufen** (Transaktion schließt sonst
  vorzeitig): erst lesen, dann (ent)schlüsseln, dann schreiben. In liveQuery-Abfragen alle
  DB-Zugriffe vor dem Entschlüsseln. Anzeige-Abfragen mit `useSecureLiveQuery` (lädt bei
  Sperren/Entsperren neu).
- `src/security/session.ts`: Zustand im Arbeitsspeicher (`setup`/`locked`/`unlocked`, `admin`).
  Neu laden = Neustart = gesperrt. Abmelden/Sperren über `requestExit()` + Navigation zu `/`.
- Alle Routen außer `/`, `/anmelden`, `/einrichtung` liegen hinter `RequireAdmin`.
- CSP-Meta-Tag wird nur im Build eingefügt (`vite.config.ts`); keine Inline-Skripte/-Styles
  im HTML verwenden (React-`style`-Props sind erlaubt).
- E2E: Testpasswort `Test-Passwort-123`; Navigation in Tests per Hash (`#/…`), nicht per Reload.

## Architektur

- `src/domain/` – reine Funktionen ohne DOM/DB (Zutrittsentscheidung `decideAccess`,
  QR-Format `ZK1:<Token>`, `ScanDeduper`, Farben). Neue Geschäftslogik zuerst hier + testen.
- `src/db/` – Dexie-Datenbank `zutrittskontrolle-daten`. Schemaänderungen nur über neue
  `this.version(n)` in `db.ts` (niemals bestehende Versionen ändern – sonst Datenverlust auf Geräten).
  Die alte Prototyp-DB `zutrittskontrolle` (nur Testdaten) wird beim Start gelöscht.
- `src/scanner/` – Kamera-Loop + jsQR im Web Worker. Scan-Verarbeitung (Doppelerkennung,
  Buchen, Ton) steckt in `hooks/useScanProcessor.ts` und wird von Kiosk-Scanner und Dashboard
  gemeinsam genutzt; Ergebnisanzeige in `components/ScanResult.tsx` (Vollbild bzw. Feld).
- Übersicht/Dashboard: reine Filter-/Sortierfunktionen in `domain/overview.ts`, Daten über
  `hooks/useOverviewData.ts` (Zeitraum per Index, Rest im Speicher). Entschlüsselte Namen
  werden pro Schlüssel zwischengespeichert (`security/decryptCache.ts`).
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
3. ✅ Sicherheit (Variante A): Admin-Passwort, Verschlüsselung, Entsperren beim Start,
   Auto-Abmeldung, Löschfrist, Testmodus nur Admin, CSP.
4. ✅ Übersicht (Tabs Anwesenheit/Aktionen) mit Suche/Filter/Sortierung, „Alle ausbuchen“,
   Dashboard (Kamera + Anwesende + Aktionen); Vollbild-Scanner bleibt als Kiosk-Modus.
5. Export/Import: verschlüsseltes Voll-Backup (eigenes Passwort), CSV-Export Historie/Karten.
