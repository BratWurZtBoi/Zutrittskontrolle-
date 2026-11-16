# CLAUDE.md – Projektleitfaden

Offlinefähige Zutritts- und Anwesenheitskontrolle mit QR-Karten als PWA.
Der Nutzer entwickelt **ausschließlich über Claude Code auf dem Smartphone** – es gibt keinen
Entwicklungs-PC. Er testet über die veröffentlichte App (GitHub Pages) auf einem Galaxy S24 Ultra,
Android-Tablets und einem Windows-Rechner mit Webcam. Betrieb immer mit **zwei Bildschirmen**
(Bedienung + Gästebildschirm); geplant: USB-QR-Scanner, ggf. günstige Linux-Hardware (Raspberry Pi).

## Grundregeln

- **Nur fiktive Testdaten** verwenden (siehe `src/db/seed.ts`). Keine echten Namen/Fotos.
- **Keine Cloud-Abhängigkeit** für Daten: alles bleibt in IndexedDB auf dem Gerät.
  Keine externen Requests zur Laufzeit (keine CDNs, Fonts, Analytics).
- **Kein APK/Capacitor** für Android – bewusst entschieden: dort reine PWA.
  **Windows/Linux:** zusätzlich ein Electron-Programm aus demselben Code (vom Nutzer gewünscht,
  Windows ab 0.9, Linux-.deb für amd64 + arm64/Raspberry Pi ab 0.11).
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
- **Nicht zugeordnet** (`UnassignedRecord`, Tabelle `unassigned`, DB-Version 4): Personen aus dem
  CSV-Import ohne bzw. mit unbekannter Gruppe (`groupHint`), noch ohne Karte; `holderEnc` +
  Zutritt/Gültigkeit. `db/unassigned.ts`: `assignUnassigned` nimmt zuerst freie Karten der Gruppe
  (`listFreeCards`), sonst neue, und zieht `holderEnc` je Person in einer Transaktion auf die Karte um.
  Import-Plan `kind: 'unassigned'` (nur Zeilen ohne Kartennummer; Doppelte per Name+Firma abgelehnt).
  Reiter auf `#/karten?ansicht=nicht-zugeordnet`. Im Backup (`unassigned`), bei „Alle Daten löschen“ weg.
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
- **USB-Scanner (Tastatur-Modus/HID):** Erkennung rein in `domain/keyboardScan.ts`
  (`KeyboardScanDetector`: Tempo ≤ 40 ms bzw. 110 ms „langsam“, ≥ 6 Zeichen, Enter/Tab; vollständige
  Karten-Codes sofort; `scannedCardPayload` korrigiert Feststelltaste und US/DE-Layout am Präfix
  `YK1Ö`/`YK1>`). `hooks/useKeyboardScanner.ts`: `keydown` im Capture-Modus, verschluckt das Enter
  (sonst „Einlassen“!), setzt fokussierte Felder zurück; `useScannerInput` (Dashboard/Kiosk) +
  `useScanForwarding` (Präsentationsfenster reicht Scans per BroadcastChannel `lib/scanForward.ts`
  weiter und meldet seinen Fokus). Einstellungen `scanInput` (`both`/`camera`/`scanner`) und
  `scannerSpeed` je Gerät (nicht im Backup); Quelle `scanner`. Kamera startet erst nach Laden der
  Einstellungen (`useLoadedSettings`), der Scanner sofort. E2E simuliert per `keyboard.type(delay 4)`.
- Übersicht/Dashboard: reine Filter-/Sortierfunktionen in `domain/overview.ts`, Daten über
  `hooks/useOverviewData.ts` (Zeitraum per Index, Rest im Speicher). Dashboard-Kennzahlen ohne
  Entschlüsseln in `hooks/useDashboardData.ts`. Dashboard-Layout: Statusleiste, linke Spalte
  sticky, rechts **eine** Liste mit Reitern – keine Scrollbereiche in Kacheln (E2E prüft das).
  Kameravorschau „Aus“ deckt das Video nur ab (Video muss sichtbar bleiben, sonst pausiert es).
  Präsentation: Herzschlag per BroadcastChannel (`announcePresentation`/`watchPresentation`),
  Öffnen auf dem zweiten Bildschirm über `getScreenDetails()` (Fensterverwaltung). Entschlüsselte Namen
  werden pro Schlüssel zwischengespeichert (`security/decryptCache.ts`).
- Gästebildschirm: Layouts in `domain/presentationLayout.ts` mit `kind` **`idle`** (Ruhebildschirm,
  aktiv: `settings.idleLayoutId`) bzw. **`result`** (Scan-Anzeige, `pickLayout` Karte > Gruppe >
  `defaultLayoutId`). Inhalt = positionierte `elements` (x/y/w in %, `size` in % der Höhe,
  `showOn` je Ergebnis); `{titel}`/`{meldung}` kommen aus `texts` je Ergebnis. Mitgelieferte
  `STANDARD_IDLE`/`STANDARD_LAYOUT` nur im Code. Platzhalter werden im Scanner-Fenster gefüllt
  (`buildLayoutResult` → nur Texte/Foto/Gruppe sichtbarer Elemente); das Präsentationsfenster liest
  nur Layouts/Einstellungen. `PresentationView` (cqh-Einheiten) dient auch als Editor-Vorschau mit
  Ziehen/Pfeiltasten. Layouts der Version 0.7 (ohne `elements`) wandelt `normalizeLayout` bzw.
  einmalig `upgradeLegacyLayouts` (App-Start) um.
- **Kartenlayouts** (gedruckte Karten): `domain/cardLayout.ts` (Elemente text/qr/photo/logo/band in %
  der Karte, Schrift in % der Kartenhöhe, `showWhen` mit/ohne Person, `hideIfEmpty`, Farben
  `group`/`on-group`/#hex, QR mindestens `MIN_QR_MM`), Tabelle `cardLayouts` (DB-Version 3),
  `STANDARD_CARD_LAYOUT` nur im Code; Zuordnung `Group.cardLayoutId` > `settings.defaultCardLayoutId`.
  Formate `format` id1/a7/a6/custom (+`customSize`), Größe immer über `cardSize(layout)` (nie fest
  85,6 × 54 annehmen); Rückseite optional `back: CardSide` (Vorderseite = `background`/`elements`,
  Zugriff über `sideOf`/`withSide`). Editor `pages/CardLayoutEditor.tsx`: Reiter Hinzufügen
  (`CARD_PRESETS`)/Bearbeiten/Design/Allgemein (Gruppen per `setCardLayoutGroups` beim Speichern),
  Rückgängig über `hooks/useHistory.ts` (Schlüssel fassen Ziehen/Tippen zusammen, `checkpoint` je
  Zieh-Vorgang), Anfasser `resizeCardElement`, Einrasten `snapCardElement`, Warnung bei
  ungespeicherten Änderungen `lib/unsavedChanges.ts` (Links + beforeunload; HashRouter hat keinen
  Blocker). Personendaten nur bei `group.printHolder` (`cardDataFor` in `PrintPage`). Druck:
  Seitenaufteilung rein in `domain/printLayout.ts` (A4 mit 8 mm Rand/4 mm Abstand, beste
  Ausrichtung, Duplex gespiegelt je Wendekante, Falten, Kartendrucker abwechselnd), Seiten in mm
  absolut positioniert (`@page a4-hoch/a4-quer`), Kartengrößen-Seiten per CSSOM (`lib/printPages.ts`,
  CSP-verträglich). Einstellungen `cardPrintBack/Flip/CutMarks` je Gerät.
  Ziehen/Anfasser/Pfeiltasten in beiden Editoren über `hooks/useElementDrag.ts`.
- Einstellungen: Übersicht `#/einstellungen` (Kacheln in Gruppen `SETTINGS_GROUPS`) + je Bereich eine
  Seite unter `pages/settings/` mit `SettingsShell` (Seitenleiste ab 1000 px, gruppiert, sonst
  „← Einstellungen“). Neue Bereiche in `SETTINGS_SECTIONS` (mit `group`) eintragen; keine langen
  Sammelseiten mehr. Gemeinsame Editor-Bausteine: `components/Segmented`, `hooks/useEditorShortcuts`
  (Tasten + `useUnsavedGuard`).
- **Programm für Windows/Linux** (`desktop/`): `main.cjs` lädt `dist/` über das eigene Protokoll
  `app://zutrittskontrolle` (feste Herkunft → IndexedDB, Web Crypto, Kamera, BroadcastChannel wie im
  Browser), sperrt alle Verbindungen außer eigenen Dateien, erlaubt Kamera ohne Rückfrage, öffnet die
  Präsentation selbst auf dem zweiten Bildschirm (danach Fokus zurück ins Hauptfenster – wegen
  USB-Scanner). Linux: X11-Modus (`--ozone-platform=x11` im Startmenü-Eintrag, sonst einmaliger
  Neustart, weil Wayland keine Fensterplatzierung erlaubt), Autostart über `~/.config/autostart`
  (`ZK_AUTOSTART_DIR` für Tests). `preload.cjs` stellt `window.zkDesktop` bereit
  (`lib/desktop.ts`: Präsentation, Sicherungsordner – Schreiben nur in den im Dialog gewählten
  Ordner und nur Backup-Dateinamen –, Autostart, Info). Im Browser ist `getDesktop()` null.
  Kein Service Worker im Programm. Test: `npm run build && xvfb-run -a npm run desktop:smoke`
  (gepackt: `ZK_DESKTOP_EXE=…`, z. B. installiertes .deb `/opt/Zutrittskontrolle/zutrittskontrolle`).
  `.github/workflows/desktop.yml`: Windows-Installationsdatei auf `windows-latest`
  (`npm run desktop:build`, unsigniert), Linux-.deb amd64 + arm64 auf `ubuntu-latest`
  (`npm run desktop:build:linux`, Paket wird installiert und mit dem Smoke-Test geprüft), Job
  `release` legt beides unter Releases `v<Version>` ab → bei neuen Funktionen die Version in
  `package.json` erhöhen. Lokal unter Linux scheitert nur der letzte NSIS-Schritt (braucht wine);
  .deb lässt sich lokal bauen und mit `apt-get install ./release/…amd64.deb` installieren.
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
8. ✅ Einstellungen als Übersicht mit Unterseiten; Ruhebildschirm getrennt von der Scan-Anzeige,
   Elemente frei hinzufügen/verschieben/entfernen (Version 0.8).
9. ✅ Windows-Programm (Electron) zusätzlich zur Web-App, Installationsdatei über GitHub Releases,
   Updates durch Drüberinstallieren, ohne Signatur (Version 0.9).
10. ✅ Kartenlayout frei gestaltbar (Quer/Hoch, Elemente, Zuweisung je Gruppe), Druck auf A4-Bogen
    oder Kartendrucker (Version 0.10).
11. ✅ USB-Scanner (Tastatur-Modus) mit Scanner-Test und Weiterleitung vom Gästebildschirm,
    Linux-Programm (.deb für PC und Raspberry Pi) (Version 0.11).
12. ✅ CSV-Import: Zeilen ohne/mit unbekannter Gruppe → Reiter „Nicht zugeordnet“, dort Gruppe
    zuordnen (freie Karte zuerst, sonst neue) oder löschen (Version 0.12).
13. ✅ Karteneditor neu (Reiter, Bausteine, Rückgängig, Anfasser, Hilfslinien), Formate A7/A6/eigene
    Größe, Rückseite, Druck beidseitig/zum Falten/Kartendrucker mit Schnittmarken (Version 0.13).
14. ✅ Gästebildschirm-Editor im selben Stil (`pages/PresentationLayoutEditor.tsx`, `SCREEN_PRESETS`,
    `resizeElement`/`snapElement`, Reiter „Texte“), Karten-Bereich mit Reitern (`components/CardsNav`),
    Druck-Probeseite (`PrintTestSheets`), „gedruckt“-Markierung (`CardRecord.printedAt`, Rückfrage nach
    dem Drucken, neuer QR-Code setzt zurück), Einstellungen in Gruppen (`SETTINGS_GROUPS`) (Version 0.14).

Farben in `styles.css` nur über Variablen (`--surface`, `--text`, `--danger-fg` …), damit beide
Layouts funktionieren. Dunkle Bereiche (Scanner, Navigation, Präsentation) sind bewusst fest dunkel.

Teilen (`lib/download.ts`): Chrome teilt nur bestimmte Endungen – `shareableFile()` hängt sonst
`.txt` an (Backup → `….zkb.txt`, Inhalt unverändert); Fehler werden angezeigt, nicht verschluckt.

Mögliche nächste Schritte (mit dem Nutzer abstimmen): Fremdkarten (QR/Strichcode einlernen,
zurückgestellt – der USB-Scanner liest sie bereits), Musik/Animationen in Layouts (zurückgestellt),
Test auf echten Geräten (Scanner, Linux/Raspberry Pi, Kartendrucker, Duplex) und Feinschliff,
später „Erste Schritte“-Liste,
Datenschutz (Hinweis, Auskunft/Löschen je Person), Zutrittszeiten je Gruppe, Backup zusammenführen.
