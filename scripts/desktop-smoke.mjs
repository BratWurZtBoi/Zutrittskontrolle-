/**
 * Test des Programms für Windows/Linux (Electron) – startet das echte Programm mit eigenem
 * Datenordner. Unter Linux mit virtuellem Bildschirm: xvfb-run -a npm run desktop:smoke
 * Voraussetzung: npm run build (Ordner dist/).
 * Installiertes Linux-Paket testen: ZK_DESKTOP_EXE=/opt/Zutrittskontrolle/zutrittskontrolle
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let electron;
try {
  ({ _electron: electron } = require('playwright'));
} catch {
  ({ _electron: electron } = require('/opt/node-tools/node_modules/playwright'));
}
const electronPath = require('electron');

const root = resolve('.');
const userData = mkdtempSync(join(tmpdir(), 'zk-desktop-'));
const backupDir = mkdtempSync(join(tmpdir(), 'zk-sicherung-'));
const autostartDir = mkdtempSync(join(tmpdir(), 'zk-autostart-'));
const PASSWORD = 'Test-Passwort-123';
const problems = [];

function check(cond, msg) {
  if (!cond) throw new Error(`FEHLER: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const env = { ...process.env, ZK_USER_DATA_DIR: userData, ZK_AUTOSTART_DIR: autostartDir };
delete env.NODE_OPTIONS; // in Electron nicht erlaubte Optionen der Umgebung
// ZK_DESKTOP_EXE: fertig gepacktes Programm testen (sonst Entwicklungsstart mit „electron .“)
const packaged = process.env.ZK_DESKTOP_EXE;
const flags = ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
const app = await electron.launch({
  executablePath: packaged ?? electronPath,
  args: packaged ? flags : [root, ...flags],
  env,
});
if (packaged) console.log(`(gepacktes Programm: ${packaged})`);

try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => problems.push(`JS-Fehler: ${e.message}`));
  page.on('console', (m) => {
    // die absichtlich gesperrte Internet-Anfrage (Test 1) erzeugt erwartete Meldungen
    if (m.type() === 'error' && !/Failed to load resource|ERR_BLOCKED_BY_CLIENT|example\.com/.test(m.text())) problems.push(`Konsole: ${m.text()}`);
  });
  page.on('dialog', (d) => void d.accept());
  await page.waitForLoadState('domcontentloaded');

  console.log('1) Programm startet');
  check(page.url().startsWith('app://zutrittskontrolle/'), `eigene Herkunft app://zutrittskontrolle (${page.url()})`);
  const info = await page.evaluate(() => window.zkDesktop?.info());
  const expected = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  check(info?.version === expected, `Programm erkannt (Version ${info?.version})`);
  check(info.dataPath === userData, 'Daten im eigenen Programmordner');
  const blocked = await page.evaluate(() => fetch('https://example.com/').then(() => 'erreicht', () => 'gesperrt'));
  check(blocked === 'gesperrt', 'Keine Verbindungen ins Internet');
  const sw = await page.evaluate(() => navigator.serviceWorker?.getRegistrations?.().then((r) => r.length).catch(() => 0) ?? 0);
  check(sw === 0, 'Kein Service Worker im Programm');

  console.log('2) Einrichtung, Datenbank, Verschlüsselung');
  // Startseite leitet ohne Passwort zur Einrichtung weiter
  await page.getByRole('heading', { name: 'Admin-Passwort einrichten' }).waitFor();
  await page.getByLabel('Neues Passwort (mindestens 8 Zeichen)').fill(PASSWORD);
  await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
  await page.getByLabel(/Verstanden/).check();
  await page.getByRole('button', { name: 'Passwort einrichten' }).click();
  await page.locator('.dashboard').waitFor();
  check(true, 'Nach der Einrichtung: Dashboard (kein Kiosk-Scanner als Startseite)');
  await page.evaluate(() => (location.hash = '#/karten'));
  await page.getByRole('button', { name: 'Testkarten anlegen' }).click();
  await page.locator('.card-row').first().waitFor();
  check((await page.locator('.card-row').count()) > 5, 'Testkarten angelegt (IndexedDB + Verschlüsselung)');

  console.log('3) Präsentationsfenster und Scan');
  await page.evaluate(() => (location.hash = '#/einstellungen/scanner'));
  await page.getByLabel(/Testmodus/).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('label')].some((l) => /Testmodus/.test(l.textContent ?? '') && l.querySelector('input')?.checked),
  );
  await page.evaluate(() => (location.hash = '#/dashboard'));
  const [presentation] = await Promise.all([app.waitForEvent('window'), page.getByRole('button', { name: 'Präsentation öffnen' }).click()]);
  presentation.on('pageerror', (e) => problems.push(`JS-Fehler (Präsentation): ${e.message}`));
  await presentation.getByText('Herzlich willkommen').waitFor();
  check(true, 'Präsentationsfenster geöffnet (Ruhebildschirm)');
  await page.getByText('Präsentation läuft').waitFor({ timeout: 10000 });
  check(true, 'Dashboard erkennt das Präsentationsfenster');
  await page.locator('.dash-side .test-panel').evaluate((d) => (d.open = true));
  const erika = await page.locator('.dash-side .test-panel select option', { hasText: 'Erika Musterfrau' }).getAttribute('value');
  await page.locator('.dash-side .test-panel select').selectOption(erika);
  await page.locator('.dash-side').getByRole('button', { name: 'Karte scannen' }).click();
  await presentation.locator('.presentation-result', { hasText: 'Erika Musterfrau' }).waitFor({ timeout: 5000 });
  check(true, 'Scan erscheint auf dem Gästebildschirm');
  const cameraOk = await page
    .locator('.dash-cam .camera-message')
    .waitFor({ state: 'detached', timeout: 10000 })
    .then(() => true, () => false);
  check(cameraOk, 'Kamera ohne Rückfrage freigegeben');

  // USB-Scanner (Tastatur-Modus): Hauptfenster hat nach dem Öffnen der Präsentation die Tastatur
  const token = await page.evaluate(
    () =>
      new Promise((res, rej) => {
        const req = indexedDB.open('zutrittskontrolle-daten');
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const all = req.result.transaction('cards').objectStore('cards').getAll();
          all.onsuccess = () => res(all.result.find((c) => c.number === 'M-001')?.token);
        };
      }),
  );
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.keyboard.type(`ZK1:${token}`, { delay: 4 });
  await page.keyboard.press('Enter');
  await presentation.locator('.presentation-result', { hasText: 'Max Mustermann' }).waitFor({ timeout: 5000 });
  check(true, 'Scan per USB-Scanner (Tastatur) gebucht und auf dem Gästebildschirm angezeigt');

  console.log('4) Automatische Sicherung in einen Ordner');
  const bad = await page.evaluate(() => window.zkDesktop.backupWrite('../boese.txt', 'x').then(() => 'geschrieben', () => 'abgelehnt'));
  check(bad === 'abgelehnt', 'Schreiben außerhalb des Sicherungsordners wird abgelehnt');
  // Ordnerauswahl-Dialog ersetzen (im Test kann niemand klicken)
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, backupDir);
  await page.evaluate(() => (location.hash = '#/einstellungen/datensicherung'));
  await page.getByRole('button', { name: 'Ordner wählen …' }).click();
  await page.getByText(/Ordner: „/).waitFor();
  await page.getByLabel('Passwort für die automatischen Sicherungen (mindestens 8 Zeichen)').fill('Sicherung-123');
  await page.getByLabel('Passwort für die automatischen Sicherungen wiederholen').fill('Sicherung-123');
  await page.getByRole('button', { name: 'Automatische Sicherung einschalten' }).click();
  await page.getByText(/erste Sicherung gespeichert/).waitFor({ timeout: 20000 });
  const files = readdirSync(backupDir);
  check(files.length === 1 && /^zutrittskontrolle-backup-.*\.zkb$/.test(files[0]), `Sicherung im Ordner (${files.join(', ')})`);

  console.log('5) Allgemein & Gerät');
  await page.evaluate(() => (location.hash = '#/einstellungen/allgemein'));
  const label = process.platform === 'linux' ? 'Linux-Programm' : 'Windows-Programm';
  await page.getByText(label, { exact: true }).waitFor();
  check(true, `Als „${label}“ erkannt`);
  check((await page.locator('code.path').textContent()) === userData, 'Datenordner wird angezeigt');
  if (process.platform === 'linux') {
    const autostart = page.getByLabel('Beim Anmelden automatisch starten');
    await autostart.click();
    await page.waitForFunction(() => document.querySelector('input[type=checkbox]:checked') !== null);
    const entry = join(autostartDir, 'zutrittskontrolle.desktop');
    check(existsSync(entry) && /Exec=".+" --ozone-platform=x11/.test(readFileSync(entry, 'utf8')), 'Linux: Autostart-Eintrag angelegt');
    await autostart.click();
    await page.waitForFunction(() => document.querySelector('input[type=checkbox]:checked') === null);
    check(!existsSync(entry), 'Linux: Autostart-Eintrag wieder entfernt');
  }
  await page.screenshot({ path: join(root, '.e2e', 'desktop-geraet.png') });

  check(problems.length === 0, `keine JavaScript-Fehler${problems.length ? ': ' + problems.join(' | ') : ''}`);
  console.log(`\n${process.platform === 'linux' ? 'Linux' : 'Windows'}-Programm: alle Prüfungen bestanden.`);
} catch (err) {
  console.error(err);
  for (const [i, w] of app.windows().entries()) await w.screenshot({ path: join(root, '.e2e', `desktop-fehler-${i}.png`) }).catch(() => undefined);
  if (problems.length) console.error(problems.join('\n'));
  process.exitCode = 1;
} finally {
  await app.close().catch(() => undefined);
  if (existsSync(userData)) writeFileSync(join(userData, '.test-ende'), '');
}
