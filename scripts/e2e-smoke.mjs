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
  await page.setViewportSize({ width: 1536, height: 780 });
  await page.goto(`${URL}#/dashboard`);
  const listRows = page.locator('.dash-list tbody tr');
  await listRows.first().waitFor();
  check((await listRows.count()) === 1, 'Dashboard: eine Person anwesend (Max Mustermann)');
  check((await page.locator('.dash-list').textContent()).includes('Mustermann'), 'Dashboard: Name in der Anwesenheitsliste');
  check((await page.getByTestId('kpi-present').textContent()).trim() === '1', 'Statusleiste: 1 anwesend');
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
  check((await page.locator('.dash-recent li').count()) >= 1, 'Seitenleiste: letzte Scans');
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
  const scrollers = await page.evaluate(() =>
    [...document.querySelectorAll('.dash-list *')].filter((el) => {
      const st = getComputedStyle(el);
      return /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1;
    }).map((el) => `${el.tagName}.${el.className} ${el.scrollHeight}/${el.clientHeight}`),
  );
  check(scrollers.length === 0, `Kein Scrollbereich innerhalb der Liste (nur die Seite scrollt) ${scrollers.join(', ')}`);
  await page.locator('.dash-cam').getByRole('radio', { name: 'Aus' }).click();
  await page.locator('.dash-cam-cover').waitFor();
  check(true, 'Kameravorschau ausblendbar');
  await page.locator('.dash-cam').getByRole('radio', { name: 'Klein' }).click();
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
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV-Export (Excel)' }).click(),
  ]);
  const csvPath = `${OUT}/${csvDownload.suggestedFilename()}`;
  await csvDownload.saveAs(csvPath);
  const csv = readFileSync(csvPath, 'utf8');
  check(/^zutritt-aktionen-\d{4}-\d{2}-\d{2}\.csv$/.test(csvDownload.suggestedFilename()), 'CSV-Export: Dateiname mit Datum');
  check(csv.startsWith('\uFEFFDatum;Uhrzeit;Karte;Name;Gruppe;Richtung;Ergebnis;Grund;Quelle;Bestätigt von\r\n'), 'CSV-Export: Excel-Format (BOM, Semikolon)');
  check(csv.includes('Berta Besuch') && csv.split('\r\n').length === 10, 'CSV-Export: 8 Aktionen mit Namen');

  console.log('12) Backup erstellen, Daten löschen, Backup einspielen');
  await page.goto(`${URL}#/einstellungen`);
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
  await page.getByRole('button', { name: 'Alle Daten löschen' }).click();
  await page.getByText(/Alle Daten gelöscht/).waitFor();
  check((await readStore(page, 'cards')).length === 0, 'Alle Daten gelöscht');
  await page.locator('#bk-file').setInputFiles(backupPath);
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
    ';Hausmeister;Fehler;Zeile;;;ja;;',
  ].join('\r\n');
  const importPath = `${OUT}/import.csv`;
  // wie Excel „CSV (Trennzeichen-getrennt)“: Windows-1252 statt UTF-8
  writeFileSync(importPath, Buffer.from(importCsv.replace('Gültig', 'Gültig'), 'latin1'));
  await page.locator('#csv-file').setInputFiles(importPath);
  await page.locator('.import-table tbody tr').nth(3).waitFor();
  const chips = await page.locator('.summary-chips').textContent();
  check(chips.includes('2 neue Karte(n)') && chips.includes('1 Zuweisung(en)') && chips.includes('1 Fehler'), 'Import-Vorschau: 2 neu, 1 Zuweisung, 1 Fehler');
  check((await page.locator('.import-table').textContent()).includes('Gruppe „Hausmeister“ gibt es nicht.'), 'Import-Vorschau zeigt Fehlergrund');
  await page.screenshot({ path: `${OUT}/12-import-vorschau.png`, fullPage: true });
  await page.getByRole('button', { name: '3 Zeile(n) importieren' }).click();
  await page.getByText('Import abgeschlossen').waitFor();
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
  check((await presentation.locator('.presentation-org').textContent()).includes('Musterfirma'), 'Präsentation: Wartebildschirm mit Organisationsname');
  await presentation.screenshot({ path: `${OUT}/13-praesentation-warten.png` });
  // „Alle Daten löschen“ im Backup-Schritt hat den Testmodus zurückgesetzt
  await page.goto(`${URL}#/einstellungen`);
  await page.getByLabel(/Testmodus/).click();
  await page.waitForTimeout(300);
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
  await page.goto(`${URL}#/einstellungen`);
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
  await page.goto(`${URL}#/uebersicht`);
  await page.locator('.data-table tbody tr').first().waitFor();
  await page.screenshot({ path: `${OUT}/17-dunkel-uebersicht.png` });
  await page.setViewportSize(viewport);
  await page.goto(`${URL}#/karten`);
  await page.locator('.card-row').first().waitFor();
  await page.screenshot({ path: `${OUT}/18-dunkel-karten.png` });

  console.log('17) Karten drucken (Druck bleibt hell)');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.getByRole('link', { name: /Drucken \(16\)/ }).click();
  await page.locator('.id-card .qr[src]').first().waitFor();
  check((await page.locator('.id-card').count()) === 15, '15 Karten druckbereit (gesperrte ausgenommen)');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/19-druck-dunkel.png` });
  await page.emulateMedia({ media: 'print' });
  const printBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(printBg === 'rgb(255, 255, 255)', 'Druckansicht ist auch im dunklen Layout weiß');
  await page.pdf({ path: `${OUT}/karten.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  console.log('  ✓ PDF erzeugt: .e2e/karten.pdf');
  await page.goto(`${URL}#/einstellungen`);
  await page.getByLabel('Darstellung').selectOption('auto');

  console.log('17b) Bestätigung von Eintritten und Bediener-PIN');
  await page.setViewportSize({ width: 1536, height: 780 });
  await page.goto(`${URL}#/einstellungen`);
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
  await page.getByRole('link', { name: 'Verwaltung' }).waitFor();
  await page.getByRole('link', { name: 'Verwaltung' }).click();
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
  check(!navText.includes('Karten') && !navText.includes('Einstellungen') && navText.includes('Übersicht'), 'Bediener sieht nur Dashboard und Übersicht');
  check((await page.locator('.dash-side .test-panel').count()) === 0, 'Testmodus bleibt dem Admin vorbehalten');
  await page.goto(`${URL}#/uebersicht`);
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

  console.log('17d) Präsentationslayouts: anlegen, Gruppe zuweisen, Gästebildschirm');
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto(`${URL}#/einstellungen/praesentation`);
  await page.getByRole('button', { name: '+ Neues Layout' }).click();
  await page.getByLabel('Name des Layouts').fill('Empfang Personal');
  await page.locator('.choice', { hasText: 'Foto links' }).click();
  await page.getByLabel('Hintergrundart').selectOption('color');
  await page.locator('.layout-form input[type="color"]').first().fill('#7c3aed');
  await page.getByLabel(/eigener Hintergrund mit farbigem Streifen/).check();
  await page.getByLabel('Eingang – Titel').fill('Hallo {vorname}!');
  await page.getByLabel('Eingang – Text').fill('Schön, dass Sie da sind · {uhrzeit} Uhr');
  await page.locator('.layout-preview .presentation-title', { hasText: 'Hallo Erika!' }).waitFor();
  check(true, 'Editor: Live-Vorschau mit Platzhaltern (fiktive Beispieldaten)');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByText('Gespeichert.').waitFor();
  await page.screenshot({ path: `${OUT}/23-layout-editor.png` });
  check(true, 'Layout gespeichert');
  await page.goto(`${URL}#/einstellungen/gruppen`);
  await page.locator('.group-list li', { hasText: 'Bestandspersonal' }).getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel('Präsentationslayout (Gästebildschirm)').selectOption({ label: 'Empfang Personal' });
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.locator('.group-list li', { hasText: 'Bestandspersonal' }).getByText('Layout „Empfang Personal“').waitFor();
  check(true, 'Layout der Gruppe Bestandspersonal zugewiesen');

  const guestScreen = await ctx.newPage();
  guestScreen.on('pageerror', (e) => problems.push(`JS-Fehler (Präsentation): ${e.message}`));
  await guestScreen.setViewportSize({ width: 1280, height: 720 });
  await guestScreen.goto(`${URL}#/praesentation`);
  await guestScreen.getByText('Herzlich willkommen').waitFor();
  await page.goto(`${URL}#/dashboard`);
  await page.locator('.dash-status').getByRole('radio', { name: 'Eingang' }).click();
  await page.locator('.dash-side .test-panel').evaluate((d) => (d.open = true));
  // eine Karte, die vorher noch nicht gescannt wurde (kein Doppelscan-Schutz)
  const hans = await page.locator('.dash-side .test-panel select option', { hasText: 'Hans Beispiel' }).getAttribute('value');
  await page.locator('.dash-side .test-panel select').selectOption(hans);
  await page.locator('.dash-side').getByRole('button', { name: 'Karte scannen' }).click();
  await guestScreen.locator('.presentation-result').waitFor({ timeout: 5000 });
  const guestShown = await guestScreen.locator('.presentation-result').textContent();
  check(guestShown.includes('Hallo Hans!') && guestShown.includes('Schön, dass Sie da sind'), `Gästebildschirm zeigt die Texte des Gruppenlayouts (${guestShown})`);
  check((await guestScreen.locator('.pv-side').count()) === 1, 'Aufbau „Foto links“');
  const bgColor = await guestScreen.locator('.presentation-result').evaluate((el) => getComputedStyle(el).backgroundColor);
  check(bgColor === 'rgb(124, 58, 237)', `Eigener Hintergrund (${bgColor})`);
  await guestScreen.screenshot({ path: `${OUT}/24-praesentation-layout.png` });
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

  await page.getByRole('link', { name: 'Notfallliste' }).click();
  await page.getByRole('heading', { name: /Notfall- \/ Evakuierungsliste/ }).waitFor();
  const emergencyRows = await page.locator('.emergency-table tbody tr').count();
  check(emergencyRows === presentBefore, `Notfallliste: alle ${emergencyRows} Anwesenden`);
  await page.screenshot({ path: `${OUT}/26-notfallliste.png`, fullPage: true });

  await page.goto(`${URL}#/einstellungen`);
  await page.getByRole('heading', { name: 'Automatische Sicherung' }).waitFor();
  check(true, 'Einstellungen: automatische Sicherung angeboten');

  console.log('18) Abmelden und Sperren');
  await page.setViewportSize(viewport);
  await page.goto(`${URL}#/einstellungen`);
  
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
