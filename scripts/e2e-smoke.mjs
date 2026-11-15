/**
 * Lokaler End-to-End-Test mit simulierter Kamera (nur Cloud-/Entwicklungsumgebung).
 * Ablauf: Build ausliefern → Testkarten anlegen → QR-Code einer Karte als
 * Kamerabild einspeisen → prüfen, dass der Scanner bucht und anzeigt.
 * Voraussetzungen: `npm run build`, Playwright + Chromium, ffmpeg.
 * Aufruf: npm run e2e:local   (Screenshots landen in .e2e/)
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}

const OUT = resolve('.e2e');
const PROFILE = resolve(OUT, 'profile');
const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = spawn(
  process.execPath,
  [resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' },
);
const stop = () => {
  if (server.exitCode === null) server.kill('SIGTERM');
};
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Preview-Server startet nicht');
}

function check(cond, msg) {
  if (!cond) throw new Error(`FEHLER: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const DB = 'zutrittskontrolle-daten';
const readStore = (page, store) =>
  page.evaluate(
    ([db, name]) =>
      new Promise((res, rej) => {
        const req = indexedDB.open(db);
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const all = req.result.transaction(name).objectStore(name).getAll();
          all.onsuccess = () => res(all.result);
        };
      }),
    [DB, store],
  );

const viewport = { width: 412, height: 915 };
const PASSWORD = 'Test-Passwort-123';
const problems = [];

async function openContext(extraArgs = []) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    viewport,
    permissions: ['camera'],
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...extraArgs],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`JS-Fehler: ${e.message}`));
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(`CSP: ${m.text()}`);
  });
  page.on('dialog', (d) => void d.accept()); // Bestätigungsdialoge annehmen
  return { ctx, page };
}

async function login(page, target = '') {
  await page.goto(`${URL}#/anmelden${target ? `?ziel=${encodeURIComponent(target)}` : ''}`);
  await page.getByLabel('Admin-Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
}

try {
  await waitForServer();

  console.log('1) Ersteinrichtung Admin-Passwort');
  let { ctx, page } = await openContext();
  await page.goto(`${URL}#/karten`);
  await page.getByRole('heading', { name: 'Admin-Passwort einrichten' }).waitFor();
  check(page.url().includes('#/einrichtung'), 'Verwaltung ohne Passwort leitet zur Einrichtung');
  await page.screenshot({ path: `${OUT}/00-einrichtung.png`, fullPage: true });
  await page.getByLabel('Neues Passwort (mindestens 8 Zeichen)').fill(PASSWORD);
  await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
  await page.getByLabel(/Verstanden/).check();
  await page.getByRole('button', { name: 'Passwort einrichten' }).click();
  await page.getByRole('button', { name: 'Testkarten anlegen' }).click();
  await page.locator('.card-row').nth(13).waitFor();
  check((await page.locator('.card-row').count()) === 14, '14 fiktive Testkarten (9 Personal, 5 Besucher)');
  check((await page.locator('.card-row').first().textContent()).includes('Mustermann'), 'Liste zeigt entschlüsselte Namen');
  await page.screenshot({ path: `${OUT}/01-karten.png`, fullPage: true });
  const cards = await readStore(page, 'cards');
  const max = cards.find((c) => c.number === 'M-001');
  const raw = JSON.stringify(cards) + JSON.stringify(await readStore(page, 'events'));
  check(!/Mustermann|Musterfrau|Platzhalter/.test(raw), 'Datenbank enthält keine Namen im Klartext');

  console.log('2) Zahlenfeld frei bearbeitbar');
  await page.goto(`${URL}#/karten/neu`);
  const count = page.getByLabel('Anzahl');
  await count.click();
  await page.keyboard.press('Backspace');
  check((await count.inputValue()) === '', 'Feld „Anzahl“ lässt sich leeren');
  await page.keyboard.type('12');
  check((await count.inputValue()) === '12', 'Neue Zahl ersetzt die alte');
  await page.getByText(/bis/).first().waitFor();
  await count.fill('');
  await page.getByLabel('Gruppe').click(); // Feld verlassen
  check((await count.inputValue()) === '12', 'Leeres Feld wird beim Verlassen auf den letzten Wert gesetzt');

  console.log('3) Testmodus einschalten');
  await page.goto(`${URL}#/einstellungen`);
  await page.getByLabel(/Testmodus/).click();
  await page.locator('input[type=checkbox]:checked').filter({ has: page.locator('xpath=self::*') }).first().waitFor();
  await page.waitForTimeout(300);
  check(await page.getByLabel(/Testmodus/).isChecked(), 'Testmodus eingeschaltet');
  await ctx.close();

  console.log('4) Kamerabild mit QR-Code erzeugen');
  const png = `${OUT}/qr.png`;
  const y4m = `${OUT}/camera.y4m`;
  await QRCode.toFile(png, `ZK1:${max.token}`, { errorCorrectionLevel: 'M', margin: 2, width: 420 });
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-loop', '1', '-i', png,
    '-vf', 'pad=1280:720:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p',
    '-t', '2', '-r', '10', y4m,
  ]);

  console.log('5) App-Neustart: gesperrt scannen');
  ({ ctx, page } = await openContext([`--use-file-for-fake-video-capture=${y4m}`]));
  await page.goto(URL);
  let overlay = page.locator('.result-overlay');
  await overlay.waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/02-scan-gesperrt.png` });
  const lockedScan = await overlay.textContent();
  check(lockedScan.includes('Willkommen') && lockedScan.includes('Karte M-001'), 'Gesperrt: Zutritt wird geprüft, Kartennummer angezeigt');
  check(lockedScan.includes('Name gesperrt') && !lockedScan.includes('Mustermann'), 'Gesperrt: Name bleibt verborgen');
  await page.waitForTimeout(5000); // Code bleibt im Bild → darf nicht erneut buchen
  check((await readStore(page, 'events')).length === 1, 'Code im Dauerbild wird nur einmal gebucht (Doppelscan-Schutz)');
  check(await page.locator('.lock-banner').isVisible(), 'Scanner zeigt Hinweis „Daten gesperrt“');
  check((await page.locator('.test-panel').count()) === 0, 'Testmodus ohne Anmeldung nicht sichtbar');
  await page.screenshot({ path: `${OUT}/03-scanner-gesperrt.png` });
  await page.getByRole('link', { name: 'Entsperren' }).click();
  await page.getByLabel('Admin-Passwort').fill('falsches-passwort');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByText('Das Passwort ist falsch.').waitFor();
  check(true, 'Falsches Passwort wird abgelehnt');
  await page.getByLabel('Admin-Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('.scanner-page').waitFor();
  check((await page.locator('.lock-banner').count()) === 0, 'Nach dem Entsperren zurück im Scanner, Hinweis weg');
  await ctx.close();

  // Ab hier eine simulierte Kamera ohne QR-Code, damit nur Testscans buchen
  ({ ctx, page } = await openContext());
  await login(page, '/');
  await page.locator('.scanner-page').waitFor();
  overlay = page.locator('.result-overlay');

  const testScan = async (number) => {
    const card = cards.find((c) => c.number === number);
    await page.goto(`${URL}#/`); // nur Hash-Wechsel: kein Neuladen (Neuladen = Neustart = gesperrt)
    await page.locator('.test-panel').evaluate((d) => (d.open = true));
    await page.locator('.test-panel select').selectOption(card.id);
    await page.getByRole('button', { name: 'Karte scannen' }).click();
    await overlay.waitFor();
    await page.waitForTimeout(250);
    const text = await overlay.textContent();
    await overlay.click();
    return text;
  };

  console.log('6) Testscans (angemeldet)');
  const again = await testScan('M-001');
  check(again.includes('Max Mustermann'), 'Entsperrt: Name sichtbar');
  check(again.includes('Bereits erfasst'), 'Doppelscan-Schutz greift auch nach App-Neustart (30 s)');
  const blocked = await testScan('M-006');
  check(blocked.includes('Kein Zutritt') && blocked.includes('gesperrt'), 'Gesperrte Karte wird abgewiesen');
  const free = await testScan('B-003');
  check(free.includes('Kein Zutritt') && free.includes('keiner Person zugeordnet'), 'Freie Besucherkarte wird abgewiesen');

  console.log('7) Gruppe anlegen');
  await page.goto(`${URL}#/einstellungen/gruppen`);
  await page.getByRole('button', { name: '+ Neue Gruppe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Dienstleister');
  await page.getByLabel(/Kürzel/).fill('d');
  await page.getByRole('button', { name: 'Farbe #16a34a' }).click();
  await page.getByRole('button', { name: 'Gruppe anlegen' }).click();
  await page.locator('.group-row').nth(2).waitFor();
  check((await page.locator('.group-row').count()) === 3, 'Neue Gruppe „Dienstleister“ angelegt');

  console.log('8) Karten in Serie erstellen');
  await page.goto(`${URL}#/karten/neu`);
  await page.getByLabel('Gruppe').selectOption({ label: 'Dienstleister (D)' });
  await page.getByLabel('Anzahl').fill('3');
  await page.getByText('D-001').first().waitFor();
  await page.getByRole('button', { name: '3 Karten erstellen' }).click();
  await page.getByText('3 Karten erstellt').waitFor();
  check((await readStore(page, 'cards')).filter((c) => c.number.startsWith('D-')).length === 3, 'D-001 bis D-003 erstellt');

  console.log('9) Besucherkarte zuweisen, scannen, zurückgeben');
  const b3 = cards.find((c) => c.number === 'B-003');
  await page.goto(`${URL}#/karten/${b3.id}`);
  await page.getByRole('button', { name: 'Person zuweisen' }).click();
  await page.getByLabel('Vorname').fill('Berta');
  await page.getByLabel('Nachname').fill('Besuch');
  await page.getByLabel('Firma / Abteilung').fill('Beispiel AG');
  await page.getByRole('button', { name: 'Nur heute' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByText('Gespeichert.').waitFor();
  await page.screenshot({ path: `${OUT}/05-karte-zugewiesen.png`, fullPage: true });
  const assigned = await testScan('B-003');
  check(assigned.includes('Willkommen') && assigned.includes('Berta Besuch'), 'Zugewiesene Besucherkarte erhält Zutritt');
  await page.goto(`${URL}#/karten/${b3.id}`);
  await page.getByRole('button', { name: 'Karte zurückgeben' }).click();
  await page.getByRole('button', { name: 'Person zuweisen' }).waitFor();
  const b3after = (await readStore(page, 'cards')).find((c) => c.id === b3.id);
  const presence = (await readStore(page, 'presence')).find((p) => p.cardId === b3.id);
  check(!b3after.holderEnc && presence?.status === 'out', 'Rückgabe entfernt Personendaten und bucht aus');

  console.log('10) Dashboard (Laptop-Ansicht)');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${URL}#/dashboard`);
  await page.locator('.dash-presence tbody tr').first().waitFor();
  check((await page.locator('.dash-presence tbody tr').count()) === 1, 'Dashboard: eine Person anwesend (Max Mustermann)');
  check((await page.locator('.dash-presence').textContent()).includes('Mustermann'), 'Dashboard: Name in der Anwesenheitsliste');
  await page.locator('.dash-camera .test-panel').evaluate((d) => (d.open = true));
  await page.locator('.dash-camera .test-panel select').selectOption(cards.find((c) => c.number === 'M-002').id);
  await page.locator('.dash-camera').getByRole('button', { name: 'Karte scannen' }).click();
  await page.locator('.result-panel.fresh').waitFor();
  const panel = await page.locator('.result-panel').textContent();
  check(panel.includes('Willkommen') && panel.includes('Erika Musterfrau'), 'Dashboard: Scan-Ergebnis als Feld neben der Kamera');
  await page.locator('.dash-presence tbody tr').nth(1).waitFor();
  check((await page.locator('.dash-presence tbody tr').count()) === 2, 'Dashboard: Anwesenheitsliste aktualisiert sich live');
  const todayRows = await page.locator('.dash-events tbody tr').count();
  check(todayRows === 6, `Dashboard: Aktionen von heute (${todayRows})`);
  await page.locator('.dash-events').getByLabel('Ergebnis').selectOption('denied');
  check((await page.locator('.dash-events tbody tr').count()) === 2, 'Dashboard: Filter „Nur abgewiesen“');
  await page.locator('.dash-events').getByLabel('Ergebnis').selectOption('all');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/06-dashboard-laptop.png` });
  await page.setViewportSize(viewport);
  await page.screenshot({ path: `${OUT}/06b-dashboard-handy.png`, fullPage: true });

  console.log('11) Übersicht: Anwesenheit und Aktionen');
  await page.goto(`${URL}#/uebersicht`);
  await page.locator('.data-table tbody tr').first().waitFor();
  check((await page.locator('.chip-present').textContent()).includes('2'), 'Übersicht: 2 anwesend');
  check((await page.locator('.data-table tbody tr').count()) === 11, 'Übersicht: alle 11 zugeordneten Karten (freie ausgeblendet)');
  await page.getByLabel('Personen suchen').fill('muster');
  check((await page.locator('.data-table tbody tr').count()) === 3, 'Übersicht: Suche „muster“ findet Name und Firma (3)');
  await page.getByLabel('Personen suchen').fill('');
  await page.getByLabel('Status').selectOption('absent');
  check((await page.locator('.data-table tbody tr').count()) === 9, 'Übersicht: Filter „Nur abwesend“');
  await page.getByLabel('Status').selectOption('all');
  await page.getByRole('button', { name: /^Name/ }).click();
  const firstByName = await page.locator('.data-table tbody tr').first().textContent();
  check(firstByName.includes('Beispiel'), 'Übersicht: Sortierung nach Name (Beispiel zuerst)');
  await page.screenshot({ path: `${OUT}/07-uebersicht-anwesenheit.png`, fullPage: true });
  await page.getByRole('button', { name: 'Alle ausbuchen' }).click();
  await page.getByText('2 Person(en) ausgebucht.').waitFor();
  check((await page.locator('.chip-present').textContent()).includes('0'), '„Alle ausbuchen“ bucht alle aus');

  await page.getByRole('tab', { name: 'Aktionen' }).click();
  await page.locator('.data-table.events tbody tr').first().waitFor();
  const actionCount = await page.locator('.data-table.events tbody tr').count();
  check(actionCount === 8, `Aktionen heute: 8 (6 + 2 automatische Ausbuchungen) – gefunden: ${actionCount}`);
  await page.getByLabel('Ergebnis').selectOption('denied');
  check((await page.locator('.data-table tbody tr').count()) === 2, 'Aktionen: Filter „Nur abgewiesen“');
  await page.getByLabel('Ergebnis').selectOption('all');
  await page.getByLabel('Aktionen suchen').fill('Berta');
  check((await page.locator('.data-table tbody tr').count()) === 2, 'Aktionen: Suche nach Name (verschlüsselt gespeichert)');
  await page.getByLabel('Aktionen suchen').fill('');
  await page.getByLabel('Zeitraum').selectOption('yesterday');
  await page.getByText('Keine passenden Aktionen.').waitFor();
  check(true, 'Aktionen: Zeitraum „Gestern“ ist leer');
  await page.getByLabel('Zeitraum').selectOption('today');
  await page.locator('.data-table tbody tr').first().waitFor();
  await page.screenshot({ path: `${OUT}/08-uebersicht-aktionen.png`, fullPage: true });

  console.log('12) Karten drucken');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`${URL}#/karten`);
  await page.getByRole('link', { name: /Drucken \(17\)/ }).click();
  await page.locator('.id-card .qr[src]').first().waitFor();
  check((await page.locator('.id-card').count()) === 16, '16 Karten druckbereit (gesperrte ausgenommen)');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/07-druck.png` });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/karten.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  console.log('  ✓ PDF erzeugt: .e2e/karten.pdf');

  console.log('13) Abmelden und Sperren');
  await page.setViewportSize(viewport);
  await page.goto(`${URL}#/einstellungen`);
  await page.screenshot({ path: `${OUT}/09-einstellungen.png`, fullPage: true });
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.locator('.scanner-page').waitFor();
  check((await page.locator('.lock-banner').count()) === 0, 'Nach Abmelden bleiben die Daten für den Scanner entsperrt');
  await page.goto(`${URL}#/karten`);
  await page.getByRole('heading', { name: 'Anmelden' }).waitFor();
  check(page.url().includes('#/anmelden'), 'Verwaltung nach Abmelden nur mit Passwort');
  await login(page, '/einstellungen');
  await page.getByRole('button', { name: 'Jetzt sperren' }).click();
  await page.locator('.lock-banner').waitFor();
  check(true, '„Jetzt sperren“ sperrt die Daten');

  check(problems.length === 0, `keine JavaScript-Fehler und keine CSP-Verstöße${problems.length ? ': ' + problems.join(' | ') : ''}`);
  await ctx.close();
  console.log('\nAlle E2E-Prüfungen bestanden.');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
