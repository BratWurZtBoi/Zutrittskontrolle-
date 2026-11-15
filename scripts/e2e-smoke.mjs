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

try {
  await waitForServer();

  console.log('1) Testkarten anlegen');
  let ctx = await chromium.launchPersistentContext(PROFILE, { viewport });
  let page = await ctx.newPage();
  await page.goto(`${URL}#/karten`);
  await page.getByRole('button', { name: 'Testkarten anlegen' }).click();
  await page.locator('.card-row').nth(13).waitFor();
  check((await page.locator('.card-row').count()) === 14, '14 fiktive Testkarten (9 Personal, 5 Besucher)');
  await page.screenshot({ path: `${OUT}/01-karten.png`, fullPage: true });
  const cards = await readStore(page, 'cards');
  const max = cards.find((c) => c.number === 'M-001');
  check(max?.holder?.lastName === 'Mustermann', 'M-001 gehört Max Mustermann');
  await ctx.close();

  console.log('2) Kamerabild mit QR-Code erzeugen');
  const png = `${OUT}/qr.png`;
  const y4m = `${OUT}/camera.y4m`;
  await QRCode.toFile(png, `ZK1:${max.token}`, { errorCorrectionLevel: 'M', margin: 2, width: 420 });
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-loop', '1', '-i', png,
    '-vf', 'pad=1280:720:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p',
    '-t', '2', '-r', '10', y4m,
  ]);

  console.log('3) Scanner mit simulierter Kamera');
  ctx = await chromium.launchPersistentContext(PROFILE, {
    viewport,
    permissions: ['camera'],
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${y4m}`,
    ],
  });
  page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept()); // Bestätigungsdialoge annehmen
  await page.goto(URL);
  let overlay = page.locator('.result-overlay');
  await overlay.waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/02-scan-willkommen.png` });
  const welcome = await overlay.textContent();
  check(welcome.includes('Willkommen') && welcome.includes('Max Mustermann'), 'Overlay zeigt „Willkommen“ und den Namen');
  check(welcome.includes('Bestandspersonal'), 'Overlay zeigt die Gruppe');
  await page.waitForTimeout(6000); // Code bleibt im Bild → darf nicht erneut buchen
  check((await readStore(page, 'events')).length === 1, 'Code im Dauerbild wird nur einmal gebucht (Doppelscan-Schutz)');
  check((await overlay.count()) === 0, 'Overlay blendet sich automatisch aus');
  check((await page.locator('.scanner-bar select option').count()) >= 3, 'Kameraauswahl listet die Kamera(s)');
  await page.screenshot({ path: `${OUT}/03-scanner-bereit.png` });
  await ctx.close();

  // Ab hier eine simulierte Kamera ohne QR-Code, damit nur Testscans buchen
  ctx = await chromium.launchPersistentContext(PROFILE, {
    viewport,
    permissions: ['camera'],
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  overlay = page.locator('.result-overlay');

  const testScan = async (number) => {
    const card = cards.find((c) => c.number === number);
    await page.goto(URL);
    await page.locator('.test-panel summary').click();
    await page.locator('.test-panel select').selectOption(card.id);
    await page.getByRole('button', { name: 'Karte scannen' }).click();
    await overlay.waitFor();
    await page.waitForTimeout(250);
    const text = await overlay.textContent();
    await overlay.click();
    return text;
  };

  console.log('4) Testscans: gesperrt und nicht zugeordnet');
  const blocked = await testScan('M-006');
  check(blocked.includes('Kein Zutritt') && blocked.includes('gesperrt'), 'Gesperrte Karte wird abgewiesen');
  const free = await testScan('B-003');
  check(free.includes('Kein Zutritt') && free.includes('keiner Person zugeordnet'), 'Freie Besucherkarte wird abgewiesen');

  console.log('5) Gruppe anlegen');
  await page.goto(`${URL}#/einstellungen/gruppen`);
  await page.getByRole('button', { name: '+ Neue Gruppe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Dienstleister');
  await page.getByLabel(/Kürzel/).fill('d');
  await page.getByRole('button', { name: 'Farbe #16a34a' }).click();
  await page.getByRole('button', { name: 'Gruppe anlegen' }).click();
  await page.locator('.group-row').nth(2).waitFor();
  check((await page.locator('.group-row').count()) === 3, 'Neue Gruppe „Dienstleister“ angelegt');
  await page.screenshot({ path: `${OUT}/04-gruppen.png`, fullPage: true });

  console.log('6) Karten in Serie erstellen');
  await page.goto(`${URL}#/karten/neu`);
  await page.getByLabel('Gruppe').selectOption({ label: 'Dienstleister (D)' });
  await page.getByLabel('Anzahl').fill('3');
  await page.getByText('D-001').first().waitFor();
  await page.getByRole('button', { name: '3 Karten erstellen' }).click();
  await page.getByText('3 Karten erstellt').waitFor();
  check((await readStore(page, 'cards')).filter((c) => c.number.startsWith('D-')).length === 3, 'D-001 bis D-003 erstellt');

  console.log('7) Besucherkarte zuweisen, scannen, zurückgeben');
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
  check(!b3after.holder && presence?.status === 'out', 'Rückgabe entfernt Personendaten und bucht aus');

  console.log('8) Anwesenheit & Historie');
  await page.goto(`${URL}#/anwesenheit`);
  await page.locator('.present-item').first().waitFor();
  check((await page.locator('.present-item').count()) === 1, 'Eine Karte anwesend (Max Mustermann)');
  check((await page.locator('table.events tbody tr').count()) === 5, 'Fünf Einträge in der Historie');
  await page.screenshot({ path: `${OUT}/06-anwesenheit.png`, fullPage: true });

  console.log('9) Karten drucken');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`${URL}#/karten`);
  await page.getByRole('link', { name: /Drucken \(17\)/ }).click();
  await page.locator('.id-card .qr[src]').first().waitFor();
  check((await page.locator('.id-card').count()) === 16, '16 Karten druckbereit (gesperrte ausgenommen)');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/07-druck.png` });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/karten.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('  ✓ PDF erzeugt: .e2e/karten.pdf');

  check(errors.length === 0, `keine JavaScript-Fehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
  console.log('\nAlle E2E-Prüfungen bestanden.');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
