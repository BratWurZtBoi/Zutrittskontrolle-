/**
 * Lokaler End-to-End-Test mit simulierter Kamera (nur Cloud-/Entwicklungsumgebung).
 * Ablauf: Build ausliefern → Testpersonen anlegen → QR-Code eines Ausweises als
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

const readPersons = (page) =>
  page.evaluate(
    () =>
      new Promise((res, rej) => {
        const req = indexedDB.open('zutrittskontrolle');
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const all = req.result.transaction('persons').objectStore('persons').getAll();
          all.onsuccess = () => res(all.result);
        };
      }),
  );

const countEvents = (page) =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open('zutrittskontrolle');
        req.onsuccess = () => {
          const c = req.result.transaction('events').objectStore('events').count();
          c.onsuccess = () => res(c.result);
        };
      }),
  );

const viewport = { width: 412, height: 915 };

try {
  await waitForServer();

  console.log('1) Testpersonen anlegen');
  let ctx = await chromium.launchPersistentContext(PROFILE, { viewport });
  let page = await ctx.newPage();
  await page.goto(`${URL}#/personen`);
  await page.getByRole('button', { name: 'Testpersonen anlegen' }).click();
  await page.locator('.person-row').nth(11).waitFor();
  check((await page.locator('.person-row').count()) === 12, '12 fiktive Testpersonen in der Liste');
  await page.screenshot({ path: `${OUT}/01-personen.png` });
  const persons = await readPersons(page);
  const max = persons.find((p) => p.personnelNo === 'T-001');
  check(max?.lastName === 'Mustermann', 'T-001 ist Max Mustermann');
  await ctx.close();

  console.log('2) Kamerabild mit QR-Code erzeugen');
  const png = `${OUT}/qr.png`;
  const y4m = `${OUT}/camera.y4m`;
  await QRCode.toFile(png, `ZK1:${max.cardToken}`, { errorCorrectionLevel: 'M', margin: 2, width: 420 });
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
  await page.goto(URL);
  const overlay = page.locator('.result-overlay');
  await overlay.waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/02-scan-willkommen.png` });
  check((await overlay.textContent()).includes('Willkommen'), 'Overlay zeigt „Willkommen“');
  check((await overlay.textContent()).includes('Max Mustermann'), 'Overlay zeigt den Namen');
  await page.waitForTimeout(6000); // Code bleibt im Bild → darf nicht erneut buchen
  check((await countEvents(page)) === 1, 'Code im Dauerbild wird nur einmal gebucht (Doppelscan-Schutz)');
  check((await overlay.count()) === 0, 'Overlay blendet sich automatisch aus');
  await page.screenshot({ path: `${OUT}/03-scanner-bereit.png` });

  console.log('4) Testscan eines gesperrten Ausweises');
  await page.locator('.test-panel summary').click();
  const paul = persons.find((p) => p.lastName === 'Platzhalter');
  await page.locator('.test-panel select').selectOption(paul.id);
  await page.getByRole('button', { name: 'Ausweis scannen' }).click();
  await overlay.waitFor();
  const deniedText = await overlay.textContent();
  await page.screenshot({ path: `${OUT}/04-scan-gesperrt.png` });
  check(deniedText.includes('Kein Zutritt') && deniedText.includes('gesperrt'), 'Gesperrter Ausweis wird abgewiesen');
  await overlay.click();

  console.log('5) Anwesenheit & Historie');
  await page.goto(`${URL}#/anwesenheit`);
  await page.locator('.present-item').first().waitFor();
  check((await page.locator('.present-item').count()) === 1, 'Eine Person anwesend');
  check((await page.locator('table.events tbody tr').count()) === 2, 'Zwei Einträge in der Historie');
  await page.screenshot({ path: `${OUT}/05-anwesenheit.png`, fullPage: true });

  console.log('6) Neue Person anlegen');
  await page.goto(`${URL}#/personen/neu`);
  await page.getByLabel('Vorname').fill('Berta');
  await page.getByLabel('Nachname').fill('Beispielhaft');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.locator('.card-section .qr[src]').waitFor();
  check(/#\/personen\/[\w-]+$/.test(page.url()), 'Weiterleitung zur neuen Person mit Ausweis');
  await page.screenshot({ path: `${OUT}/06-person-neu.png`, fullPage: true });

  console.log('7) Ausweise drucken');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`${URL}#/ausweise`);
  await page.locator('.id-card .qr[src]').first().waitFor();
  check((await page.locator('.id-card').count()) === 12, '12 Ausweise (gesperrter ausgenommen)');
  await page.screenshot({ path: `${OUT}/07-ausweise.png` });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/ausweise.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('  ✓ PDF erzeugt: .e2e/ausweise.pdf');

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
