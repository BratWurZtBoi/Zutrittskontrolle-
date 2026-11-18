# Zutrittskontrolle

Offlinefähige Zutritts- und Anwesenheitskontrolle mit QR-Karten –
als **Web-App (PWA)** für Android-Smartphones, Tablets und Computer mit Webcam – zusätzlich als
**Programm für Windows und Linux** (auch Raspberry Pi). Scannen per Kamera oder **USB-Scanner**.
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
- **Abmelden** führt zur Anmeldung (im Kiosk-Modus zurück zum Kiosk-Scanner, der weiter Namen
  zeigt). **Jetzt sperren** blendet auch dort Namen und Fotos aus. Automatische Abmeldung nach
  Inaktivität (Standard 15 Min.) – für den Dauerbetrieb am Empfang daher die **Bediener-PIN**
  nutzen (Bediener werden standardmäßig nicht automatisch abgemeldet).
- **Bediener-PIN** (*Einstellungen → Bediener & Bestätigung*): eingeschränkter Zugang für den
  Empfang – nur Dashboard und Auswertung, Eintritte bestätigen, „Alle ausbuchen“. Karten, Gruppen,
  CSV-Export, Testmodus und Einstellungen bleiben dem Admin vorbehalten. Die PIN entschlüsselt
  nichts: Nach einem Neustart entsperrt der Admin die Daten einmal mit dem Passwort, danach kann
  sich der Bediener mit der PIN anmelden. Eigene automatische Abmeldung (Standard: nie).
- **Löschfrist:** Protokolleinträge werden automatisch gelöscht (Standard 90 Tage, einstellbar).
- **Testmodus** (Scans simulieren) ist standardmäßig aus und nur für angemeldete Admins sichtbar.
- **Content Security Policy:** Der Browser verhindert technisch, dass die App Daten an fremde
  Server sendet.
- ⚠️ **Passwort vergessen = verschlüsselte Daten verloren.** Bitte sicher notieren.

### Dashboard und Auswertung

- **Dashboard** (für den Windows-Rechner am Empfang, auch Tablet quer):
  - **Statusleiste** oben: Scan-Modus, Anwesende (die drei größten Gruppen, der Rest als
    „+n weitere“), Buchungen und Abweisungen von heute (antippen öffnet die passende Liste),
    Präsentation öffnen bzw. „Präsentation läuft“, Backup-Stand. Die Leiste ist
    **starr**: Jedes Feld hat seinen festen Platz und ändert seine Größe nicht, egal wie viele
    Gruppen anwesend sind (schmales Feld: nur Farbpunkt + Anzahl).
  - Über der Liste **Gruppenknöpfe mit Anzahl** (nur Gruppen mit Treffern, immer eine Zeile –
    passen nicht alle hinein, wischen bzw. Pfeil am Rand).
  - **Links** eine kleine Kameravorschau (**Klein / Groß / Vorschau aus** – bei „Vorschau aus“
    wird weiter gescannt), Scan-Modus und Kamera-Auswahl, darunter wartende Bestätigungen und das
    letzte Ergebnis mit Foto. Die Spalte bleibt beim Scrollen stehen.
  - **Rechts eine Liste mit Reitern:** *Anwesend*, *Aktionen heute*, *Abgewiesen* – eine Zeile pro
    Eintrag, Gruppenfarbe als Balken, Suche und Gruppen-Schaltflächen für alle Reiter,
    **Weitere Filter** (Heute/Gestern, Richtung, Ergebnis, auch Abwesende) und der Link
    **„Ältere Einträge und CSV-Export in der Auswertung“**.
  - Nur die Seite scrollt, keine Scrollbereiche innerhalb der Kacheln. Auf dem Handy untereinander.
- **Auswertung** (im Menü rechts neben dem Dashboard) **→ Anwesenheit:** alle Personen mit Status
  anwesend/abwesend und „seit wann“,
  Suche (Name, Dienstgrad, Einheit, Stellung/Posten, Raum, Karte), Filter nach Status, Gruppe,
  **Einheit/Abteilung, Stellung/Posten und Raum** (Auswahl aus den vorhandenen Werten), Sortierung
  per Spaltenkopf (auch nach Raum),
  **„Alle ausbuchen“** (z. B. am Tagesende).
- **Auswertung → Protokoll:** Zutrittsprotokoll mit Zeitraum (heute, gestern, 7/30 Tage, frei
  wählbar), Filter nach Ergebnis, Richtung und Gruppe, Suche, Sortierung und CSV-Export.
- **Startseite:** angemeldet das Dashboard, sonst die Anmeldung.
- **Kiosk-Modus** (*Einstellungen → Scanner*, Standard aus): für ein Gerät am Eingang ohne Bediener
  (z. B. Tablet) – Vollbild-Scanner als Startseite, scannt auch ohne Anmeldung, Menüpunkt „Kiosk“.

### Am Empfang: manuell buchen, korrigieren, Besucher anmelden

- **Karte vergessen:** Im Dashboard den Namen suchen – die Suche zeigt auch Abwesende – und
  **Einbuchen** bzw. **Ausbuchen** klicken. Es gelten dieselben Regeln wie beim Scan (gesperrt,
  abgelaufen …). Im Protokoll steht „manuell“.
- **Fehlbuchung korrigieren:** **↺ Rückgängig** am letzten Ergebnis oder im Reiter *Aktionen*
  (je Karte die letzte Buchung). Es wird eine Gegenbuchung „Korrektur“ eingetragen, nichts gelöscht.
- **+ Besucher anmelden** (Statusleiste): freie Karte wählen – oder die ausgegebene Karte einfach
  vor die Kamera halten –, Dienstgrad, Name, Einheit/Abteilung, Notiz und optional Foto eintragen, gültig „nur heute“,
  auf Wunsch gleich einbuchen. Vergebene Karten werden nie überschrieben.
- **Zurückgeben** (bei Besucherkarten in der Anwesenheitsliste): ausbuchen und Personendaten
  entfernen – die Karte ist wieder frei.
- **⚠ Notfall** (roter Knopf oben im Menü, auf jeder Seite genau einmal – auf dem Handy in der
  unteren Leiste): Notfallliste mit allen Anwesenden nach Gruppen und Kästchen zum Abhaken am
  Sammelplatz. Ein Druck auf den Knopf **druckt sofort**:
  - im Browser öffnet sich direkt der Druckdialog, danach geht es zurück;
  - im Programm für Windows/Linux auf Wunsch **ganz ohne Druckdialog** auf einen festen Drucker,
    auch mehrere Ausdrucke (*Einstellungen → Allgemein & Gerät → Notfallliste*, je Gerät).
  Optional mit Fotos. Auch für Bediener.

### Eintritt bestätigen (je Gruppe)

- *Einstellungen → Gruppen verwalten → Bearbeiten*: **„Eintritt muss bestätigt werden“**.
  Ohne Häkchen wird wie bisher automatisch eingelassen.
- Mit Häkchen erscheint beim Scan im Dashboard eine Anfrage mit großem Foto, Name, Einheit und
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
- **Editor wie beim Kartenlayout:** oben Name, **Rückgängig/Wiederholen**, Speichern; links die
  Vorschau (bei der Scan-Anzeige umschaltbar Eingang / Ausgang / Kein Zutritt / Bitte warten);
  rechts Reiter **Hinzufügen** (Bausteine wie Titel, Name, Gruß mit Vorname, Meldung, Foto, Gruppe,
  Uhrzeit, Datum, Logo, freier Text), **Bearbeiten** (Inhalt mit Platzhalter-Knöpfen, Schrift, Farbe,
  Position, Ebenen, „Anzeigen bei“), **Design** (Hintergrund, Schriftfarbe, Logo), **Texte** (nur
  Scan-Anzeige: Titel/Meldung je Ergebnis, Datenschutz) und **Allgemein** (Vorlagen, Gruppen
  zuweisen, Standard bzw. aktiver Ruhebildschirm).
- **Direkt in der Vorschau:** ziehen (rastet mit Hilfslinien ein), **Ecken ziehen = Größe**,
  Pfeiltasten = Feinschritt, Entf = löschen, Strg+Z = rückgängig.
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

- *Karten* → Reiter **CSV-Import** → **Vorlage herunterladen** (liegt auch im Repository unter
  [`vorlagen/zutritt-import-vorlage.csv`](vorlagen/zutritt-import-vorlage.csv)).
- In Excel/LibreOffice ausfüllen, als CSV speichern, im Import wählen. Vor dem Import zeigt eine
  **Vorschau** jede Zeile mit Aktion (neue Karte / Zuweisung) oder Fehlergrund.
- Spalten: Kartennummer (optional: leer = neue Karte, vorhandene Nummer = Person dieser Karte
  zuweisen), Gruppe (Name oder Kürzel), Dienstgrad, Vorname, Nachname, Einheit/Abteilung,
  Stellung/Posten, Raum, Notiz,
  Zutritt erlaubt (ja/nein), Gültig ab, Gültig bis (TT.MM.JJJJ). Ältere Dateien mit der Spalte
  „Firma/Abteilung“ werden weiter gelesen.
- Bestehende Personendaten werden nur überschrieben, wenn das ausdrücklich angehakt ist.
- **Zeilen ohne Gruppe oder mit unbekannter Gruppe** (z. B. Tippfehler „Besuchr“) werden trotzdem
  übernommen: Die Personen landen unter *Karten* → Reiter **„Nicht zugeordnet“** (noch ohne Karte –
  können nicht scannen). Dort auswählen, Gruppe wählen und **Zuordnen**: Jede Person bekommt
  zuerst eine **freie Karte** der Gruppe, sonst wird eine neue angelegt; Zutritt und Gültigkeit aus
  der Datei werden übernommen. Danach „Diese Karten drucken“. Personen lassen sich dort auch löschen.
  Eine Liste nur mit Vor- und Nachnamen reicht also aus. Wer dort schon steht, wird beim erneuten
  Einlesen nicht doppelt abgelegt. Die Personendaten sind verschlüsselt und im Backup enthalten.

### Integrierte Hilfe

- **? Hilfe** im Menü (auf dem Handy das Fragezeichen unten) öffnet eine Seitenleiste mit den Anleitungen
  **zur gerade geöffneten Seite** – Schritt für Schritt, die Beschriftungen der App **fett**, mit Direktlinks
  („Datensicherung →“). Am breiten Bildschirm rückt die Seite zur Seite, sodass man beim Lesen mitmachen kann;
  auf Handy/Tablet deckt die Hilfe die Seite ab und schließt sich nach einem Link. **Esc** schließt.
- Suche über alle Themen (auch ohne Umlaute, z. B. „sicherung“, „besucher“), **Alle Hilfethemen** →
  Seite *#/hilfe* mit den Bereichen Erste Schritte, Am Empfang, Karten und Personen, Veranstaltungen,
  Gästebildschirm und Geräte, Daten und Sicherheit.
- **Bediener** (PIN) sehen nur die Themen für den Empfang und keine Links in Admin-Bereiche.
- Die Inhalte stehen in `src/help/topics.ts`; ein Test prüft, dass jede Seite der Bedienung passende Themen hat.

### Mehrfachauswahl

- *Karten* → **Auswählen** → Karten antippen oder „Alle angezeigten“ → **Personendaten entfernen**
  (z. B. alle Besucherkarten des Tages freigeben), **Sperren**, **Entsperren**, **Drucken**, **Löschen**.

### Einstellungen

- *Einstellungen* zeigt alle Bereiche (Scanner, Gruppen, Bediener & Bestätigung, Kartenlayout,
  Präsentation, Sicherheit, Datensicherung, Daten, Allgemein & Gerät) mit dem aktuellen Stand. Am Computer wechselt man über die Seitenleiste, am Handy über „← Einstellungen“.
- Die Einstellungen sind in Gruppen gegliedert: **Betrieb** (Scanner, Gruppen, Bediener), **Gestaltung**
  (Kartenlayout, Präsentation), **Daten & Sicherheit** und **Allgemein & Gerät** – ebenso die Seitenleiste.

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
- **CSV-Export für Excel** (*Auswertung*): die gerade gefilterte und sortierte Liste der Anwesenheit
  bzw. der Aktionen. ⚠️ CSV-Dateien sind **nicht** verschlüsselt.
- Das Dashboard erinnert, wenn das letzte Backup länger als 7 Tage zurückliegt.

### Karten, Personen und Gruppen

- **Karten** werden eigenständig erstellt – einzeln oder in Serie (z. B. 20 Besucherkarten).
  Jede Karte hat eine Kartennummer (z. B. `B-001`), einen QR-Code und eine **Gruppe**.
- **Personendaten** (Dienstgrad, Vor- und Nachname, Einheit/Abteilung, Stellung/Posten wie
  „Kompaniechef“ oder „S4“, Raum, Foto, Notiz) werden einer Karte zugewiesen und
  können jederzeit geändert oder entfernt werden. Dienstgrad, Einheit, Stellung/Posten und Raum
  schlagen beim Tippen die schon verwendeten Werte vor (einheitliche Schreibweise). Der Dienstgrad
  steht überall vor dem Namen („Hptm Mustermann, Max“) und wird im Protokoll mitgespeichert; eine
  Beförderung zählt nicht als Personenwechsel. **„Karte zurückgeben“** bucht aus und entfernt
  die Personendaten – ideal für Besucherkarten.
- **Gruppen** (z. B. Bestandspersonal = blau, Besucher = orange) werden unter
  *Einstellungen → Gruppen verwalten* angelegt: Name, Farbe, Kürzel für die Kartennummern und
  Regeln (Zutritt für die Gruppe, Name/Foto auf die Karte drucken, Zutritt ohne zugeordnete Person).
- Die Gruppenfarbe erscheint auf der gedruckten Karte, in den Listen und im Scanner.

### Kartenlayout (gedruckte Karten)

- *Einstellungen → Kartenlayout*. Mitgeliefert ist „Standard“ (unverändert, als Vorlage
  kopierbar). Vorlagen: **Querformat**, **Hochformat** (für Kartenhalter am Band), **Schlicht**.
- **Editor:** oben Name, Format, **Rückgängig/Wiederholen** (Strg+Z/Strg+Y) und Speichern; links die
  Karte (Vorder-/Rückseite, Vorschau mit/ohne Person, Vorschau-Gruppe); rechts vier Reiter:
  - **Hinzufügen:** fertige Bausteine – Name, Dienstgrad, Einheit/Abteilung, Stellung/Posten, Raum,
    Kartennummer, Gruppe, Gültig bis,
    Organisation, freier Text, QR-Code, Foto, Logo, Farbfläche.
  - **Bearbeiten:** Inhalt mit Knöpfen „+ Dienstgrad“, „+ Vorname“, „+ Einheit/Abteilung“ … (Platzhalter), Ergebnis im
    Beispiel, Schrift, Farbe, Position und Größe in mm, mittig, nach vorne/hinten, Duplizieren,
    Löschen, Anzeigen immer/nur mit Person/nur ohne Person.
  - **Design:** Format, Rückseite an/aus, Hintergrund je Seite (Farbe, Bild), Schriftfarbe, Logo.
  - **Allgemein:** für welche Gruppen das Layout gilt, Standard für alle übrigen, Vorlagen.
- **Direkt auf der Karte:** ziehen = verschieben (rastet mit Hilfslinien an der Mitte und an anderen
  Elementen ein, Umschalt = frei), **Ecken ziehen = Größe**, Pfeiltasten = Feinschritt, Entf =
  löschen. Der QR-Code bleibt mindestens 18 mm groß.
- **Formate:** **Scheckkarte** (85,6 × 54 mm, passt in Kartendrucker), **A7** (74 × 105 mm),
  **A6** (105 × 148 mm) oder **eigene Größe** – jeweils hoch oder quer. Beim Wechsel zwischen Hoch-
  und Querformat bietet der Editor die passende Vorlage an.
- **Rückseite:** z. B. Hinweis bei Fund, Hausordnung, Notfallnummer – mit denselben Bausteinen.
- Beim Verlassen mit ungespeicherten Änderungen fragt die App nach.
- Name und Foto werden nur gedruckt, wenn die Gruppe „Name und Foto auf die Karte drucken“ erlaubt.
- **Drucken:**
  - **A4-Bogen** mit Seitenvorschau und **Schnittmarken**: Scheckkarte 9 je Seite, A7 4, A6 2
    (Karten verschiedener Größe auf getrennten Seiten). Maßstab 100 % wählen.
  - **Beidseitig (Duplex):** nach jeder Seite die Rückseiten gespiegelt angeordnet – „Wenden an
    langer/kurzer Kante“ wie im Druckdialog wählen; erst eine Probeseite drucken.
  - **Zum Falten:** Rück- und Vorderseite nebeneinander, ausschneiden und an der gestrichelten
    Marke falten (ideal für Ausweishüllen, ohne Duplexdrucker).
  - **Kartendrucker:** jede Kartenseite auf einer eigenen Seite in Kartengröße, beidseitig
    abwechselnd Vorder-/Rückseite (im Druckdialog „Ränder: keine“).
  - **Probeseite zum Nachmessen:** Lineale (100 mm) und eine Scheckkarte in Originalgröße; bei
    „beidseitig“ zusätzlich ein Kreuz auf der Rückseite zum Prüfen der Ausrichtung (gegen das Licht).
  - **Nach dem Drucken** fragt die App „Wurden die Karten gedruckt?“ – dann gelten sie als gedruckt.
    Filter **„Nur noch nicht gedruckte“** beim Druck und **„Noch nicht gedruckt“** in der Kartenliste;
    ein neuer QR-Code setzt die Markierung zurück.
- **Karten-Bereich** mit Reitern: Karten | Nicht zugeordnet | CSV-Import | Drucken.

### USB-Scanner (QR-Code-Scanner im Tastatur-Modus)

QR-Code-Scanner, die wie eine Tastatur arbeiten (USB, „HID“/„Tastatur-Modus“), funktionieren ohne
Treiber – im Dashboard, im Kiosk-Scanner und bei „Besucher anmelden“ einfach scannen, ohne vorher
etwas anzuklicken.

- **Einstellungen → Scanner → USB-Scanner:** „Scannen mit“ Kamera und USB-Scanner / nur Kamera /
  nur USB-Scanner (Kamera aus), Scanner-Tempo normal oder langsam (Bluetooth), **Scanner testen**
  (zeigt erkannte Karte, Tempo, Abschlusstaste – ohne zu buchen).
- Die App erkennt den Scanner am Tempo (viele Zeichen in wenigen Millisekunden). Menschliches
  Tippen wird nicht verwechselt; ist ein Suchfeld aktiv, werden die gescannten Zeichen dort wieder
  entfernt. Das Enter am Ende eines Scans löst keine Schaltfläche aus (z. B. „Einlassen“).
- **Tastaturlayout:** Scanner auf **Deutsch (QWERTZ)** und **Enter** nach jedem Code einstellen
  (meist durch Scannen von Einstell-Codes aus der Anleitung). Ein Scanner auf US-Tastatur wird
  erkannt und korrigiert (Y/Z vertauscht, „:“ als „Ö“).
- **Zwei Bildschirme:** Der Scanner tippt in das Fenster, das gerade aktiv ist. Hat jemand auf den
  Gästebildschirm geklickt, reicht dieser den Scan an das Dashboard weiter. Ist keines der beiden
  aktiv, zeigt die App „Fenster nicht aktiv – hier klicken“.
- Im Protokoll und im CSV-Export steht als Quelle „Scanner“.
- Kaufempfehlung: 2D-Scanner (Imager, kein reiner Laserscanner), ideal ein Tisch- bzw.
  Präsentationsscanner (Karte nur davorhalten).

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

### Veranstaltungen (einmalige Events)

Für Feiern, Empfänge, Tage der offenen Tür … – getrennt von der normalen Zutrittskontrolle.

- Menü **Veranstaltungen** (auf dem Handy „Events“): **+ Neue Veranstaltung** mit Name, Datum, Ort,
  Einlass von/bis, Farbe, optional eigenem Gästebildschirm. Zum Ausprobieren gibt es eine
  **Beispielveranstaltung** mit fiktiven Gästen.
- **Gästeliste**: Anrede, Dienstgrad, Vor-/Nachname, Einheit/Firma, Kategorie (z. B. VIP, Presse),
  E-Mail, Notiz – einzeln oder per **CSV-Import** (Vorlage zum Herunterladen, Vorschau mit Fehlern).
  Jeder Gast hat eine Nummer und einen eigenen QR-Code (`ZE1:…`, verschieden von Ausweisen).
  Einladungen lassen sich stornieren; Personendaten liegen verschlüsselt auf dem Gerät.
- **„Einlass starten“** (je Gerät): oben erscheint ein **farbiges Band** mit der Veranstaltung, aus
  „Dashboard“ wird **„Einlass“**. Am Veranstaltungstag bietet das Dashboard den Start selbst an.
  - Jeder Einladungs-Code gilt **nur einmal**. Ein zweiter Scan zeigt **„Bereits eingelassen um …“**
    (orange). Stornierte Einladungen, Einladungen anderer Veranstaltungen und unbekannte Codes
    werden abgewiesen.
  - **Dienstausweise** gelten standardmäßig nicht; je Veranstaltung einschaltbar.
  - Statusleiste: **Eingelassen · von · Quote · Noch offen · abgewiesen**; Reiter **Eingelassen /
    Noch offen / Abgewiesen**. Einladung vergessen → in „Noch offen“ **Einlassen**; nicht auf der
    Liste → **+ Gast nachtragen** (gleich einlassen). Fehlbedienung → **Zurücknehmen**.
  - Einlässe landen **nicht** in Anwesenheit und Protokoll der Zutrittskontrolle, sondern im
    Einlass-Protokoll der Veranstaltung. Die **Notfallliste** enthält währenddessen zusätzlich alle
    eingelassenen Gäste.
- **Teilnahme**: eingeladen, eingelassen (Quote), offen, storniert, abgewiesen, je Kategorie,
  **Einlass im Zeitverlauf** (15 Minuten), Einlass-Protokoll, **Teilnehmerliste als CSV**.
- Danach **„Gästedaten löschen“** (Namen weg, Zahlen bleiben) oder die ganze Veranstaltung löschen.
- **Einladungen** (Reiter „Einladungen“):
  - **Einladung gestalten** im gewohnten Editor (Ziehen, Anfasser, Rückgängig): Formate **A4, A5, A6/Postkarte,
    DIN lang**, Bausteine Briefanrede, Einladungstext, Veranstaltung, Datum/Ort/Einlass, Name des Gastes,
    Nr., QR-Code, Logo, Farbfläche. Platzhalter z. B. `{briefanrede}` („Sehr geehrter Herr Oberst
    Mustermann“), `{name}`, `{einheit}`, `{veranstaltung}`, `{datum}` („Samstag, 12. Dezember 2026“),
    `{ort}`, `{einlass}`, `{nr}`. Vorlagen „Brief“ (hoch) und „Karte“ (quer).
  - **Für wen:** alle, nur ohne E-Mail (Post), nur mit E-Mail, noch nicht eingelassen – plus Kategorie.
  - **Drucken / ein PDF** (Serienbrief, je Gast eine Seite; A6 auch zwei je A4 mit Schnittmarken).
  - **PDF je Gast**: eine Datei je Gast (`Einladung_012_Mustermann_Max.pdf`) – im Browser als ZIP, im
    Programm für Windows/Linux direkt in einen gewählten Ordner. Ohne Internet erzeugt.
  - **Versandliste (CSV)**: E-Mail, Briefanrede und Dateiname je Gast – z. B. für Outlook. Die App
    verschickt selbst keine E-Mails.
- Veranstaltungen (mit Einladung) sind im verschlüsselten Backup enthalten.
- Hinweis: Ohne Server prüft jedes Gerät nur seine eigene Gästeliste – für einen Eingang gedacht.

## Einmalige Einrichtung (im Browser auf github.com)

1. Repository öffentlich: *Settings* → *Danger Zone* → *Change visibility* → *Public*.
2. GitHub Pages: *Settings* → *Pages* → *Source*: **GitHub Actions**.
3. Jeder Merge nach `main` veröffentlicht die App automatisch (ca. 1–2 Minuten, Reiter *Actions*).

## App installieren

**Galaxy S24 Ultra / Android-Tablet (Chrome):** App-Adresse öffnen → Menü ⋮ →
*Zum Startbildschirm hinzufügen* → *Installieren*. Beim ersten Scannen die Kamera erlauben.

**Windows-Rechner mit Webcam (Edge oder Chrome):** App-Adresse öffnen → in der Adressleiste auf
das Installieren-Symbol klicken (oder Menü → *Apps* → *Diese Seite als App installieren*).
Bei mehreren Kameras (z. B. eingebaut + USB-Webcam) die gewünschte im Dashboard unter der
Kameravorschau auswählen.

**Updates:** App schließen und neu öffnen – neue Versionen werden automatisch geladen.

### Programm für Windows und Linux (ohne Browser)

Zusätzlich zur Web-App gibt es ein eigenständiges Programm (Electron) – gleiche Funktionen,
gleicher Programmcode. Alle Dateien liegen auf GitHub unter **Releases**
(https://github.com/adminzirkel/Zutrittskontrolle-/releases), je Version eine Ausgabe – bei jedem
Merge nach `main` automatisch gebaut.

#### Windows

- **Herunterladen:** `Zutrittskontrolle-Setup-<Version>.exe`.
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
  Freigabe nach dem Neustart; *Einstellungen → Allgemein & Gerät*: „Beim Anmelden an Windows automatisch
  starten“; **F11** = Vollbild. Das Programm baut keine Verbindungen ins Internet auf.

#### Linux (PC, Laptop, Raspberry Pi)

- **Herunterladen:** `Zutrittskontrolle-<Version>-amd64.deb` für normale PCs und Laptops
  (empfohlen: **Linux Mint** oder Ubuntu), `Zutrittskontrolle-<Version>-arm64.deb` für den
  **Raspberry Pi 4/5** mit **Raspberry Pi OS (64-Bit)**.
- **Installieren:** Datei doppelt anklicken → *Installieren* (Paketinstallation), oder im Terminal
  `sudo apt install ./Zutrittskontrolle-<Version>-amd64.deb`. Danach steht „Zutrittskontrolle“ im
  Startmenü (Kategorie Büro).
- **Daten:** liegen in `~/.config/Zutrittskontrolle` und bleiben bei Updates erhalten.
- **Updates:** neues Paket herunterladen und genauso installieren – es ersetzt die alte Version.
- **Zwei Bildschirme:** in den Bildschirmeinstellungen „Erweitern“ (nicht „Spiegeln“) wählen. Das
  Programm läuft im X11-Kompatibilitätsmodus, damit die Präsentation auch unter Wayland
  (Ubuntu, Raspberry Pi OS) auf dem zweiten Bildschirm landet.
- **Raspberry Pi:** als Kamera eine USB-Webcam verwenden (Pi-Kameramodule werden im Programm nicht
  unterstützt) – oder einen USB-Scanner.
- **Ausprobieren ohne Installation:** Linux Mint als „Live-System“ vom USB-Stick starten (verändert
  den Rechner nicht) und das Paket dort installieren.
- *Einstellungen → Allgemein & Gerät:* „Beim Anmelden automatisch starten“.

## Erste Schritte zum Testen

1. App öffnen → Admin-Passwort einrichten.
2. *Karten* → **Testkarten anlegen** (9 Personalkarten, 5 Besucherkarten – davon 3 frei;
   darunter eine gesperrte, eine abgelaufene und eine noch nicht gültige Karte).
3. *Einstellungen → Scanner* → **Testmodus** einschalten → *Dashboard* → Testmodus aufklappen →
   Karte wählen → **Karte scannen** simuliert einen Scan.
4. Freie Besucherkarte öffnen → **Person zuweisen** → **Nur heute** → Speichern → scannen →
   danach **Karte zurückgeben**.
5. Echter Kameratest: *Karten* → Reiter **Drucken** → als PDF speichern, auf einem zweiten Gerät öffnen
   und mit dem Gerät scannen, auf dem die Karten erstellt wurden.
6. *Dashboard* und *Auswertung* zeigen, wer eingebucht ist und welche Buchungen es gab.
7. Bei Fragen: **? Hilfe** im Menü – zeigt die Anleitungen zur gerade geöffneten Seite.

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
| Auswertung mit Suche/Filter/Sortierung, Dashboard (Kamera + Anwesende + Aktionen) | ✅ |
| „Alle ausbuchen“ | ✅ |
| Verschlüsseltes Backup (Export/Import), CSV-Export für Excel | ✅ |
| CSV-Import von Personenlisten mit Vorlage und Vorschau | ✅ |
| Mehrfachauswahl: Personendaten entfernen, sperren, drucken, löschen | ✅ |
| Präsentationsansicht für Gäste auf zweitem Bildschirm | ✅ |
| Helles und dunkles Layout | ✅ |
| Programm für Windows (Installationsdatei) und Linux (.deb, auch Raspberry Pi) | ✅ |
| Karteneditor mit Reitern, Rückgängig, Anfassern; Formate A7/A6/eigene; Rückseite; Duplex/Falten | ✅ |
| USB-Scanner (Tastatur-Modus) mit Scanner-Test | ✅ |
| CSV-Import: Personen ohne Gruppe unter „Nicht zugeordnet“, später zuordnen | ✅ |
| Veranstaltungen: Gästeliste, Einladungs-Codes nur einmal gültig, Einlass-Dashboard, Teilnahme | ✅ |
| Einladungen: Editor (A4/A5/A6/DIN lang), Serienbrief, PDF je Gast (ZIP/Ordner), Versandliste | ✅ |
| Integrierte Hilfe: „?“ mit Anleitungen zur Seite, Hilfe-Seite mit Suche, Admin/Bediener getrennt | ✅ |

## Technik

React 19 · TypeScript · Vite · vite-plugin-pwa (Workbox) · Dexie (IndexedDB) · jsQR · qrcode

```
src/
  domain/     Reine Logik: Zutrittsentscheidung, QR-Format, Doppelscan-Schutz, Farben,
              Filter/Sortierung für Auswertung und Dashboard (mit Tests)
  db/         Lokale Datenbank: Gruppen, Karten, Scans/Protokoll, Einstellungen, Testdaten (mit Tests)
  security/   Verschlüsselung (Web Crypto), Passwort-Tresor, Admin-Sitzung (mit Tests)
  scanner/    Kamera-Scanner und QR-Decoder (Web Worker)
  lib/        Kamera (inkl. Geräteauswahl), Fotos, QR-Erzeugung, Ton, Bildschirm-an
  components/ Wiederverwendbare Oberflächenbausteine
  pages/      Dashboard, Auswertung, Kiosk-Scanner, Präsentation, Anmeldung, Karten, Import, Druck,
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
npm run desktop:smoke        # Programm testen (Linux: xvfb-run -a …)
npm run desktop:build:linux  # Linux-Pakete (.deb amd64 + arm64) bauen
```

GitHub Actions prüft jeden Push; Merges nach `main` werden veröffentlicht.
