/**
 * Erzeugt die PNG-App-Icons aus public/favicon.svg.
 * Benötigt Playwright mit Chromium (in der Claude-Code-Cloudumgebung vorinstalliert).
 * Aufruf: npm run icons
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// Maskable: volle Fläche, Inhalt in der sicheren Zone (80 %)
const maskable = svg
  .replace('<rect width="512" height="512" rx="112" fill="#0f172a"/>', '<rect width="512" height="512" fill="#0f172a"/><g transform="translate(51.2 51.2) scale(0.8)">')
  .replace('</svg>', '</g></svg>');

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, src: svg },
  { file: 'public/icons/icon-512.png', size: 512, src: svg },
  { file: 'public/icons/icon-maskable-512.png', size: 512, src: maskable },
  { file: 'public/apple-touch-icon.png', size: 180, src: maskable },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      t.src.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `) +
      `</body></html>`,
  );
  await page.screenshot({ path: t.file, omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log('erstellt', t.file);
}
await browser.close();
