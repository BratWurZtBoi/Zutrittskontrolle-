/**
 * Windows-Programm (Electron): dieselbe App wie im Browser, aber als eigenständiges
 * Programm mit eigenem Datenordner (%APPDATA%\Zutrittskontrolle).
 *
 * - Die App-Dateien (Ordner dist/) werden über das eigene Protokoll app:// geladen –
 *   wie eine Webseite mit fester Herkunft, damit Datenbank, Verschlüsselung, Kamera und
 *   die Verbindung zum Präsentationsfenster genauso funktionieren wie im Browser.
 * - Keine Verbindungen ins Internet: alles läuft lokal.
 * - Der Programmteil mit Systemzugriff (dieses Skript) bietet der Oberfläche nur wenige,
 *   genau geprüfte Funktionen an (siehe preload.cjs).
 */
const { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'zutrittskontrolle';
const ORIGIN = `${SCHEME}://${HOST}`;
const DIST = path.join(__dirname, '..', 'dist');
const BACKUP_FILE = /^zutrittskontrolle-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zkb$/;

// Eigenes Protokoll mit den Rechten einer sicheren Webseite (vor app.ready anmelden)
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Nur für automatische Tests: eigener Datenordner
if (process.env.ZK_USER_DATA_DIR) app.setPath('userData', process.env.ZK_USER_DATA_DIR);

// Nur eine Instanz: zwei Programme würden sich die Datenbank teilen
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let presentationWindow = null;

// ---------------------------------------------------------------------------
// Einstellungen des Programms (nur der vom Nutzer gewählte Sicherungsordner)
// ---------------------------------------------------------------------------

const configFile = () => path.join(app.getPath('userData'), 'programm-einstellungen.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2), 'utf8');
}

/** Nur in den Ordner, den der Nutzer selbst im Dialog gewählt hat, darf geschrieben werden. */
function backupFolder() {
  const folder = readConfig().backupFolder;
  return typeof folder === 'string' && folder ? folder : null;
}

function backupPath(filename) {
  const folder = backupFolder();
  if (!folder) throw new Error('Kein Sicherungsordner gewählt.');
  if (typeof filename !== 'string' || !BACKUP_FILE.test(filename)) throw new Error('Ungültiger Dateiname.');
  return path.join(folder, filename);
}

// ---------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------

function windowOptions(extra = {}) {
  return {
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
    ...extra,
  };
}

/** Navigation nur innerhalb der App; Links nach außen öffnen im Standardbrowser. */
function lockDown(win) {
  win.setMenu(null);
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // F11: Vollbild ein/aus (z. B. für den Kiosk-Scanner)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow(windowOptions({ width: 1440, height: 900, title: 'Zutrittskontrolle', show: false }));
  lockDown(mainWindow);
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    presentationWindow?.close();
  });
  void mainWindow.loadURL(`${ORIGIN}/index.html`);
}

/** Präsentation für Gäste: auf dem zweiten Bildschirm im Vollbild, sonst als Fenster. */
function openPresentation() {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.show();
    presentationWindow.focus();
    return presentationWindow.isFullScreen() ? 'other-screen' : 'window';
  }
  const current = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
  const other = screen.getAllDisplays().find((d) => d.id !== current.id);
  const area = (other ?? current).bounds;
  presentationWindow = new BrowserWindow(
    windowOptions({
      title: 'Zutrittskontrolle – Präsentation',
      x: area.x + (other ? 0 : 80),
      y: area.y + (other ? 0 : 80),
      width: other ? area.width : 1280,
      height: other ? area.height : 720,
      fullscreen: Boolean(other),
    }),
  );
  lockDown(presentationWindow);
  presentationWindow.on('closed', () => {
    presentationWindow = null;
  });
  void presentationWindow.loadURL(`${ORIGIN}/index.html#/praesentation`);
  return other ? 'other-screen' : 'window';
}

// ---------------------------------------------------------------------------
// Funktionen für die Oberfläche (über preload.cjs)
// ---------------------------------------------------------------------------

function registerIpc() {
  const fromApp = (event) => {
    if (!event.senderFrame?.url.startsWith(`${ORIGIN}/`)) throw new Error('Nicht erlaubt.');
  };
  const handle = (channel, fn) =>
    ipcMain.handle(channel, (event, ...args) => {
      fromApp(event);
      return fn(...args);
    });

  handle('zk:info', () => ({ version: app.getVersion(), dataPath: app.getPath('userData') }));
  handle('zk:open-presentation', () => openPresentation());

  handle('zk:choose-backup-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: 'Ordner für automatische Sicherungen wählen',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    writeConfig({ ...readConfig(), backupFolder: result.filePaths[0] });
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) || result.filePaths[0] };
  });
  handle('zk:backup-folder', () => {
    const folder = backupFolder();
    return folder && fs.existsSync(folder) ? { path: folder, name: path.basename(folder) || folder } : null;
  });
  handle('zk:clear-backup-folder', () => {
    const { backupFolder: _old, ...rest } = readConfig();
    writeConfig(rest);
  });
  handle('zk:backup-list', () => {
    const folder = backupFolder();
    if (!folder) return [];
    return fs.readdirSync(folder).filter((name) => BACKUP_FILE.test(name));
  });
  handle('zk:backup-write', (filename, content) => {
    if (typeof content !== 'string') throw new Error('Ungültiger Inhalt.');
    const target = backupPath(filename);
    fs.writeFileSync(`${target}.tmp`, content, 'utf8');
    fs.renameSync(`${target}.tmp`, target); // erst vollständig schreiben, dann umbenennen
  });
  handle('zk:backup-remove', (filename) => {
    fs.rmSync(backupPath(filename), { force: true });
  });

  handle('zk:get-autostart', () => app.getLoginItemSettings().openAtLogin);
  handle('zk:set-autostart', (on) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(on) });
    return app.getLoginItemSettings().openAtLogin;
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  // App-Dateien aus dist/ ausliefern – nichts außerhalb dieses Ordners
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('Nicht gefunden', { status: 404 });
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(DIST, relative));
    if (!file.startsWith(DIST + path.sep)) return new Response('Nicht gefunden', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Kamera, Vollbild und Benachrichtigungen nur für die eigene App erlauben – ohne Rückfrage
  const allowed = new Set(['media', 'fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowed.has(permission) && (details.requestingUrl ?? wc.getURL()).startsWith(`${ORIGIN}/`));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return allowed.has(permission) && requestingOrigin.startsWith(ORIGIN);
  });
  // Keine Verbindungen ins Internet aus der App heraus (nur eigene Dateien, data:, blob:)
  const distUrl = pathToFileURL(DIST).toString();
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const { url } = details;
    const ok = url.startsWith(`${ORIGIN}/`) || url.startsWith(distUrl) || url.startsWith('data:') || url.startsWith('blob:');
    callback({ cancel: !ok });
  });

  registerIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
