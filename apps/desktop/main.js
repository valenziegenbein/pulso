// Shell de escritorio de Pulso (Electron) — experiencia por defecto: modo Personal.
// - Ventana principal: /personal (onboarding /welcome si todavía no se configuró).
// - Widget flotante: /captura (captura personal, local-first, always-on-top).
// - Empaquetado: levanta el server Next standalone embebido (SQLite) y apunta a él.
// - En dev: apunta a PULSO_URL.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

app.setName('Pulso'); // userData limpio: %APPDATA%\Pulso

const SERVER_PORT = 41789;
const WIDGET_SIZE = { width: 384, height: 520 };
let BASE_URL = process.env.PULSO_URL || 'http://localhost:3000';

let mainWindow = null;
let widgetWindow = null;
let tray = null;
let serverProcess = null;
let programmaticMove = false;
let widgetOpened = false;

// --- Configuración del usuario (secretos + DB), persistida en userData ---
function loadConfig() {
  const cfgPath = path.join(app.getPath('userData'), 'pulso.config.json');
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    /* primera vez */
  }
  let changed = false;
  const ensure = (key, value) => {
    if (!cfg[key]) {
      cfg[key] = value;
      changed = true;
    }
  };
  ensure('AUTH_SECRET', crypto.randomBytes(32).toString('hex'));
  ensure('WORKLOG_ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
  ensure('LLM_PROVIDER', 'MOCK');
  if (changed) {
    try {
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    } catch {
      /* no crítico */
    }
  }
  return { cfg };
}

// SQLite embebido (lo usa el modo Teams). Personal es local-first en el cliente.
function ensureDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'pulso.db');
  if (!fs.existsSync(dbPath)) {
    const template = path.join(process.resourcesPath, 'db-template', 'pulso.db');
    try {
      fs.copyFileSync(template, dbPath);
    } catch {
      /* sin template (dev) */
    }
  }
  return dbPath;
}

// --- Server Next standalone embebido (solo cuando está empaquetado) ---
function startEmbeddedServer() {
  const { cfg } = loadConfig();
  const dbPath = ensureDatabase();
  const databaseUrl =
    typeof cfg.DATABASE_URL === 'string' && cfg.DATABASE_URL.startsWith('file:')
      ? cfg.DATABASE_URL
      : `file:${dbPath.replace(/\\/g, '/')}`;
  const serverJs = path.join(process.resourcesPath, 'server', 'apps', 'web', 'server.js');
  const out = fs.openSync(path.join(app.getPath('userData'), 'server.log'), 'a');
  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(SERVER_PORT),
      HOSTNAME: '127.0.0.1',
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: cfg.AUTH_SECRET,
      WORKLOG_ENCRYPTION_KEY: cfg.WORKLOG_ENCRYPTION_KEY,
      LLM_PROVIDER: cfg.LLM_PROVIDER,
      LLM_BASE_URL: cfg.LLM_BASE_URL || '',
      LLM_MODEL: cfg.LLM_MODEL || '',
      LLM_API_KEY: cfg.LLM_API_KEY || '',
    },
    stdio: ['ignore', out, out],
  });
}

// --- Persistencia de posición del widget ---
let statePath = null;
let state = { x: null, y: null };
function loadState() {
  statePath = path.join(app.getPath('userData'), 'widget-state.json');
  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(statePath, 'utf8')) };
  } catch {
    /* defaults */
  }
}
function saveState() {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state));
  } catch {
    /* no crítico */
  }
}

const widgetUrl = () => `${BASE_URL}/captura`;

function waitForServer(url, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const attempt = () => {
      const req = http.get(`${url}/captura`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}

function attachWindowOpenHandler(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.includes('/captura') || url.includes('/widget')) showWidget();
    else if (/^https?:\/\//.test(url) && !url.startsWith(BASE_URL)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Pulso',
    backgroundColor: '#15110c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--pulso-version=${app.getVersion()}`],
    },
  });
  mainWindow.loadURL(`${BASE_URL}/personal`);
  attachWindowOpenHandler(mainWindow.webContents);
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
  const { workArea } = screen.getPrimaryDisplay();
  const x = state.x ?? workArea.x + workArea.width - WIDGET_SIZE.width - 24;
  const y = state.y ?? workArea.y + 24;

  widgetWindow = new BrowserWindow({
    width: WIDGET_SIZE.width,
    height: WIDGET_SIZE.height,
    x: Math.round(x),
    y: Math.round(y),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--pulso-version=${app.getVersion()}`],
    },
  });
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.loadURL(widgetUrl());
  attachWindowOpenHandler(widgetWindow.webContents);
  widgetWindow.webContents.on('did-finish-load', () => {
    widgetWindow.webContents.insertCSS('html,body{background:transparent !important;}');
  });
  widgetWindow.on('moved', () => {
    if (programmaticMove || !widgetWindow) return;
    const [bx, by] = widgetWindow.getPosition();
    state.x = bx;
    state.y = by;
    saveState();
  });
  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
  return widgetWindow;
}

function showWidget() {
  const wnd = createWidgetWindow();
  wnd.show();
  wnd.focus();
}
function hideWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
}
function toggleWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) hideWidget();
  else showWidget();
}
/** Abre el widget la primera vez que el modo personal/teams está listo. */
function openWidgetOnce() {
  if (widgetOpened) return;
  widgetOpened = true;
  showWidget();
}

function trayIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = 0x9a;
    buffer[i * 4 + 1] = 0xc7;
    buffer[i * 4 + 2] = 0xe7;
    buffer[i * 4 + 3] = 0xff;
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Pulso');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir panel', click: createMainWindow },
      { label: 'Mostrar / ocultar widget', click: toggleWidget },
      { type: 'separator' },
      { label: 'Buscar actualizaciones', click: () => checkForUpdates(true) },
      { type: 'separator' },
      { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', toggleWidget);
}

// --- Auto-update (electron-updater, feed = GitHub Releases) ---
function logUpdater(msg) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* no crítico */
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => logUpdater('checking-for-update'));
  autoUpdater.on('update-available', (info) => logUpdater(`update-available ${info.version}`));
  autoUpdater.on('update-not-available', (info) => logUpdater(`up-to-date ${info.version}`));
  autoUpdater.on('error', (err) => logUpdater(`error ${err == null ? '' : (err.stack || err.message || err)}`));
  autoUpdater.on('download-progress', (p) => logUpdater(`download ${Math.round(p.percent)}%`));
  autoUpdater.on('update-downloaded', async (info) => {
    logUpdater(`update-downloaded ${info.version}`);
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
      title: 'Actualización lista',
      message: `Pulso ${info.version} está listo para instalarse.`,
      detail: 'Se aplicará al reiniciar la aplicación.',
    });
    if (response === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
}

function checkForUpdates(interactive = false) {
  if (!app.isPackaged) {
    if (interactive) dialog.showMessageBox({ message: 'Las actualizaciones solo están disponibles en la app instalada.' });
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => logUpdater(`check-failed ${err == null ? '' : (err.message || err)}`));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  loadState();
  if (app.isPackaged) {
    startEmbeddedServer();
    BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
  }
  await waitForServer(BASE_URL);
  createTray();
  createMainWindow();
  // El widget se abre cuando el modo personal/teams está listo (ver ipc), o
  // manualmente desde la bandeja / Ctrl+Shift+P.
  globalShortcut.register('CommandOrControl+Shift+P', toggleWidget);
  setupAutoUpdater();
  checkForUpdates();
});

ipcMain.on('widget:hide', hideWidget);
ipcMain.on('widget:show', showWidget);
// La web avisa cuando el espacio de trabajo está listo (personal onboarded o
// sesión Teams activa) → abrimos el widget flotante una vez.
ipcMain.on('pulso:personal-ready', openWidgetOnce);
ipcMain.on('pulso:auth', (_e, s) => {
  if (s === 'authed') openWidgetOnce();
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {
      /* ya terminó */
    }
  }
});
