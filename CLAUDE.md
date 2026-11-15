# CLAUDE.md – Projektleitfaden

Offlinefähige Zutritts- und Anwesenheitskontrolle (max. 100 Personen) als PWA.
Der Nutzer entwickelt **ausschließlich über Claude Code auf dem Smartphone** – es gibt keinen
Entwicklungs-PC. Er testet über die veröffentlichte App (GitHub Pages) auf einem Galaxy S24 Ultra,
Android-Tablets und einem Windows-Laptop mit Webcam.

## Grundregeln

- **Nur fiktive Testpersonen** verwenden (siehe `src/db/seed.ts`). Keine echten Namen/Fotos.
- **Keine Cloud-Abhängigkeit** für Daten: alles bleibt in IndexedDB auf dem Gerät.
  Keine externen Requests zur Laufzeit (keine CDNs, Fonts, Analytics).
- **Kein APK/Capacitor** – bewusst entschieden: reine PWA.
- Kleine, testbare Schritte. Vor jedem Commit: `npm run check`.
  Bei UI-Änderungen zusätzlich `npm run build && npm run e2e:local` (simulierte Kamera).
- Oberfläche und Doku auf **Deutsch**, Bezeichner im Code auf Englisch.
- Mobile-first (Touch-Ziele ≥ 44 px), muss auch auf Tablet und Laptop gut aussehen.

## Architektur

- `src/domain/` – reine Funktionen ohne DOM/DB (Zutrittsentscheidung `decideAccess`,
  QR-Format `ZK1:<Token>`, `ScanDeduper`). Hier neue Geschäftslogik zuerst ansiedeln + testen.
- `src/db/` – Dexie-Datenbank `zutrittskontrolle`. Schemaänderungen nur über neue
  `this.version(n)` in `db.ts` (niemals bestehende Versionen ändern – sonst Datenverlust auf Geräten).
- `src/scanner/` – Kamera-Loop + jsQR im Web Worker.
- Routing per `HashRouter` (läuft ohne Server-Konfiguration auf GitHub Pages und offline).
- Vite `base: './'` – relative Pfade, nicht ändern.

## Veröffentlichung

- `.github/workflows/deploy.yml`: jeder Push → Typen, Tests, Build. Push auf `main` → GitHub Pages.
- App-Adresse: https://bratwurztboi.github.io/Zutrittskontrolle-/ – Adresse nicht ändern,
  da die lokalen Daten an die Herkunft (Origin) gebunden sind.

## Roadmap

1. ✅ Prototyp: Personenverwaltung, Ausweise, Scanner, Protokoll, Anwesenheit
2. PIN-geschützter Adminbereich (Scanner bleibt offen, Rest geschützt; PBKDF2 über WebCrypto)
3. Verschlüsselte Backups (AES-GCM, Passwort → PBKDF2), Import/Export als Datei
4. Historie filtern + CSV-Export, „Alle ausbuchen“, Tagesübersicht
