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
  Gültigkeit, optional **Inhaber** (`CardHolder`: `rank` Dienstgrad, Vor-/Nachname, `company` =
  **Einheit/Abteilung** (bis 0.16 „Firma“, Feldname bleibt), `position` Stellung/Posten, `room` Raum,
  Foto, Notiz) – frei änderbar, alles im verschlüsselten `holderEnc` (keine DB-Migration nötig).
  Anzeige über `domain/texts.ts`: `holderName` („Hptm Max Mustermann“, auch Protokoll-Schnappschuss
  `nameEnc`), `holderListName` („Hptm Mustermann, Max“), `holderUnitLine` („Einheit · Posten“);
  Personenwechsel per `personKey` (ohne Dienstgrad → Beförderung bucht nicht aus). Formular
  `components/HolderFields` (Vorschläge per datalist). Suche `holderSearchText`, Auswahlfilter
  `HOLDER_FILTER_FIELDS`/`HolderFieldSelects`; im Protokoll über die aktuelle Karte (`holdersByCard`,
  nur bei gleicher Person). Platzhalter `{dienstgrad}` `{einheit}` (alt `{firma}`) `{posten}` `{raum}`,
  Gästebildschirm-Namensform `rank-last`. CSV-Spalten Dienstgrad, Einheit/Abteilung, Stellung/Posten,
  Raum (Alias „Firma/Abteilung“).
  Personenwechsel/Rückgabe bucht die bisherige Person automatisch aus (Quelle `system`).
  Neuer QR-Code (`reissueToken`, mehrere: `reissueTokens` in der Mehrfachauswahl „Neue QR-Codes“): alter Code
  wandert nach `oldTokens` (max. 10, DB-Version 6 mit Index `*oldTokens`) → Scan = Grund `OLD_CARD` („Alte
  Karte!“, wird mit Karte protokolliert; Gäste sehen wie bei `CARD_LOST` nichts), `printedAt` zurückgesetzt.
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
- **Veranstaltung** (`Occasion`, Tabelle `occasions`, DB-Version 5) mit **Gästen** (`GuestRecord`, `guests`:
  Nummer je Veranstaltung, Token `ZE1:` (`encodeGuestPayload`/`parseAppCode`, Scanner-Layoutkorrektur
  auch für `YE1Ö`), `personEnc`/`nameEnc` (`GuestPerson`: Anrede, Dienstgrad, Name, Einheit/Firma,
  E-Mail, Notiz), `category` unverschlüsselt (Kennzahlen), `cancelled`, `admittedAt` einmalig) und
  eigenem **Einlass-Protokoll** (`occasionLog`). Logik rein in `domain/occasion.ts` (`decideGuestEntry`:
  einmalig, Doppelscan innerhalb Doppelscan-Schutz, storniert/andere Veranstaltung/unbekannt;
  `occasionStats`, `admissionTimeline`, Filter), DB `db/occasions.ts`. **Einlass-Modus je Gerät**:
  `settings.activeOccasionId` (nicht im Backup); `useScanProcessor` leitet dann an `processOccasionScan`
  (liefert `ScanOutcome` mit `occasion`/`guest`; bucht NICHT in `events`/`presence`). Dienstausweise
  nur mit `occasion.cardsAllowed` (Standard aus). Anzeige: Band `OccasionBand` in `Layout`, Menü
  „Einlass“ statt „Dashboard“, `DashboardPage` mit `EntryStatusBar`/`EntryList`
  (`components/occasion/`), Notfallliste + `listAdmittedPeople`, Gästebildschirm mit Layouts der
  Veranstaltung. Seiten `#/veranstaltungen`, `/neu`, `/:id` (Reiter Gäste/Teilnahme/Einstellungen),
  CSV `domain/guestImport.ts`. Im Backup (`occasions`, `guests`, `occasionLog`). Ohne Server: jedes
  Gerät prüft nur seine eigene Liste (ein Eingang).
  **Gast mit vorhandener Karte:** `GuestRecord.cardId`/`cardNumber`/`cardHolderSince` (`NewGuest.cardId`,
  beim Bearbeiten `null` = lösen; `cardLink` prüft Person/Sperre/doppelt). `GuestDialog` erkennt Karteninhaber
  per `findHolderMatches` (Nachname ab 2, Vorname ab 3 Zeichen, Umlaute egal) → „Einladung“ bzw. „Karte … gilt“.
  Scan einer Karte: zuerst `findCardGuest` (auch über `replaces`-Kette = Ersatzkarte) → `decideCardGuestEntry`
  (Gästeliste entscheidet, nur verloren/gesperrt/Personenwechsel `CARD_PERSON_CHANGED` abgewiesen), sonst
  `cardsAllowed`. **Dienstausweise gelten je Veranstaltung nur einmal** (`cardAdmissions` aus dem Log, erster
  Einlass seit „Zurücknehmen“ `undoCardAdmission`); `repeatEntryDecision` gemeinsam für Gäste und Karten,
  `ScanOutcome.admittedAt` für „Bereits eingelassen um …“. Einladungsdruck/PDF/Versandliste ohne Karten-Gäste.
  **Einladungen** (Serienbrief): `occasion.invitation` = `CardLayout` (Formate `INVITATION_FORMATS`
  a4/a5/a6/dl, `saveInvitation`), Logik `domain/invitation.ts` (Platzhalter `invitationValues` inkl.
  `{briefanrede}`, Vorlagen/Bausteine, `selectInvitationGuests`, `invitationFilename`, `mailingListCsv`).
  Editor = `CardLayoutEditor` mit `config` (`LayoutEditorConfig`, `CARD_EDITOR` bzw.
  `invitationEditorConfig` in `pages/InvitationEditorPage.tsx`); `CardView` mit `values`/`qrKind`.
  Druck `pages/InvitationPrintPage.tsx` (je Gast eine Seite, kleine Formate auf A4). PDF je Gast:
  `lib/invitationRender.ts` zeichnet das Layout in ein Canvas (200 dpi, Umbruch `domain/textWrap.ts`
  wie `pre-line`) → `domain/pdf.ts` (JPEG-Seite) → `domain/zip.ts` (ZIP „stored“); im Programm
  `zkDesktop.saveToFolder` (nur `*.pdf`/`*.csv`-Namen, Ordner per Dialog). `cardText` entfernt Trennzeichen
  am Rand nur, wenn ein Platzhalter leer war.
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
- Routen: `RequireRole allow="staff"` (Admin oder Bediener) für `/dashboard`, `/auswertung`
  (früher `/uebersicht`, leitet weiter), `/notfallliste`, `/hilfe` (Liste in `lib/roles.ts`), alles andere
  `allow="admin"`. Frei: `/`, `/anmelden`, `/einrichtung`, `/praesentation`. Startseite `/` =
  `pages/StartPage.tsx`: im **Kiosk-Modus** (`settings.kioskMode`, je Gerät, Standard aus) der
  Vollbild-Scanner (`ScannerPage`, scannt ohne Anmeldung, Menüpunkt „Kiosk“), sonst Dashboard bzw.
  Anmeldung/Einrichtung. Menü: Dashboard (im Einlass-Modus „Einlass“) | Auswertung | Karten | Veranstaltungen
  (Handy: „Events“ per `data-short`) | Einstellungen | ⚠ Notfall | ? Hilfe | Abmelden.
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
- Auswertung (`pages/OverviewPage.tsx`, Reiter Anwesenheit/Protokoll, Adressparameter `ansicht`,
  `suche`, `gruppe`, `zeitraum`) und Dashboard (Zeitraum nur Heute/Gestern, Link „Ältere Einträge“
  in die Auswertung): reine Filter-/Sortierfunktionen in `domain/overview.ts`, Daten über
  `hooks/useOverviewData.ts` (Zeitraum per Index, Rest im Speicher). Dashboard-Kennzahlen ohne
  Entschlüsseln in `hooks/useDashboardData.ts`. Dashboard-Layout: Statusleiste, linke Spalte
  sticky, rechts **eine** Liste mit Reitern – keine Scrollbereiche in Kacheln (E2E prüft das).
  Statusleiste und Werkzeugzeile der Liste sind **starr** (vom Nutzer gewünscht): Grid mit festen
  Plätzen je Bildschirmbreite (Handy/ab 700 px zwei Zeilen/ab 1800 px eine Zeile), alle Felder immer
  da (auch „0 abgewiesen“, Backup-Stand), Hinweise als Overlay, höchstens 3 Gruppen
  (`splitTopGroups`) + „+n weitere“, Kürzen per Ellipse/Container-Query – nichts darf je nach Daten
  umbrechen (E2E vergleicht die Größen). Gruppenknöpfe `components/GroupChips` (Anzahl, eine Zeile,
  Pfeile); schmale Liste blendet die Spalte Firma aus (`col-company`).
  **Notfall-Schnelldruck:** roter Knopf „⚠ Notfall“ nur in der Navigation (Admin + Bediener) – auf jeder
  Seite genau **einmal** (vom Nutzer gewünscht, E2E prüft das; nicht zusätzlich in Statusleiste o. Ä.)
  → `EMERGENCY_PRINT_PATH` (`/notfallliste?drucken=1`, `state.from`).
  `EmergencyListPage` druckt nach dem Laden einmal (Parameter wird entfernt): Plan in
  `domain/emergencyPrint.ts` – Browser `window.print()` (blockiert es > 400 ms = Dialog am Computer
  geschlossen → zurück; Handy bleibt auf der Liste), Programm mit `emergencyDirectPrint` ohne Dialog über
  `zkDesktop.printDirect` (Drucker `emergencyPrinter`, '' = Standard; `emergencyCopies` 1–5). Einstellungen
  je Gerät (nicht im Backup) in „Allgemein & Gerät“ (`settings/EmergencyPrintSettings.tsx`).
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
- **Integrierte Hilfe:** Logik rein in `domain/help.ts` (`topicsForPath` längstes Pfad-Muster zuerst, „/“ nur exakt;
  `searchTopics` mit Umlaut-Faltung; `visibleTopics` – Bediener nur `audience: 'all'`; `emphasisParts` für `**fett**`),
  Inhalte in `src/help/topics.ts` (`HELP_TOPICS`: Schritte mit **Beschriftungen der App** fett, `link` nur auf
  existierende Routen; Test prüft Seiten-Abdeckung). Anzeige `components/help/` (`HelpPanel` = Seitenleiste über
  „?“ in der Navigation, `HelpTopicView` blendet Links aus, die die Rolle nicht öffnen darf (`isStaffPath`) oder
  auf die aktuelle Seite zeigen), Seite `#/hilfe` (`?thema=`, `?suche=`, staff). Ab 1200 px rückt `.app-main` zur
  Seite (`.app.help-open`), darunter deckt die Leiste die Seite ab und schließt nach Links/Seitenwechsel. Tasten im
  Panel werden nicht weitergereicht (sonst Enter/Esc = Einlassen/Abweisen). **Bei neuen Funktionen/Beschriftungen
  die Hilfetexte mit anpassen.** **Erste Schritte** (Admin): `domain/gettingStarted.ts` (`SETUP_STEPS` mit `detect`
  aus `SetupFacts` bzw. nur von Hand, `optional` zählt nicht; `setupProgress`, `toggleManualStep`), Fakten ohne
  Entschlüsseln in `hooks/useSetup.ts` (Testkarten zählen nicht, Scan = Quelle camera/scanner, Backup = `lastBackupAt`
  oder Auto-Sicherung), `settings.setupDone`/`setupHidden` (im Backup); Dashboard-Karte `components/setup/SetupCard`
  (linke Spalte, verschwindet wenn fertig/ausgeblendet), Seite `pages/GettingStartedPage.tsx` `#/erste-schritte`
  (Häkchen optimistisch), Link oben auf `#/hilfe`. (`pages/SetupPage.tsx` ist die Passwort-Einrichtung!)
  **ⓘ-Hinweise:** `components/InfoTip` (`hint` = Schlüssel in `help/hints.ts`, Test: jeder Hinweis wird verwendet,
  Themen existieren). Auslöser ist ein `span role="button"` – ein `<button>` im `<label>` vor dem Eingabefeld würde
  dem Feld die Beschriftung wegnehmen (erstes „labelable“ Element); Klick mit `preventDefault` (Häkchen bleibt).
  Navigation: auf Tablet (768–1099 px) Symbol über Beschriftung, 1100–1439 px
  „Hilfe“/„Abmelden“ nur Symbol; Beschriftungen kürzen sich notfalls mit „…“ (Notfall nie) – E2E prüft 360–1536 px.
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
  Ordner und nur Backup-Dateinamen –, Autostart, Info, Drucker + Drucken ohne Dialog
  `printDirect` = `webContents.print({ silent })` der aufrufenden Seite, `saveToFolder` für Einladungs-PDFs). Im Browser ist `getDesktop()` null.
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
15. ✅ Aufräumen: Kiosk-Scanner nur noch als abschaltbarer Kiosk-Modus (Startseite sonst Dashboard bzw.
    Anmeldung), „Übersicht“ → „Auswertung“ (Reiter Protokoll) neben dem Dashboard, Dashboard nur
    Heute/Gestern, „Letzte Scans“ und doppelter Druckknopf entfernt (Druck mit Gruppenfilter), Modus/Kamera
    nur im Dashboard, „Vorschau aus“, „Allgemein & Gerät“ zusammengelegt, alter Code/CSS entfernt (Version 0.15).
16. ✅ Starre Statusleiste (feste Plätze, max. 3 Gruppen + „+n weitere“), Gruppenknöpfe mit Anzahl (0.15.1);
    roter Notfall-Knopf (nur Navigation, je Seite einmal) mit Sofortdruck, im Programm ohne Druckdialog
    (Drucker, Kopien) (Version 0.16).
17. ✅ Personendaten: Dienstgrad (vor dem Namen), Einheit/Abteilung statt Firma, Stellung/Posten, Raum –
    in Formularen (mit Vorschlägen), Listen, Notfallliste, Suche, Auswahlfiltern, CSV, Karten- und
    Gästebildschirm-Platzhaltern, Namensform „Dienstgrad + Nachname“ (Version 0.17).
18. ✅ Veranstaltungen (Teil 1): Gästeliste (CSV), Einladungs-Codes nur einmal gültig, Einlass-Modus je Gerät
    (Band, „Einlass“-Dashboard, Notfallliste mit Gästen), Teilnahme mit Zeitverlauf (Version 0.18).
19. ✅ Veranstaltungen (Teil 2): Einladungs-Editor (A4/A5/A6/DIN lang), Serienbrief-Druck, PDF je Gast
    (ZIP bzw. Ordner im Programm), Versandliste (Version 0.19).
20. ✅ Integrierte Hilfe (Admin + Bediener, Schritt für Schritt): „?“-Seitenleiste zur aktuellen Seite, Hilfe-Seite
    mit Suche; Menü passt jetzt auch auf Tablets (Notfall/Abmelden waren dort abgeschnitten) (Version 0.20).
21. ✅ Hilfe Teil 2: „Erste Schritte“-Checkliste (erkennt Erledigtes selbst, Dashboard-Karte) und ⓘ-Erklärungen an
    erklärungsbedürftigen Feldern (Version 0.21).
22. ✅ Rückmeldungen: Dienstausweis bei Veranstaltungen nur einmal („Bereits eingelassen“), Gast hinzufügen erkennt
    vorhandene Personen (Einladung oder „Karte gilt“), neue QR-Codes für viele Karten mit „Alte Karte!“,
    Druckseiten klarer (A4-Bogen vs. Kartendrucker, Seitenzahl, kleine Einladungen mehrfach je A4) (Version 0.22).
    Später: Begleitpersonen, Kategorie-Farben, Abendkasse, Outlook-Hilfe.

Farben in `styles.css` nur über Variablen (`--surface`, `--text`, `--danger-fg` …), damit beide
Layouts funktionieren. Dunkle Bereiche (Scanner, Navigation, Präsentation) sind bewusst fest dunkel.

Teilen (`lib/download.ts`): Chrome teilt nur bestimmte Endungen – `shareableFile()` hängt sonst
`.txt` an (Backup → `….zkb.txt`, Inhalt unverändert); Fehler werden angezeigt, nicht verschluckt.

Mögliche nächste Schritte (mit dem Nutzer abstimmen): Fremdkarten (QR/Strichcode einlernen,
zurückgestellt – der USB-Scanner liest sie bereits), Musik/Animationen in Layouts (zurückgestellt),
Test auf echten Geräten (Scanner, Linux/Raspberry Pi, Kartendrucker, Duplex) und Feinschliff,
Datenschutz (Hinweis, Auskunft/Löschen je Person), Zutrittszeiten je Gruppe, Backup zusammenführen.
