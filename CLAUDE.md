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
  Verlust: `lostAt` (+ `blocked`), Grund `CARD_LOST` geht vor `CARD_BLOCKED`; Ersatzkarte
  (`issueReplacementCard`) übernimmt verschlüsselte Personendaten + Anwesenheit, Verweis
  `replacedBy`/`replaces`. Gäste (Kiosk, Präsentation: `Audience 'guest'`) sehen bei verlorenen
  Karten weder Grund noch Person.
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
- `src/security/session.ts`: Zustand im Arbeitsspeicher (`setup`/`locked`/`unlocked`, `admin`,
  `operator`). Neu laden = Neustart = gesperrt. Abmelden/Sperren über `requestExit()` + Navigation zu `/`.
- **Bediener-PIN** (`loginOperator`): nur Prüfwert (PBKDF2) unter `settings.operatorPin`, entschlüsselt
  nichts – nur möglich, solange der Datenschlüssel geladen ist. `DEVICE_SECRET_KEYS` (Tresor + PIN)
  bleiben bei „Alle Daten löschen“ und Backup-Wiederherstellung erhalten.
- Routen: `RequireRole allow="staff"` (Admin oder Bediener) für `/dashboard`, `/uebersicht`
  (Liste in `lib/roles.ts`), alles andere `allow="admin"`. Frei: `/`, `/anmelden`, `/einrichtung`, `/praesentation`.
- **Bestätigung je Gruppe** (`Group.requireConfirmation`): `decideAccess` liefert `pending`
  (Dashboard, `confirmation: 'operator'`) bzw. `denied/CONFIRMATION_REQUIRED` (Kiosk). Wartende Scans
  werden nicht gebucht; `resolvePendingScan` (accept prüft erneut / reject / timeout) schreibt das
  Ereignis mit `confirmedBy`. Warteschlange im Speicher in `useScanProcessor({ confirm: true })`.
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
  `hooks/useOverviewData.ts` (Zeitraum per Index, Rest im Speicher). Dashboard-Kennzahlen ohne
  Entschlüsseln in `hooks/useDashboardData.ts`. Dashboard-Layout: Statusleiste, linke Spalte
  sticky, rechts **eine** Liste mit Reitern – keine Scrollbereiche in Kacheln (E2E prüft das).
  Kameravorschau „Aus“ deckt das Video nur ab (Video muss sichtbar bleiben, sonst pausiert es).
  Präsentation: Herzschlag per BroadcastChannel (`announcePresentation`/`watchPresentation`),
  Öffnen auf dem zweiten Bildschirm über `getScreenDetails()` (Fensterverwaltung). Entschlüsselte Namen
  werden pro Schlüssel zwischengespeichert (`security/decryptCache.ts`).
- Präsentationslayouts: reine Logik in `domain/presentationLayout.ts` (`pickLayout` Karte > Gruppe >
  Standard, `fillPlaceholders`, `buildLayoutResult`), Tabelle `layouts` (DB-Version 2), Standardlayout
  `STANDARD_LAYOUT` nur im Code (nicht gespeichert, nicht änderbar). Platzhalter werden im
  Scanner-Fenster gefüllt (`toPresentationScan`); das Präsentationsfenster liest nur Layouts/Einstellungen.
  `PresentationView` nutzt Container-Einheiten (cqw/cqh) – gleiche Darstellung im Vollbild und in der Vorschau.
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
5. ✅ Export/Import: verschlüsseltes Voll-Backup (`db/backup.ts`, Format `zutrittskontrolle-backup`
   v1: JSON-Hülle mit PBKDF2-Salt/IV, Inhalt gzip + AES-GCM; Einspielen ersetzt alle Daten und
   verschlüsselt mit dem Geräteschlüssel neu, Tresor bleibt), CSV-Export (`domain/csv.ts`:
   Semikolon, BOM, Formel-Injektion entschärft).

6. ✅ Mehrfachauswahl (Karten: Personendaten entfernen, sperren, drucken, löschen),
   CSV-Import (`domain/csvImport.ts` Parser inkl. Windows-1252, `db/importCards.ts` Plan +
   Ausführung, Vorlage in `vorlagen/` – muss mit `importTemplateCsv()` übereinstimmen, Test prüft das),
   Präsentationsansicht `#/praesentation` (BroadcastChannel `lib/presentation.ts`, ohne
   Datenbankzugriff auf Personendaten), helles/dunkles Layout (CSS-Variablen in `styles.css`,
   `data-theme` auf `<html>`, Spiegelung in localStorage `zk-theme`; Karten/Druck immer hell).
   Automatische Buchungen (`bySystem`) zählen nicht für den Doppelscan-Schutz.

7. ✅ Dashboard neu (Statusleiste, kleine Kamera, Liste mit Reitern), Eintritt bestätigen je Gruppe,
   Bediener-PIN, verlorene Karten (Ersatzkarte), Präsentationslayouts (Aufbau, Texte, Hintergrund),
   manuell buchen (`bookManually`, Quelle `manual`), Korrektur (`undoBooking`: Gegenbuchung
   `CORRECTION`, nur letzte Buchung je Karte), Besucher-Schnellerfassung (`assignHolderToFreeCard`
   prüft „noch frei“ in der Transaktion; Kamera-Scans gehen bei offenem Fenster an den Dialog),
   Notfallliste `#/notfallliste`, automatische Sicherung in einen Ordner (`db/autoBackup.ts`,
   File System Access API, Passwort mit Datenschlüssel verschlüsselt, Ordner-Zugriff separat gespeichert).

Farben in `styles.css` nur über Variablen (`--surface`, `--text`, `--danger-fg` …), damit beide
Layouts funktionieren. Dunkle Bereiche (Scanner, Navigation, Präsentation) sind bewusst fest dunkel.

Mögliche nächste Schritte (mit dem Nutzer abstimmen): Quick-Share-Fix (Teilen der Backup-Datei als
`.txt`, Chrome erlaubt `.zkb` nicht – vom Nutzer zurückgestellt), Fremdkarten (QR/Strichcode einlernen,
zurückgestellt), Musik/Animationen in Layouts (zurückgestellt), USB-Handscanner, Test auf echten
Geräten und Feinschliff, Backup zusammenführen statt ersetzen, Logo auf der Karte.
