/**
 * Lokaler End-to-End-Test mit simulierter Kamera (nur Cloud-/Entwicklungsumgebung).
 * Ablauf: Build ausliefern → Testkarten anlegen → QR-Code einer Karte als
 * Kamerabild einspeisen → prüfen, dass der Scanner bucht und anzeigt.
 * Voraussetzungen: `npm run build`, Playwright + Chromium, ffmpeg.
 * Aufruf: npm run e2e:local   (Screenshots landen in .e2e/)
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const navLabels = (await page.locator('.app-nav .nav-link').allTextContents()).map((t) => t.trim());
  check(navLabels.join(' | ') === 'Dashboard | Auswertung | Karten | Einstellungen | Notfall | Abmelden', `Menü ohne Kiosk-Scanner, Auswertung neben dem Dashboard, roter Notfall-Knopf (${navLabels.join(' | ')})`);
  await page.goto(`${URL}#/`);
  await page.locator('.dashboard').waitFor();
  check(true, 'Startseite ohne Kiosk-Modus: Dashboard');
  await page.goto(`${URL}#/uebersicht`);
  await page.getByRole('heading', { name: 'Auswertung' }).waitFor();
  check(page.url().includes('#/auswertung'), 'Alte Adresse „Übersicht“ führt zur Auswertung');

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
  await page.goto(`${URL}#/einstellungen/scanner`);
  await page.getByLabel(/Testmodus/).click();
  await page.locator('input[type=checkbox]:checked').filter({ has: page.locator('xpath=self::*') }).first().waitFor();
  await page.waitForTimeout(300);
  check(await page.getByLabel(/Testmodus/).isChecked(), 'Testmodus eingeschaltet');
  // Kiosk-Modus (Gerät am Eingang ohne Bediener) für die folgenden Kiosk-Prüfungen einschalten
  // gesteuertes Kontrollkästchen (Wert kommt aus der Datenbank): klicken und auf den neuen Zustand warten
  await page.getByLabel(/Kiosk-Modus für dieses Gerät/).click();
  await page.waitForFunction(() => [...document.querySelectorAll('label')].some((l) => l.textContent?.includes('Kiosk-Modus für dieses Gerät') && l.querySelector('input')?.checked));
  check(true, 'Kiosk-Modus eingeschaltet');
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
  await page.setViewportSize({ width: 1536, height: 780 });
  await page.goto(`${URL}#/dashboard`);
  const listRows = page.locator('.dash-list tbody tr');
  await listRows.first().waitFor();
  check((await listRows.count()) === 1, 'Dashboard: eine Person anwesend (Max Mustermann)');
  check((await page.locator('.dash-list').textContent()).includes('Mustermann'), 'Dashboard: Name in der Anwesenheitsliste');
  check((await page.getByTestId('kpi-present').textContent()).trim() === '1', 'Statusleiste: 1 anwesend');
  const boxOf = (sel) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
  const chipLabels = async () => (await page.locator('.dash-list .group-chips .chip').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  const statusBox = await boxOf('.dash-status');
  const presentBox = await boxOf('.ds-present');
  const toolbarBox = await boxOf('.dash-toolbar');
  check((await chipLabels()).join(' | ') === 'Alle 1 | Bestandspersonal 1', `Gruppenknöpfe mit Anzahl, nur Gruppen mit Anwesenden (${(await chipLabels()).join(' | ')})`);
  check((await page.locator('.ds-denied').textContent()).includes('abgewiesen'), 'Statusleiste: „abgewiesen“ immer an derselben Stelle');
  await page.locator('.dash-side .test-panel').evaluate((d) => (d.open = true));
  await page.locator('.dash-side .test-panel select').selectOption(cards.find((c) => c.number === 'M-002').id);
  await page.locator('.dash-side').getByRole('button', { name: 'Karte scannen' }).click();
  await page.locator('.result-panel.fresh').waitFor();
  const panel = await page.locator('.result-panel').textContent();
  check(panel.includes('Willkommen') && panel.includes('Erika Musterfrau'), 'Dashboard: Scan-Ergebnis neben der Liste');
  await listRows.nth(1).waitFor();
  check((await listRows.count()) === 2, 'Dashboard: Anwesenheitsliste aktualisiert sich live');
  await page.waitForFunction(() => document.querySelector('[data-testid="kpi-present"]')?.textContent?.trim() === '2');
  check(true, 'Statusleiste zählt live mit (2 anwesend)');
  check((await chipLabels()).join(' | ') === 'Alle 2 | Bestandspersonal 2', 'Gruppenknöpfe zählen live mit');
  check(
    (await boxOf('.dash-status')) === statusBox && (await boxOf('.ds-present')) === presentBox && (await boxOf('.dash-toolbar')) === toolbarBox,
    `Statusleiste und Werkzeugzeile bleiben gleich groß (${statusBox}, Anwesend ${presentBox})`,
  );
  check((await page.locator('.dash-recent').count()) === 0, 'Kein doppelter Kasten „Letzte Scans“ mehr');
  const rowHeight = await listRows.first().evaluate((r) => r.getBoundingClientRect().height);
  check(rowHeight < 52, `Eine Zeile pro Person (${Math.round(rowHeight)} px hoch)`);
  await page.getByRole('tab', { name: /Aktionen heute/ }).click();
  const todayRows = await listRows.count();
  check(todayRows === 6, `Dashboard: Aktionen von heute (${todayRows})`);
  await page.getByRole('tab', { name: /Abgewiesen/ }).click();
  check((await listRows.count()) === 2, 'Dashboard: Reiter „Abgewiesen“');
  await page.locator('.dash-list').getByRole('radio', { name: 'Besucher' }).click();
  check((await listRows.count()) === 1, 'Dashboard: Gruppenfilter gilt auch für Abgewiesene');
  await page.locator('.dash-list').getByRole('radio', { name: 'Alle' }).click();
  await page.getByRole('tab', { name: /Anwesend/ }).click();
  await page.getByRole('button', { name: /Weitere Filter/ }).click();
  await page.locator('.dash-more-filters').getByLabel('Status').selectOption('all');
  check((await listRows.count()) > 2, 'Weitere Filter: auch Abwesende anzeigen');
  await page.locator('.dash-more-filters').getByLabel('Status').selectOption('present');
  check((await page.locator('.dash-more-filters').getByRole('link', { name: /Auswertung/ }).count()) === 1, 'Weitere Filter: Link „Ältere Einträge … in der Auswertung“');
  await page.getByRole('tab', { name: /Aktionen heute/ }).click();
  const rangeOptions = await page.locator('.dash-more-filters').getByLabel('Zeitraum').locator('option').allTextContents();
  check(rangeOptions.join(',') === 'Heute,Gestern', `Dashboard: Zeitraum nur Heute/Gestern (${rangeOptions.join(', ')})`);
  await page.getByRole('tab', { name: /Anwesend/ }).click();
  const scrollers = await page.evaluate(() =>
    [...document.querySelectorAll('.dash-list *')].filter((el) => {
      const st = getComputedStyle(el);
      return /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1;
    }).map((el) => `${el.tagName}.${el.className} ${el.scrollHeight}/${el.clientHeight}`),
  );
  check(scrollers.length === 0, `Kein Scrollbereich innerhalb der Liste (nur die Seite scrollt) ${scrollers.join(', ')}`);
  await page.locator('.dash-cam').getByRole('radio', { name: 'Vorschau aus' }).click();
  await page.locator('.dash-cam-cover').waitFor();
  check(true, 'Kameravorschau ausblendbar');
  await page.locator('.dash-cam').getByRole('radio', { name: 'Klein' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/06-dashboard-laptop.png` });
  await page.setViewportSize(viewport);
  await page.screenshot({ path: `${OUT}/06b-dashboard-handy.png`, fullPage: true });

  console.log('11) Auswertung: Anwesenheit und Protokoll');
  await page.goto(`${URL}#/auswertung`);
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

  await page.getByRole('tab', { name: 'Protokoll' }).click();
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
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV-Export (Excel)' }).click(),
  ]);
  const csvPath = `${OUT}/${csvDownload.suggestedFilename()}`;
  await csvDownload.saveAs(csvPath);
  const csv = readFileSync(csvPath, 'utf8');
  check(/^zutritt-protokoll-\d{4}-\d{2}-\d{2}\.csv$/.test(csvDownload.suggestedFilename()), 'CSV-Export: Dateiname mit Datum');
  check(csv.startsWith('\uFEFFDatum;Uhrzeit;Karte;Name;Gruppe;Richtung;Ergebnis;Grund;Quelle;Bestätigt von\r\n'), 'CSV-Export: Excel-Format (BOM, Semikolon)');
  check(csv.includes('Berta Besuch') && csv.split('\r\n').length === 10, 'CSV-Export: 8 Aktionen mit Namen');

  console.log('12) Backup erstellen, Daten löschen, Backup einspielen');
  await page.goto(`${URL}#/einstellungen/datensicherung`);
  await page.getByLabel('Backup-Passwort (mindestens 8 Zeichen)').fill('Backup-Test-123');
  await page.getByLabel('Backup-Passwort wiederholen').fill('Backup-Test-123');
  const [backupDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup erstellen und speichern' }).click(),
  ]);
  const backupPath = `${OUT}/${backupDownload.suggestedFilename()}`;
  await backupDownload.saveAs(backupPath);
  check(backupDownload.suggestedFilename().endsWith('.zkb'), `Backup-Datei erstellt (${backupDownload.suggestedFilename()})`);
  check(!/Mustermann|Besuch|Musterfirma/.test(readFileSync(backupPath, 'utf8')), 'Backup-Datei enthält keine Klartextdaten');
  await page.getByText('Backup gespeichert:').waitFor();
  await page.goto(`${URL}#/einstellungen/daten`);
  await page.getByRole('button', { name: 'Alle Daten löschen' }).click();
  await page.getByText(/Alle Daten gelöscht/).waitFor();
  check((await readStore(page, 'cards')).length === 0, 'Alle Daten gelöscht');
  await page.goto(`${URL}#/einstellungen/datensicherung`);
  // so kommt die Datei per Quick Share an: gleicher Inhalt, Endung .zkb.txt
  const sharedPath = `${backupPath}.txt`;
  writeFileSync(sharedPath, readFileSync(backupPath));
  await page.locator('#bk-file').setInputFiles(sharedPath);
  await page.getByLabel('Backup-Passwort', { exact: true }).fill('falsches-Passwort');
  await page.getByRole('button', { name: 'Backup öffnen' }).click();
  await page.getByText('Das Passwort ist falsch.').waitFor();
  check(true, 'Backup: falsches Passwort wird abgelehnt');
  await page.getByLabel('Backup-Passwort', { exact: true }).fill('Backup-Test-123');
  await page.getByRole('button', { name: 'Backup öffnen' }).click();
  await page.locator('.import-preview').waitFor();
  check((await page.locator('.import-preview').textContent()).includes('17 Karte(n)'), 'Backup-Vorschau zeigt 17 Karten');
  await page.screenshot({ path: `${OUT}/10-backup-vorschau.png`, fullPage: true });
  await page.getByLabel('Ich möchte die Daten auf diesem Gerät ersetzen').check();
  await page.getByRole('button', { name: 'Jetzt wiederherstellen' }).click();
  await page.getByText(/Backup eingespielt: 17 Karte/).waitFor();
  await page.goto(`${URL}#/karten`);
  await page.locator('.card-row').nth(16).waitFor();
  check((await page.locator('.card-row').count()) === 17, 'Nach dem Einspielen: 17 Karten');
  check((await page.locator('.card-list').textContent()).includes('Mustermann'), 'Nach dem Einspielen: Namen wieder lesbar');
  check(!/Mustermann/.test(JSON.stringify(await readStore(page, 'cards'))), 'Nach dem Einspielen: wieder verschlüsselt gespeichert');

  console.log('13) Mehrfachauswahl: Besucherdaten entfernen, Karten löschen');
  await page.goto(`${URL}#/karten`);
  await page.getByRole('button', { name: 'Auswählen' }).click();
  await page.getByLabel('Karte B-001 auswählen').check();
  await page.getByLabel('Karte B-002 auswählen').check();
  await page.getByRole('button', { name: 'Personendaten entfernen' }).click();
  await page.getByText('Personendaten von 2 Karte(n) entfernt.').waitFor();
  const afterReturn = await readStore(page, 'cards');
  check(['B-001', 'B-002'].every((n) => !afterReturn.find((c) => c.number === n).holderEnc), 'Personendaten von B-001 und B-002 entfernt');
  await page.getByLabel('Gruppe').selectOption({ label: 'Dienstleister' });
  await page.getByLabel(/Alle angezeigten/).check();
  check((await page.locator('.selection-count').textContent()).includes('3'), '„Alle angezeigten“ wählt 3 Karten');
  await page.screenshot({ path: `${OUT}/11-mehrfachauswahl.png`, fullPage: true });
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.getByText('3 Karte(n) gelöscht.').waitFor();
  check((await readStore(page, 'cards')).length === 14, 'Drei Karten per Mehrfachauswahl gelöscht (14 übrig)');
  await page.getByRole('button', { name: 'Auswahl beenden' }).click();

  console.log('14) CSV-Import mit Vorlage');
  await page.goto(`${URL}#/karten/import`);
  check((await page.locator('.card-tabs a.active').textContent()).includes('CSV-Import'), 'Karten-Bereich mit Reitern (CSV-Import aktiv)');
  const [templateDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Vorlage herunterladen' }).click(),
  ]);
  const templatePath = `${OUT}/${templateDownload.suggestedFilename()}`;
  await templateDownload.saveAs(templatePath);
  const template = readFileSync(templatePath, 'utf8');
  check(template.startsWith('﻿Kartennummer;Gruppe;Vorname;Nachname;Firma/Abteilung;Notiz;Zutritt erlaubt;Gültig ab;Gültig bis'), 'Vorlage mit Kopfzeile heruntergeladen');
  const importCsv = [
    'Kartennummer;Gruppe;Vorname;Nachname;Firma/Abteilung;Notiz;Zutritt erlaubt;Gültig ab;Gültig bis',
    ';Besucher;Anna;Import;Import GmbH;;ja;;',
    ';M;Ben;Import;Lager;;ja;;31.12.2030',
    'B-004;;Clara;Import;;Zuweisung;ja;;',
    ';Hausmeister;Udo;Unbekannt;;;ja;;',
    ';;Nora;Ohnegruppe;Extern AG;;nein;;',
    'X-9;;Fehler;Zeile;;;ja;;',
  ].join('\r\n');
  const importPath = `${OUT}/import.csv`;
  // wie Excel „CSV (Trennzeichen-getrennt)“: Windows-1252 statt UTF-8
  writeFileSync(importPath, Buffer.from(importCsv.replace('Gültig', 'Gültig'), 'latin1'));
  await page.locator('#csv-file').setInputFiles(importPath);
  await page.locator('.import-table tbody tr').nth(5).waitFor();
  const chips = await page.locator('.summary-chips').textContent();
  check(
    chips.includes('2 neue Karte(n)') && chips.includes('1 Zuweisung(en)') && chips.includes('2 nicht zugeordnet') && chips.includes('1 Fehler'),
    'Import-Vorschau: 2 neu, 1 Zuweisung, 2 nicht zugeordnet, 1 Fehler',
  );
  const previewText = await page.locator('.import-table').textContent();
  check(previewText.includes('Gruppe „Hausmeister“ gibt es nicht – später zuordnen.') && previewText.includes('Ohne Gruppe – später zuordnen.'), 'Ohne bzw. mit unbekannter Gruppe → „Nicht zugeordnet“');
  check(previewText.includes('Karte X-9 gibt es nicht'), 'Import-Vorschau zeigt Fehlergrund');
  await page.screenshot({ path: `${OUT}/12-import-vorschau.png`, fullPage: true });
  await page.getByRole('button', { name: '5 Zeile(n) importieren' }).click();
  await page.getByText('Import abgeschlossen').waitFor();
  check((await page.locator('.success-box').textContent()).includes('2 Person(en) unter „Nicht zugeordnet“ abgelegt'), 'Import: 2 Personen unter „Nicht zugeordnet“');
  await page.getByRole('link', { name: 'Nicht zugeordnete Personen zuordnen' }).click();
  await page.locator('.card-tabs a.active', { hasText: 'Nicht zugeordnet' }).waitFor();
  const waitingList = page.locator('[aria-label="Nicht zugeordnete Personen"] .card-list');
  await waitingList.locator('.card-row').nth(1).waitFor();
  const waitingText = await waitingList.textContent();
  check(waitingText.includes('Udo Unbekannt') && waitingText.includes('Gruppe „Hausmeister“ unbekannt') && waitingText.includes('kein Zutritt'), 'Reiter „Nicht zugeordnet“ mit Hinweisen');
  const unassignedEvents = (await readStore(page, 'unassigned')).length;
  check(unassignedEvents === 2 && (await readStore(page, 'unassigned')).every((u) => u.holderEnc && !u.holder), 'Nicht zugeordnete Personen verschlüsselt gespeichert');
  await waitingList.locator('.card-row', { hasText: 'Nora Ohnegruppe' }).click();
  await page.getByLabel('Gruppe für die Zuordnung').selectOption({ label: 'Besucher' });
  await page.getByText(/1 freie Karte\(n\) von „Besucher“/).waitFor();
  await page.screenshot({ path: `${OUT}/12b-nicht-zugeordnet.png`, fullPage: true });
  await page.getByRole('button', { name: 'Zuordnen', exact: true }).click();
  const assignedMsg = page.locator('.form-success', { hasText: 'zugeordnet' });
  await assignedMsg.waitFor();
  const assignedText = await assignedMsg.textContent();
  check(/Nora Ohnegruppe → B-\d+/.test(assignedText) && !assignedText.includes('neue Karte'), `Zugeordnet: freie Besucherkarte verwendet (${assignedText.match(/B-\d+/)?.[0]})`);
  const noraCard = (await readStore(page, 'cards')).find((c) => c.number === assignedText.match(/B-\d+/)?.[0]);
  check(noraCard?.holderEnc && noraCard.nameEnc && noraCard.accessGranted === false, 'Karte hat die Personendaten und „kein Zutritt“ aus dem Import');
  await waitingList.locator('.card-row', { hasText: 'Udo Unbekannt' }).click();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.getByText('Keine nicht zugeordneten Personen.').waitFor();
  check((await readStore(page, 'unassigned')).length === 0, 'Person aus „Nicht zugeordnet“ gelöscht');
  await page.goto(`${URL}#/karten`);
  await page.locator('.card-row').nth(15).waitFor();
  const listText = await page.locator('.card-list').textContent();
  check((await page.locator('.card-row').count()) === 16, 'Nach dem Import: 16 Karten');
  check(listText.includes('Anna Import') && listText.includes('Ben Import') && listText.includes('Clara Import'), 'Importierte Personen in der Kartenliste');

  console.log('15) Präsentationsansicht auf zweitem Bildschirm');
  const presentation = await ctx.newPage();
  presentation.on('pageerror', (e) => problems.push(`JS-Fehler (Präsentation): ${e.message}`));
  await presentation.setViewportSize({ width: 1280, height: 720 });
  await presentation.goto(`${URL}#/praesentation`);
  await presentation.getByText('Herzlich willkommen').waitFor();
  check((await presentation.locator('.presentation-idle').textContent()).includes('Musterfirma'), 'Präsentation: Ruhebildschirm mit Organisationsname');
  await presentation.screenshot({ path: `${OUT}/13-praesentation-warten.png` });
  // „Alle Daten löschen“ im Backup-Schritt hat Testmodus und Kiosk-Modus zurückgesetzt
  await page.goto(`${URL}#/einstellungen/scanner`);
  await page.getByLabel(/Testmodus/).click();
  await page.waitForTimeout(300);
  await page.getByLabel(/Kiosk-Modus für dieses Gerät/).click();
  await page.waitForFunction(() => [...document.querySelectorAll('label')].some((l) => l.textContent?.includes('Kiosk-Modus für dieses Gerät') && l.querySelector('input')?.checked));
  await page.goto(`${URL}#/dashboard`);
  await page.getByText('Präsentation läuft').waitFor({ timeout: 5000 });
  check(true, 'Dashboard erkennt das geöffnete Präsentationsfenster');
  await page.locator('.dash-side .test-panel').evaluate((d) => (d.open = true));
  await page.locator('.dash-side .test-panel select').selectOption(cards.find((c) => c.number === 'M-002').id);
  await page.locator('.dash-side').getByRole('button', { name: 'Karte scannen' }).click();
  await presentation.locator('.presentation-result').waitFor({ timeout: 5000 });
  const shown = await presentation.locator('.presentation-result').textContent();
  check(shown.includes('Willkommen') && shown.includes('Erika Musterfrau'), 'Präsentation zeigt dem Gast „Willkommen“ und den Namen');
  await presentation.screenshot({ path: `${OUT}/14-praesentation-ergebnis.png` });
  await presentation.close();
  await page.getByRole('button', { name: 'Präsentation öffnen' }).waitFor({ timeout: 5000 });
  check(true, 'Nach dem Schließen bietet das Dashboard „Präsentation öffnen“ an');

  console.log('16) Dunkles Layout');
  await page.goto(`${URL}#/einstellungen/allgemein`);
  await page.getByLabel('Darstellung').selectOption('dark');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  check(true, 'Dunkles Layout aktiv');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg !== 'rgb(241, 245, 249)', `Hintergrund ist dunkel (${bg})`);
  await page.screenshot({ path: `${OUT}/15-dunkel-einstellungen.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${URL}#/dashboard`);
  await page.locator('.dash-list tbody tr').first().waitFor();
  await page.screenshot({ path: `${OUT}/16-dunkel-dashboard.png` });
  await page.goto(`${URL}#/auswertung`);
  await page.locator('.data-table tbody tr').first().waitFor();
  await page.screenshot({ path: `${OUT}/17-dunkel-uebersicht.png` });
  await page.setViewportSize(viewport);
  await page.goto(`${URL}#/karten`);
  await page.locator('.card-row').first().waitFor();
  await page.screenshot({ path: `${OUT}/18-dunkel-karten.png` });

  console.log('17) Karten drucken (Druck bleibt hell)');
  await page.setViewportSize({ width: 1100, height: 900 });
  check((await page.getByRole('link', { name: /Drucken \(\d+\)/ }).count()) === 0, 'Kartenliste ohne doppelten Druckknopf – gedruckt wird über den Reiter');
  await page.locator('.card-tabs').getByRole('link', { name: 'Drucken' }).click();
  await page.locator('.card-view .cv-qr[src]').first().waitFor();
  check((await page.locator('.card-view').count()) === 15, '15 Karten druckbereit (gesperrte ausgenommen)');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/19-druck-dunkel.png` });
  await page.emulateMedia({ media: 'print' });
  const printBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(printBg === 'rgb(255, 255, 255)', 'Druckansicht ist auch im dunklen Layout weiß');
  await page.pdf({ path: `${OUT}/karten.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  console.log('  ✓ PDF erzeugt: .e2e/karten.pdf');
  await page.goto(`${URL}#/einstellungen/allgemein`);
  await page.getByLabel('Darstellung').selectOption('auto');

  console.log('17b) Bestätigung von Eintritten und Bediener-PIN');
  await page.setViewportSize({ width: 1536, height: 780 });
  await page.goto(`${URL}#/einstellungen/bediener`);
  await page.getByLabel(/Neue PIN/).fill('482913');
  await page.getByLabel('PIN wiederholen').fill('482913');
  await page.getByRole('button', { name: 'PIN speichern' }).click();
  await page.getByText('Bediener-Zugang eingerichtet.').waitFor();
  check(true, 'Bediener-PIN eingerichtet');
  await page.goto(`${URL}#/einstellungen/gruppen`);
  await page.locator('.group-list li', { hasText: 'Besucher' }).getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel(/Eintritt muss bestätigt werden/).check();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.locator('.group-list li', { hasText: 'Besucher' }).getByText('Eintritt wird bestätigt').waitFor();
  check(true, 'Gruppe Besucher: Eintritt muss bestätigt werden');

  await page.goto(`${URL}#/dashboard`);
  await page.locator('.dash-status').getByRole('radio', { name: 'Eingang' }).click();
  await page.locator('.dash-side .test-panel').evaluate((d) => (d.open = true));
  const optionValue = (name) => page.locator('.dash-side .test-panel select option', { hasText: name }).getAttribute('value');
  const felix = await optionValue('Anna Import');
  const eventsBefore = (await readStore(page, 'events')).length;
  await page.locator('.dash-side .test-panel select').selectOption(felix);
  await page.locator('.dash-side').getByRole('button', { name: 'Karte scannen' }).click();
  await page.locator('.pending-panel').waitFor();
  check((await page.locator('.pending-panel').textContent()).includes('Anna Import'), 'Dashboard: Anfrage „Bestätigung erforderlich“ mit Name');
  check((await readStore(page, 'events')).length === eventsBefore, 'Vor der Bestätigung wird nichts gebucht');
  await page.screenshot({ path: `${OUT}/20-bestaetigung.png` });
  await page.locator('body').click({ position: { x: 900, y: 600 } }); // Fokus aus dem Auswahlfeld nehmen
  await page.keyboard.press('Enter');
  await page.locator('.pending-panel').waitFor({ state: 'detached' });
  await page.locator('.result-panel.fresh', { hasText: 'Willkommen' }).waitFor();
  const felixEvent = (await readStore(page, 'events')).at(-1);
  check(felixEvent?.outcome === 'granted' && felixEvent?.confirmedBy === 'admin', 'Enter = Einlassen, im Protokoll als bestätigt vermerkt');

  const mia = await optionValue('Clara Import');
  await page.locator('.dash-side .test-panel select').selectOption(mia);
  await page.locator('.dash-side').getByRole('button', { name: 'Karte scannen' }).click();
  await page.locator('.pending-panel').waitFor();
  await page.locator('body').click({ position: { x: 900, y: 600 } });
  await page.keyboard.press('Escape');
  await page.locator('.result-panel.fresh', { hasText: 'Kein Zutritt' }).waitFor();
  check((await page.locator('.result-panel').textContent()).includes('Vom Empfang abgewiesen'), 'Esc = Abweisen');
  await page.locator('.dash-status').getByRole('radio', { name: 'Automatisch' }).click();

  await page.goto(`${URL}#/`);
  await page.locator('.scanner-page .test-panel').evaluate((d) => (d.open = true));
  await page.locator('.scanner-page .test-panel select').selectOption(mia);
  await page.locator('.scanner-page').getByRole('button', { name: 'Karte scannen' }).click();
  await page.locator('.result-overlay').waitFor();
  check((await page.locator('.result-overlay').textContent()).includes('am Empfang melden'), 'Kiosk-Scanner ohne Bediener: „Bitte am Empfang melden“');
  await page.locator('.result-overlay').click();
  await page.locator('.result-overlay').waitFor({ state: 'detached' });

  // Bediener-Anmeldung
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.locator('.app-nav').getByRole('link', { name: 'Anmelden' }).waitFor();
  await page.locator('.app-nav').getByRole('link', { name: 'Anmelden' }).click();
  await page.getByRole('heading', { name: 'Anmelden' }).waitFor();
  await page.screenshot({ path: `${OUT}/21-anmelden-bediener.png` });
  await page.getByLabel('Bediener-PIN').fill('111111');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByText('Die PIN ist falsch.').waitFor();
  await page.getByLabel('Bediener-PIN').fill('482913');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('.dashboard').waitFor();
  check((await page.locator('.role-badge').textContent()) === 'Bediener', 'Bediener mit PIN angemeldet – Dashboard geöffnet');
  const navText = await page.locator('.app-nav').textContent();
  check(!navText.includes('Karten') && !navText.includes('Einstellungen') && navText.includes('Auswertung'), 'Bediener sieht nur Dashboard und Auswertung');
  check((await page.locator('.dash-side .test-panel').count()) === 0, 'Testmodus bleibt dem Admin vorbehalten');
  await page.goto(`${URL}#/auswertung`);
  await page.locator('.data-table tbody tr').first().waitFor();
  check((await page.getByRole('button', { name: /CSV-Export/ }).count()) === 0, 'Bediener: kein CSV-Export');
  await page.goto(`${URL}#/karten`);
  await page.getByText('Diese Seite ist nur für den Admin').waitFor();
  check(page.url().includes('#/anmelden'), 'Bediener: Karten nur mit Admin-Passwort');
  await page.getByLabel('Admin-Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('.card-row').first().waitFor();
  check((await page.locator('.role-badge').count()) === 0, 'Admin-Anmeldung aus der Bediener-Sitzung heraus');

  console.log('17c) Verlorene Karte melden und Ersatzkarte ausstellen');
  await page.goto(`${URL}#/karten`);
  await page.locator('.card-row', { hasText: 'Ben Import' }).click();
  await page.getByRole('button', { name: 'Als verloren melden' }).click();
  await page.locator('.lost-box').waitFor();
  check((await page.locator('.card-section .badge-lost').textContent()) === 'Verloren', 'Karte als verloren gemeldet (gesperrt, Status „Verloren“)');
  const lostCardUrl = page.url();
  await page.goto(`${URL}#/dashboard`);
  await page.locator('.dash-side .test-panel').evaluate((d) => (d.open = true));
  const ben = await page.locator('.dash-side .test-panel select option', { hasText: 'Ben Import' }).getAttribute('value');
  await page.locator('.dash-side .test-panel select').selectOption(ben);
  await page.locator('.dash-side').getByRole('button', { name: 'Karte scannen' }).click();
  await page.locator('.result-panel.result-lost').waitFor();
  const lostPanel = await page.locator('.result-panel').textContent();
  check(lostPanel.includes('Verlorene Karte!') && lostPanel.includes('Ben Import'), 'Dashboard: Warnung „Verlorene Karte!“ mit Name');
  await page.screenshot({ path: `${OUT}/22-verlorene-karte.png` });
  await page.goto(`${URL}#/`);
  await page.locator('.scanner-page .test-panel').evaluate((d) => (d.open = true));
  await page.locator('.scanner-page .test-panel select').selectOption(ben);
  await page.locator('.scanner-page').getByRole('button', { name: 'Karte scannen' }).click();
  await page.locator('.result-overlay').waitFor();
  const guestText = await page.locator('.result-overlay').textContent();
  check(guestText.includes('Bitte wenden Sie sich an den Empfang') && !guestText.includes('Ben') && !guestText.includes('verloren'), 'Gast sieht weder Grund noch Name');
  await page.locator('.result-overlay').click();
  await page.goto(lostCardUrl);
  await page.getByRole('button', { name: 'Ersatzkarte ausstellen' }).click();
  await page.getByText(/Ersatzkarte M-\d+ ausgestellt/).waitFor();
  check((await page.getByLabel('Vorname').inputValue()) === 'Ben', 'Ersatzkarte übernimmt die Person');
  check((await page.locator('.card-section .hint').textContent()).includes('Ersatz für die verlorene Karte'), 'Ersatzkarte verweist auf die verlorene Karte');

  console.log('17d) Gästebildschirm gestalten: Scan-Anzeige und Ruhebildschirm getrennt, Elemente frei');
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto(`${URL}#/einstellungen/praesentation`);
  await page.getByRole('button', { name: '+ Neue Scan-Anzeige' }).click();
  await page.locator('.pe').waitFor();
  await page.getByLabel('Name des Layouts').fill('Empfang Personal');
  await page.getByRole('tab', { name: 'Allgemein' }).click();
  await page.getByLabel('Vorlage anwenden (ersetzt die Elemente)').selectOption('side');
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('radio', { name: 'Einfarbig' }).click();
  await page.locator('.ce-design input[type="color"]').first().fill('#7c3aed');
  await page.getByLabel(/Eigener Hintergrund mit farbigem Streifen/).check();
  await page.getByRole('tab', { name: 'Texte' }).click();
  await page.getByLabel('Eingang – Titel').fill('Hallo {vorname}!');
  await page.locator('.ce-canvas .pv-text', { hasText: 'Hallo Erika!' }).waitFor();
  check(true, 'Editor: Live-Vorschau mit Platzhaltern (fiktive Beispieldaten)');
  // neues Textfeld, nur beim Eingang sichtbar
  await page.getByRole('tab', { name: 'Hinzufügen' }).click();
  await page.locator('.ce-tile', { hasText: 'Freier Text' }).click();
  const elementEditor = page.locator('.ce-edit');
  await elementEditor.getByLabel('Inhalt').fill('Schön, dass Sie da sind');
  for (const name of ['Ausgang', 'Kein Zutritt', 'Bitte warten / Hinweis']) await elementEditor.getByLabel(name, { exact: true }).uncheck();
  const topOf = async () => Number((await elementEditor.locator('.ce-grid label', { hasText: 'oben' }).locator('input').inputValue()).replace(',', '.'));
  const yStart = await topOf();
  await page.locator('.ce-canvas .pv-selected').scrollIntoViewIfNeeded();
  const dragBox = await page.locator('.ce-canvas .pv-selected').boundingBox();
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2 - 70, { steps: 10 });
  await page.mouse.up();
  const yDragged = await topOf();
  check(yDragged < yStart - 12, `Textfeld per Ziehen verschoben (oben ${yStart} % → ${yDragged} %)`);
  await page.locator('.ce-canvas .presentation').focus();
  await page.keyboard.press('Shift+ArrowUp');
  await page.waitForFunction((y) => Number(document.querySelector('.ce-edit .ce-grid label:nth-child(2) input')?.value.replace(',', '.')) === y, yDragged - 5);
  check(true, 'Feinschritte mit den Pfeiltasten');
  const sizeBefore = await page.locator('.ce-canvas .pv-selected').boundingBox();
  const seHandle = await page.locator('.ce-canvas .pv-selected .cv-handle-se').boundingBox();
  await page.mouse.move(seHandle.x + seHandle.width / 2, seHandle.y + seHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(seHandle.x - 60, seHandle.y + 10, { steps: 6 });
  await page.mouse.up();
  const sizeAfter = await page.locator('.ce-canvas .pv-selected').boundingBox();
  check(sizeAfter.width < sizeBefore.width - 20, 'Größe am Anfasser geändert');
  await page.keyboard.press('Control+z');
  await page.waitForFunction((w) => (document.querySelector('.ce-canvas .pv-selected')?.getBoundingClientRect().width ?? 0) > w + 20, sizeAfter.width);
  check(true, 'Strg+Z macht die Größenänderung rückgängig');
  await page.getByRole('tab', { name: 'Hinzufügen' }).click();
  const elementCount = await page.locator('.ce .element-list li').count();
  await page.locator('.ce-tile', { hasText: 'Datum' }).click();
  await elementEditor.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('tab', { name: 'Hinzufügen' }).click();
  check((await page.locator('.ce .element-list li').count()) === elementCount, 'Element hinzufügen und entfernen');
  await page.getByRole('radio', { name: 'Ausgang' }).click();
  check((await page.locator('.ce-canvas .pv-hidden-here').count()) === 1, 'Vorschau „Ausgang“: Eingangs-Text ausgeblendet');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByText('Gespeichert.').waitFor();
  await page.screenshot({ path: `${OUT}/23-layout-editor.png` });
  check(true, 'Scan-Anzeige gespeichert');
  await page.getByRole('button', { name: 'Fertig' }).click();

  // eigener Ruhebildschirm – unabhängig von der Scan-Anzeige
  await page.getByRole('button', { name: '+ Neuer Ruhebildschirm' }).click();
  await page.getByLabel('Name des Layouts').fill('Betriebsfest');
  await page.locator('.ce-tile', { hasText: 'Freier Text' }).click();
  await page.locator('.ce-edit').getByLabel('Inhalt').fill('Heute ab 15 Uhr: Sommerfest');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByText('Gespeichert.').waitFor();
  await page.screenshot({ path: `${OUT}/23b-ruhebildschirm-editor.png` });
  await page.getByRole('button', { name: 'Fertig' }).click();
  const partyRow = page.locator('.layout-row', { hasText: 'Betriebsfest' });
  await partyRow.getByRole('button', { name: 'Aktivieren' }).click();
  await partyRow.getByText('aktiv', { exact: true }).waitFor();
  check(true, 'Eigener Ruhebildschirm aktiviert');
  await page.screenshot({ path: `${OUT}/23c-praesentation-uebersicht.png`, fullPage: true });

  await page.goto(`${URL}#/einstellungen/gruppen`);
  await page.locator('.group-list li', { hasText: 'Bestandspersonal' }).getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel('Scan-Anzeige (Gästebildschirm)').selectOption({ label: 'Empfang Personal' });
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.locator('.group-list li', { hasText: 'Bestandspersonal' }).getByText('Layout „Empfang Personal“').waitFor();
  check(true, 'Scan-Anzeige der Gruppe Bestandspersonal zugewiesen');

  const guestScreen = await ctx.newPage();
  guestScreen.on('pageerror', (e) => problems.push(`JS-Fehler (Präsentation): ${e.message}`));
  await guestScreen.setViewportSize({ width: 1280, height: 720 });
  await guestScreen.goto(`${URL}#/praesentation`);
  await guestScreen.getByText('Heute ab 15 Uhr: Sommerfest').waitFor();
  check(true, 'Gästebildschirm zeigt den eigenen Ruhebildschirm');
  await guestScreen.screenshot({ path: `${OUT}/24a-ruhebildschirm.png` });
  await page.goto(`${URL}#/dashboard`);
  await page.locator('.dash-status').getByRole('radio', { name: 'Eingang' }).click();
  await page.locator('.dash-side .test-panel').evaluate((d) => (d.open = true));
  // eine Karte, die vorher noch nicht gescannt wurde (kein Doppelscan-Schutz)
  const hans = await page.locator('.dash-side .test-panel select option', { hasText: 'Hans Beispiel' }).getAttribute('value');
  await page.locator('.dash-side .test-panel select').selectOption(hans);
  await page.locator('.dash-side').getByRole('button', { name: 'Karte scannen' }).click();
  await guestScreen.locator('.presentation-result').waitFor({ timeout: 5000 });
  const guestShown = await guestScreen.locator('.presentation-result').textContent();
  check(guestShown.includes('Hallo Hans!') && guestShown.includes('Schön, dass Sie da sind') && !guestShown.includes('Sommerfest'), `Scan-Anzeige mit eigenen Textfeldern, ohne Ruhebildschirm-Inhalt (${guestShown})`);
  const photoBox = await guestScreen.locator('.pv-photo-box').boundingBox();
  check(photoBox && photoBox.x < 1280 * 0.25, 'Vorlage „Foto links“');
  const bgColor = await guestScreen.locator('.presentation-result').evaluate((el) => getComputedStyle(el).backgroundColor);
  check(bgColor === 'rgb(124, 58, 237)', `Eigener Hintergrund (${bgColor})`);
  await guestScreen.screenshot({ path: `${OUT}/24-praesentation-layout.png` });
  await guestScreen.getByText('Heute ab 15 Uhr: Sommerfest').waitFor({ timeout: 10000 });
  check(true, 'Nach der Anzeige zurück zum Ruhebildschirm');
  await guestScreen.close();
  await page.locator('.dash-status').getByRole('radio', { name: 'Automatisch' }).click();

  console.log('17e) Manuell buchen, rückgängig, Besucher-Schnellerfassung, Notfallliste');
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto(`${URL}#/dashboard`);
  const kpi = async () => Number((await page.getByTestId('kpi-present').textContent()).trim());
  const presentBefore = await kpi();
  await page.locator('.dash-list').getByLabel('Suchen').fill('Testmann');
  const tomRow = page.locator('.dash-list tbody tr', { hasText: 'Testmann' });
  await tomRow.waitFor();
  check((await tomRow.textContent()).includes('abwesend'), 'Suche zeigt auch Abwesende');
  await tomRow.getByRole('button', { name: 'Einbuchen' }).click();
  await page.locator('.result-panel.fresh', { hasText: 'Tom Testmann' }).waitFor();
  const manualPanel = await page.locator('.result-panel').textContent();
  check(manualPanel.includes('(manuell)') && manualPanel.includes('Tom Testmann'), `Manuell eingebucht (Karte vergessen) – ${manualPanel}`);
  await page.waitForFunction((n) => Number(document.querySelector('[data-testid="kpi-present"]')?.textContent) === n + 1, presentBefore);
  const manualEvent = (await readStore(page, 'events')).at(-1);
  check(manualEvent?.source === 'manual' && manualEvent?.confirmedBy === 'admin', 'Protokoll: Quelle „manuell“');
  await page.locator('.result-panel').getByRole('button', { name: /Rückgängig/ }).click();
  await page.locator('.result-panel.fresh', { hasText: 'Korrigiert' }).waitFor();
  await page.waitForFunction((n) => Number(document.querySelector('[data-testid="kpi-present"]')?.textContent) === n, presentBefore);
  const evs = await readStore(page, 'events');
  check(evs.at(-1)?.reason === 'CORRECTION' && evs.at(-2)?.correctedBy === evs.at(-1)?.seq, 'Rückgängig: Gegenbuchung, beide Einträge bleiben');
  await page.locator('.dash-list').getByLabel('Suchen').fill('');

  await page.getByRole('button', { name: '+ Besucher anmelden' }).click();
  const dialog = page.getByRole('dialog', { name: 'Besucher anmelden' });
  await dialog.waitFor();
  const visitorCard = await dialog.getByLabel('Karte').locator('option:checked').textContent();
  check(/^B-\d+$/.test(visitorCard), `Erste freie Besucherkarte vorgeschlagen (${visitorCard})`);
  await dialog.getByLabel('Vorname').fill('Vera');
  await dialog.getByLabel('Nachname').fill('Vorab');
  await dialog.getByLabel('Firma / Abteilung').fill('Beispiel AG');
  await page.screenshot({ path: `${OUT}/25-besucher-anmelden.png` });
  await dialog.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByText(`Besucher angemeldet: Vera Vorab → Karte ${visitorCard}`).waitFor();
  const veraRow = page.locator('.dash-list tbody tr', { hasText: 'Vorab, Vera' });
  await veraRow.waitFor();
  check(true, 'Besucher angemeldet und gleich eingebucht (ohne Bestätigung, der Bediener bucht selbst)');
  await veraRow.getByRole('button', { name: 'Zurückgeben' }).click();
  await page.getByText(`Karte zurückgegeben: Vera Vorab`).waitFor();
  await veraRow.waitFor({ state: 'detached' });
  check(true, 'Besucherkarte zurückgegeben (ausgebucht, Personendaten entfernt)');

  // Roter Knopf: Notfallliste sofort drucken. Druckdialog simuliert – ms = wie lange er offen ist
  // (am Computer blockiert print(), bis der Dialog geschlossen wird; auf dem Handy nicht).
  const stubPrint = (ms) =>
    page.evaluate((ms) => {
      window.__printed = 0;
      window.print = () => {
        window.__printed++;
        const t = performance.now();
        while (performance.now() - t < ms) {
          /* Dialog offen */
        }
      };
    }, ms);
  await stubPrint(0);
  const emergencyButton = page.locator('.dash-status .btn-emergency');
  check((await emergencyButton.evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(220, 38, 38)', 'Knopf „Notfallliste“ ist rot');
  await emergencyButton.click();
  await page.getByRole('heading', { name: /Notfall- \/ Evakuierungsliste/ }).waitFor();
  await page.waitForFunction(() => window.__printed === 1);
  check(true, 'Roter Knopf öffnet sofort den Druckdialog');
  check(page.url().endsWith('#/notfallliste'), 'Adresse ohne „drucken“ – Zurück/Neuladen druckt nicht noch einmal');
  const emergencyRows = await page.locator('.emergency-table tbody tr').count();
  check(emergencyRows === presentBefore, `Notfallliste: alle ${emergencyRows} Anwesenden`);
  await page.screenshot({ path: `${OUT}/26-notfallliste.png`, fullPage: true });
  await page.locator('.emergency-page').getByRole('button', { name: 'Zurück' }).click();
  await page.locator('.dashboard').waitFor();
  await stubPrint(600);
  await page.locator('.app-nav .nav-emergency').click();
  await page.waitForFunction(() => window.__printed === 1 && location.hash === '#/dashboard');
  check(true, '„Notfall“ im Menü: drucken, nach dem Schließen des Dialogs zurück zum Dashboard');

  await page.goto(`${URL}#/einstellungen/datensicherung`);
  await page.getByRole('heading', { name: 'Automatische Sicherung' }).waitFor();
  check(true, 'Einstellungen: automatische Sicherung angeboten');
  check(await page.locator('.settings-nav').isVisible(), 'Computer: Seitenleiste mit allen Bereichen');
  await page.locator('.settings-nav').getByRole('link', { name: 'Scanner' }).click();
  await page.getByLabel(/Testmodus/).waitFor();
  check(true, 'Seitenleiste wechselt den Bereich');
  await page.screenshot({ path: `${OUT}/28-einstellungen-computer.png` });

  console.log('17f) Kartenlayout: neuer Editor, Formate, Rückseite, Druckarten');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${URL}#/einstellungen/karten`);
  await page.getByRole('button', { name: '+ Neues Kartenlayout' }).click();
  await page.locator('.ce').waitFor();
  await page.getByLabel('Name des Kartenlayouts').fill('Besucher hoch');
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('radio', { name: 'Hochformat' }).click(); // Rückfrage „Vorlage übernehmen?“ → OK
  await page.locator('.ce-canvas .card-view.card-portrait').waitFor();
  check((await page.locator('.ce-canvas .cv-el').count()) >= 8, 'Hochformat: passende Vorlage übernommen');

  await page.getByRole('tab', { name: 'Hinzufügen' }).click();
  await page.locator('.ce-tile', { hasText: 'Freier Text' }).click();
  await page.getByRole('tab', { name: 'Bearbeiten', selected: true }).waitFor();
  await page.getByLabel('Inhalt').fill('Bitte gut sichtbar tragen');
  await page.locator('.ce-canvas .cv-text', { hasText: 'Bitte gut sichtbar tragen' }).waitFor();
  check(true, 'Baustein „Freier Text“ hinzugefügt und beschriftet');
  await page.locator('.ce-insert').getByRole('button', { name: '+ Kartennummer' }).click();
  check((await page.getByLabel('Inhalt').inputValue()).includes('{karte}'), 'Platzhalter per Knopf eingefügt');

  const mmValue = async (label) => Number((await page.locator('.ce-grid label', { hasText: label }).locator('input').inputValue()).replace(',', '.'));
  const top0 = await mmValue('oben');
  await page.locator('.ce-canvas .cv-selected').scrollIntoViewIfNeeded();
  let box = await page.locator('.ce-canvas .cv-selected').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 80, { steps: 8 });
  await page.mouse.up();
  const top1 = await mmValue('oben');
  check(top1 < top0 - 3, `Element auf der Karte verschoben (oben ${top0} → ${top1} mm)`);

  const width0 = await mmValue('Breite');
  const handle = await page.locator('.ce-canvas .cv-selected .cv-handle-w').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, { steps: 6 });
  await page.mouse.up();
  const width1 = await mmValue('Breite');
  check(width1 < width0 - 3, `Breite am Anfasser geändert (${width0} → ${width1} mm)`);
  await page.locator('.ce-topbar').click({ position: { x: 5, y: 5 } }); // Fokus aus Eingabefeldern
  await page.keyboard.press('Control+z');
  await page.waitForFunction((w) => Number(document.querySelector('.ce-grid label:nth-child(3) input')?.value.replace(',', '.')) === w, width0);
  check(true, 'Strg+Z macht die Größenänderung rückgängig');
  check((await mmValue('oben')) === top1, 'Rückgängig betrifft nur den letzten Zieh-Vorgang (Position bleibt)');
  await page.getByRole('button', { name: 'Wiederholen' }).click();
  await page.waitForFunction((w) => Number(document.querySelector('.ce-grid label:nth-child(3) input')?.value.replace(',', '.')) === w, width1);
  check(true, 'Wiederholen stellt sie wieder her');

  await page.getByRole('tab', { name: 'Hinzufügen' }).click();
  await page.locator('.ce .element-list').getByRole('button', { name: 'QR-Code' }).click();
  check((await page.locator('.ce-edit').textContent()).includes('Mindestens 18'), 'QR-Code: Mindestgröße wird angezeigt');
  await page.getByRole('radio', { name: 'Ohne Person', exact: true }).click();
  check((await page.locator('.ce-canvas .cv-hidden-here').count()) > 0, 'Vorschau ohne Person: Namensfelder ausgeblendet');

  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByLabel('Kartengröße').selectOption('a7');
  await page.locator('.ce-format-pill', { hasText: 'A7 hoch · 74 × 105 mm' }).waitFor();
  check(true, 'Format A7 hoch gewählt');
  await page.getByLabel('Rückseite gestalten').check();
  await page.locator('.ce-canvas .card-back .cv-text', { hasText: 'Bei Fund' }).waitFor();
  check(true, 'Rückseite angelegt (Vorschlag mit Hinweis bei Fund)');
  await page.getByRole('tab', { name: 'Allgemein' }).click();
  await page.getByRole('checkbox', { name: 'Besucher' }).check();
  await page.screenshot({ path: `${OUT}/29-kartenlayout-editor.png` });

  // ungespeicherte Änderungen: Navigation fragt nach
  page.removeAllListeners('dialog');
  let leaveQuestion = '';
  page.once('dialog', (d) => {
    leaveQuestion = d.message();
    void d.dismiss();
  });
  await page.locator('.app-nav').getByRole('link', { name: 'Karten' }).click();
  await page.waitForTimeout(300);
  check(leaveQuestion.includes('ungespeicherte') && page.url().includes('#/einstellungen/karten'), 'Verlassen mit ungespeicherten Änderungen fragt nach');
  page.on('dialog', (d) => void d.accept());

  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByText('Gespeichert.').waitFor();
  await page.getByRole('button', { name: 'Fertig' }).click();
  const row = page.locator('.layout-row', { hasText: 'Besucher hoch' });
  await row.waitFor();
  check((await row.textContent()).includes('A7 hoch') && (await row.textContent()).includes('mit Rückseite'), 'Liste zeigt Format und Rückseite');
  const savedLayout = (await readStore(page, 'cardLayouts')).find((l) => l.name === 'Besucher hoch');
  const visitorGroupNow = (await readStore(page, 'groups')).find((g) => g.prefix === 'B');
  check(savedLayout?.format === 'a7' && savedLayout.back?.elements.length > 0 && visitorGroupNow.cardLayoutId === savedLayout.id, 'Gespeichert: A7, Rückseite, Gruppe Besucher zugewiesen');

  await page.goto(`${URL}#/druck`);
  await page.locator('.print-sheet .card-view .cv-qr[src]').first().waitFor();
  const a7Cards = await page.locator('.print-sheet .card-view.card-format-a7').count();
  const id1Cards = await page.locator('.print-sheet .card-view.card-format-id1').count();
  check(a7Cards > 0 && id1Cards > 0, `Druck: Besucher als A7 (${a7Cards}), übrige als Scheckkarte (${id1Cards}) – auf getrennten Seiten`);
  await page.screenshot({ path: `${OUT}/30-druck-layouts.png`, fullPage: true });
  await page.locator('.print-options').getByLabel('Gruppe').selectOption({ label: 'Besucher' });
  await page.waitForFunction(() => document.querySelectorAll('.print-sheet .card-view.card-format-id1').length === 0);
  check((await page.locator('.print-sheet .card-view.card-format-a7').count()) === a7Cards, 'Druck: Gruppenfilter (nur Besucher)');
  await page.locator('.print-options').getByLabel('Gruppe').selectOption('');
  const pdfBoxes = async () => {
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: 'screen' });
    return [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  };
  const near = (a, b) => Math.abs(a - b) < 2;
  const isA4 = ([w, h]) => (near(w, 595.3) && near(h, 841.9)) || (near(w, 841.9) && near(h, 595.3));

  await page.getByRole('radio', { name: 'Beidseitig' }).click();
  await page.locator('.sheet-label', { hasText: 'Rückseiten' }).first().waitFor();
  const duplexSheets = await page.locator('.print-sheet').count();
  check((await page.locator('.print-sheet .card-back').count()) === a7Cards, `Beidseitig: Rückseiten auf eigenen Seiten (${duplexSheets} Seiten)`);
  const duplexBoxes = await pdfBoxes();
  check(duplexBoxes.length === duplexSheets && duplexBoxes.every(isA4), `PDF beidseitig: ${duplexBoxes.length} A4-Seiten`);
  await page.getByRole('radio', { name: 'Zum Falten' }).click();
  await page.locator('.sheet-label', { hasText: 'zum Falten' }).first().waitFor();
  check((await page.locator('.print-sheet .card-back').count()) === a7Cards, 'Zum Falten: Rück- und Vorderseite nebeneinander');
  await page.screenshot({ path: `${OUT}/30b-druck-falten.png`, fullPage: true });

  await page.getByRole('radio', { name: 'Beidseitig' }).click();
  await page.getByRole('button', { name: 'Probeseite zum Nachmessen' }).click();
  await page.locator('.test-sheet').nth(1).waitFor();
  check((await page.locator('.test-sheet .test-ruler').count()) === 2 && (await page.locator('.test-sheet').count()) === 2, 'Probeseite mit Linealen, beidseitig mit Rückseite zum Prüfen der Ausrichtung');
  await page.getByRole('button', { name: 'Zurück zu den Karten' }).click();

  // nach dem Drucken: als gedruckt markieren, danach „nur noch nicht gedruckte“
  await page.getByRole('radio', { name: 'Ohne Rückseite' }).click();
  await page.getByRole('button', { name: 'Drucken / PDF' }).click();
  await page.getByRole('button', { name: 'Ja, als gedruckt markieren' }).click();
  await page.getByText(/Karte\(n\) als gedruckt markiert/).waitFor();
  const printedNow = (await readStore(page, 'cards')).filter((c) => c.printedAt).length;
  check(printedNow === a7Cards + id1Cards, `Nach Rückfrage als gedruckt markiert (${printedNow})`);
  await page.goto(`${URL}#/karten`);
  await page.locator('.card-row').first().waitFor();
  await page.getByLabel('Zuordnung').selectOption('unprinted');
  const unprintedRows = await page.locator('.card-row').count();
  check(unprintedRows === (await readStore(page, 'cards')).filter((c) => !c.printedAt).length, `Kartenliste: Filter „Noch nicht gedruckt“ (${unprintedRows})`);
  await page.locator('.card-tabs').getByRole('link', { name: 'Drucken' }).click();
  await page.locator('.print-page').waitFor();
  check((await page.locator('.card-tabs a.active').textContent()).includes('Drucken'), 'Reiter im Karten-Bereich: Drucken');

  await page.getByRole('radio', { name: 'Kartendrucker' }).click();
  await page.getByRole('radio', { name: 'Beidseitig' }).click();
  await page.locator('.print-cardpage .card-back').first().waitFor();
  const boxes = await pdfBoxes();
  const quer = boxes.filter(([w, h]) => near(w, 242.6) && near(h, 153.1)).length;
  const a7 = boxes.filter(([w, h]) => near(w, 209.8) && near(h, 297.6)).length;
  check(quer === id1Cards * 2 && a7 === a7Cards * 2, `Kartendrucker beidseitig: je Kartenseite eine Seite in Kartengröße (${quer} Scheckkarte, ${a7} A7, ${boxes.length} Seiten)`);
  await page.getByRole('radio', { name: 'Ohne Rückseite' }).click();
  await page.getByRole('radio', { name: 'A4-Bogen' }).click();

  console.log('17g) USB-Scanner (Tastatur-Modus)');
  await page.setViewportSize({ width: 1536, height: 900 });
  const scanGroups = await readStore(page, 'groups');
  const staffGroup = scanGroups.find((g) => g.prefix === 'M');
  const visitorGroup = scanGroups.find((g) => g.prefix === 'B');
  const usable = (c) => !c.blocked && !c.lostAt && !c.validFrom && !c.validUntil && c.accessGranted !== false;
  const scanCards = await readStore(page, 'cards');
  const staffCards = scanCards.filter((c) => c.groupId === staffGroup.id && c.holderEnc && usable(c));
  const presentIds = new Set((await readStore(page, 'presence')).filter((p) => p.status === 'in').map((p) => p.cardId));
  // Besucher mit Person, gerade abwesend → Eintritt muss bestätigt werden (Regel aus 17b)
  const waitingVisitor = scanCards.find((c) => c.groupId === visitorGroup.id && c.holderEnc && usable(c) && !presentIds.has(c.id));
  check(staffCards.length >= 4 && waitingVisitor, `Testkarten für den Scanner (${staffCards.map((c) => c.number).join(', ')}, ${waitingVisitor?.number})`);
  const codeOf = (c) => `ZK1:${c.token}`;
  const swapYZ = (t) => t.replace(/[YZ]/g, (ch) => (ch === 'Y' ? 'Z' : 'Y'));
  /** Scanner simulieren: Zeichen sehr schnell, danach Enter. */
  const scannerType = async (target, text) => {
    await target.keyboard.type(text, { delay: 4 });
    await target.keyboard.press('Enter');
  };
  /** Wartet, bis die letzte Buchung zu dieser Karte gehört. */
  const lastBookingFor = async (number) => {
    for (let i = 0; i < 50; i++) {
      const ev = (await readStore(page, 'events')).at(-1);
      if (ev?.cardNumber === number) return ev;
      await page.waitForTimeout(100);
    }
    return (await readStore(page, 'events')).at(-1);
  };
  const blur = (target) => target.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));

  await page.goto(`${URL}#/einstellungen/scanner`);
  await page.getByRole('heading', { name: 'USB-Scanner' }).waitFor();
  // Doppelscan-Schutz für diesen Abschnitt aus – die Karten wurden teils eben erst gebucht
  await page.getByLabel('Doppelscan-Schutz (Sekunden)').fill('0');
  await page.getByLabel('Doppelscan-Schutz (Sekunden)').blur();
  await page.waitForTimeout(300);
  const eventsBeforeTest = (await readStore(page, 'events')).length;
  await blur(page);
  await scannerType(page, codeOf(staffCards[0]));
  const testResult = page.getByTestId('scanner-test-result');
  await testResult.waitFor();
  await page.waitForFunction((n) => document.querySelector('[data-testid="scanner-test-result"]')?.textContent?.includes(`Karte ${n}`), staffCards[0].number);
  check((await testResult.textContent()).includes('erkannt'), `Scanner-Test erkennt Karte ${staffCards[0].number}`);
  await scannerType(page, `YK1:${swapYZ(staffCards[0].token)}`);
  await page.getByText('wurde automatisch korrigiert').waitFor();
  check(true, 'Scanner-Test: falsches Tastaturlayout (US) erkannt und korrigiert');
  await page.getByLabel('Scannen mit').focus();
  await scannerType(page, 'https://example.com/fremd');
  await page.getByText('Kein Karten-Code dieser Anwendung').waitFor();
  check((await page.getByLabel('Scannen mit').inputValue()) === 'both', 'Fremder Code: erkannt, Auswahlliste bleibt unverändert');
  check((await readStore(page, 'events')).length === eventsBeforeTest, 'Im Scanner-Test wird nichts gebucht');
  await page.screenshot({ path: `${OUT}/31-scanner-test.png`, fullPage: true });

  await page.goto(`${URL}#/dashboard`);
  await page.locator('.dash-cam').waitFor();
  await blur(page);
  await scannerType(page, codeOf(staffCards[0]));
  let lastEvent = await lastBookingFor(staffCards[0].number);
  check(lastEvent?.source === 'scanner' && lastEvent?.cardNumber === staffCards[0].number && lastEvent?.outcome === 'granted', 'Dashboard: Scan vom USB-Scanner gebucht (Quelle „Scanner“)');

  const search = page.locator('.dash-list').getByLabel('Suchen');
  await search.fill('xyz');
  await search.focus();
  await scannerType(page, codeOf(staffCards[1]));
  lastEvent = await lastBookingFor(staffCards[1].number);
  check(lastEvent?.cardNumber === staffCards[1].number && lastEvent?.source === 'scanner', `Scan bei aktivem Suchfeld wird gebucht (${lastEvent?.cardNumber})`);
  check((await search.inputValue()) === 'xyz', 'Suchfeld bleibt unverändert (gescannte Zeichen entfernt)');
  await search.fill('');

  await blur(page);
  await scannerType(page, codeOf(waitingVisitor));
  await page.locator('.pending-panel').waitFor();
  check((await page.locator('.pending-panel').textContent()).includes(waitingVisitor.number), 'Besucherkarte per Scanner: Bestätigung erforderlich');
  const eventsWhilePending = (await readStore(page, 'events')).length;
  await scannerType(page, codeOf(staffCards[2]));
  await lastBookingFor(staffCards[2].number);
  await page.waitForTimeout(300);
  check(await page.locator('.pending-panel').isVisible(), 'Enter des Scanners löst „Einlassen“ nicht aus');
  const afterPending = await readStore(page, 'events');
  check(
    afterPending.length === eventsWhilePending + 1 && afterPending.at(-1)?.cardNumber === staffCards[2].number,
    `Nur der zweite Scan wurde gebucht, die wartende Besucherkarte nicht (${afterPending.slice(eventsWhilePending).map((e) => `${e.cardNumber} ${e.outcome} ${e.reason}`).join(', ')})`,
  );
  await blur(page);
  await page.keyboard.press('Escape');
  await page.locator('.pending-panel').waitFor({ state: 'detached' });

  // Gästebildschirm aktiv (zuletzt angeklickt) → Scan wird ans Dashboard weitergereicht
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Präsentation öffnen' }).click();
  const guest = await popupPromise;
  guest.on('pageerror', (e) => problems.push(`JS-Fehler (Präsentation): ${e.message}`));
  await guest.locator('.presentation-idle').waitFor();
  await page.getByText('Präsentation läuft').waitFor({ timeout: 5000 });
  await scannerType(guest, codeOf(staffCards[3]));
  lastEvent = await lastBookingFor(staffCards[3].number);
  await guest.locator('.presentation-result').waitFor({ timeout: 5000 });
  check(lastEvent?.cardNumber === staffCards[3].number && lastEvent?.source === 'scanner', 'Scan im Präsentationsfenster wird an das Dashboard weitergereicht und gebucht');
  await guest.close();

  // Nur USB-Scanner: Kiosk ohne Kamera
  await page.goto(`${URL}#/einstellungen/scanner`);
  await page.getByLabel('Scannen mit').selectOption('scanner');
  await page.waitForTimeout(300);
  await page.goto(`${URL}#/`);
  await page.locator('.scanner-only').waitFor();
  check((await page.locator('.scanner-page video').count()) === 0, 'Kiosk „Nur USB-Scanner“: Kamera ausgeschaltet');
  await page.screenshot({ path: `${OUT}/32-kiosk-nur-scanner.png` });
  await blur(page);
  await scannerType(page, codeOf(staffCards[0]));
  await page.locator('.result-overlay').waitFor();
  lastEvent = await lastBookingFor(staffCards[0].number);
  check(lastEvent?.source === 'scanner' && lastEvent?.cardNumber === staffCards[0].number, `Kiosk: Scan gebucht (${lastEvent?.outcome}, ${lastEvent?.direction ?? lastEvent?.reason})`);
  await page.locator('.result-overlay').click();
  await page.goto(`${URL}#/dashboard`);
  await page.locator('.dash-scanner').waitFor();
  check((await page.locator('.dash-side video').count()) === 0, 'Dashboard „Nur USB-Scanner“: Statusanzeige statt Kamera');
  await page.goto(`${URL}#/einstellungen/scanner`);
  await page.getByLabel('Scannen mit').selectOption('both');
  await page.getByLabel('Doppelscan-Schutz (Sekunden)').fill('30');
  await page.getByLabel('Doppelscan-Schutz (Sekunden)').blur();
  await page.waitForTimeout(300);

  console.log('18) Abmelden und Sperren');
  await page.setViewportSize(viewport);
  await page.goto(`${URL}#/einstellungen`);
  await page.locator('.settings-tile').first().waitFor();
  check((await page.locator('.settings-tile').count()) === 9, 'Einstellungen: aufgeräumte Übersicht mit 9 Bereichen');
  check((await page.locator('.settings-group h2').allTextContents()).join(' | ') === 'Betrieb | Gestaltung | Daten & Sicherheit | Allgemein & Gerät', 'Einstellungen in Gruppen gegliedert');
  await page.screenshot({ path: `${OUT}/27-einstellungen-handy.png`, fullPage: true });
  await page.locator('.settings-tile', { hasText: 'Sicherheit' }).click();
  await page.getByRole('link', { name: '← Einstellungen' }).waitFor();
  check(true, 'Handy: Bereich mit „← Einstellungen“ zurück zur Übersicht');
  await page.getByRole('link', { name: '← Einstellungen' }).click();
  await page.locator('.settings-tile').first().waitFor();
  
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.locator('.scanner-page').waitFor();
  check((await page.locator('.lock-banner').count()) === 0, 'Nach Abmelden bleiben die Daten für den Scanner entsperrt');
  await page.goto(`${URL}#/karten`);
  await page.getByRole('heading', { name: 'Anmelden' }).waitFor();
  check(page.url().includes('#/anmelden'), 'Verwaltung nach Abmelden nur mit Passwort');
  await login(page, '/einstellungen/sicherheit');
  await page.getByRole('button', { name: 'Jetzt sperren' }).click();
  await page.locator('.lock-banner').waitFor();
  check(true, '„Jetzt sperren“ sperrt die Daten');

  // Kiosk-Modus wieder aus: Abmelden führt zur Anmeldung, im Menü kein Kiosk
  await login(page, '/einstellungen/scanner');
  await page.getByLabel(/Kiosk-Modus für dieses Gerät/).click();
  await page.waitForFunction(() => [...document.querySelectorAll('label')].some((l) => l.textContent?.includes('Kiosk-Modus für dieses Gerät') && !l.querySelector('input')?.checked));
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.getByRole('heading', { name: 'Anmelden' }).waitFor();
  check(page.url().includes('#/anmelden') && (await page.locator('.app-nav').getByRole('link', { name: 'Kiosk' }).count()) === 0, 'Ohne Kiosk-Modus: nach dem Abmelden die Anmeldung, kein Kiosk im Menü');

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
