// Shell de escritorio de Pulso (Electron) — experiencia por defecto: modo Personal.
// - Ventana principal: /personal (onboarding /welcome si todavía no se configuró).
// - Widget flotante: /captura (captura personal, local-first, always-on-top).
// - Empaquetado: levanta el server Next standalone embebido (SQLite) y apunta a él.
// - En dev: apunta a PULSO_URL.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell, dialog, desktopCapturer } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

app.setName('Pulso'); // userData limpio: %APPDATA%\Pulso

const SERVER_PORT = 41789;
const WIDGET_FULL = { width: 384, height: 520 };
const WIDGET_PILL = { width: 188, height: 64 };
const WIDGET_VIEWS = new Set(['collapsed', 'quick', 'full']);
let BASE_URL = process.env.PULSO_URL || 'http://localhost:3000';

let mainWindow = null;
let widgetWindow = null;
let tray = null;
let serverProcess = null;
let programmaticMove = false;
let widgetOpened = false;
let widgetMode = 'personal';
let widgetView = 'full';

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
function logDesktop(msg) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'desktop.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* no critico */
  }
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function databaseHasTeamsSchema(dbPath) {
  try {
    const buf = fs.readFileSync(dbPath);
    return ['DecisionRequest', 'Blocker', 'expectedOutcome'].every((marker) => buf.includes(Buffer.from(marker)));
  } catch {
    return false;
  }
}

function ensureDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'pulso.db');
  const template = path.join(process.resourcesPath, 'db-template', 'pulso.db');
  if (!fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(template, dbPath);
    } catch {
      /* sin template (dev) */
    }
  } else if (fs.existsSync(template) && !databaseHasTeamsSchema(dbPath)) {
    const backupPath = path.join(app.getPath('userData'), `pulso.backup-${safeTimestamp()}.db`);
    try {
      fs.copyFileSync(dbPath, backupPath);
      fs.copyFileSync(template, dbPath);
      logDesktop(`database schema refreshed for Teams MVP; previous DB backed up at ${backupPath}`);
    } catch (err) {
      logDesktop(`database refresh failed: ${err == null ? '' : err.message || err}`);
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

function normalizeWidgetMode(mode) {
  return mode === 'teams' ? 'teams' : 'personal';
}

function normalizeWidgetView(view) {
  return WIDGET_VIEWS.has(view) ? view : 'full';
}

function widgetUrl() {
  if (widgetMode === 'teams') return `${BASE_URL}/widget?view=${widgetView}`;
  return `${BASE_URL}/captura`;
}

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
    if (url.includes('/widget')) showWidget('teams');
    else if (url.includes('/captura')) showWidget('personal');
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
  const x = state.x ?? workArea.x + workArea.width - WIDGET_FULL.width - 24;
  const y = state.y ?? workArea.y + 24;

  widgetWindow = new BrowserWindow({
    width: WIDGET_FULL.width,
    height: WIDGET_FULL.height,
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
    widgetWindow.webContents.insertCSS('html,body{background:transparent !important; overflow:hidden !important;}');
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

function ensureWidgetRoute(mode = widgetMode, view = widgetView) {
  const nextMode = normalizeWidgetMode(mode);
  const nextView = normalizeWidgetView(view);
  const changed = widgetMode !== nextMode || widgetView !== nextView;
  widgetMode = nextMode;
  widgetView = nextView;
  if (widgetWindow && !widgetWindow.isDestroyed() && changed) {
    widgetWindow.loadURL(widgetUrl());
  }
}

function sendWidgetView(view) {
  if (widgetMode !== 'teams' || !widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.webContents.send('widget:view-state', view);
}

function clampY(y, h) {
  const { workArea } = screen.getPrimaryDisplay();
  return Math.max(workArea.y + 8, Math.min(y, workArea.y + workArea.height - h - 8));
}
function snapX(width) {
  const { workArea } = screen.getPrimaryDisplay();
  const b = widgetWindow.getBounds();
  const center = b.x + b.width / 2;
  return center < workArea.x + workArea.width / 2 ? workArea.x + 12 : workArea.x + workArea.width - width - 12;
}
/** Anima bounds de la ventana (easeOutCubic) — snap suave. */
function animateTo(win, target, ms = 340) {
  const start = win.getBounds();
  const steps = 18;
  let i = 0;
  const tick = () => {
    if (!win || win.isDestroyed()) return;
    i++;
    const t = i / steps;
    const e = 1 - Math.pow(1 - t, 3);
    programmaticMove = true;
    win.setBounds({
      x: Math.round(start.x + (target.x - start.x) * e),
      y: Math.round(start.y + (target.y - start.y) * e),
      width: Math.round(start.width + (target.width - start.width) * e),
      height: Math.round(start.height + (target.height - start.height) * e),
    });
    programmaticMove = false;
    if (i < steps) setTimeout(tick, ms / steps);
    else {
      state.x = target.x;
      state.y = target.y;
      saveState();
    }
  };
  tick();
}

function collapseWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const b = widgetWindow.getBounds();
  animateTo(widgetWindow, { x: snapX(WIDGET_PILL.width), y: clampY(b.y, WIDGET_PILL.height), ...WIDGET_PILL });
}
function expandWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  const b = widgetWindow.getBounds();
  let x = b.x;
  // Si está pegado a la derecha, expandir hacia la izquierda para no salirse.
  if (x + WIDGET_FULL.width > workArea.x + workArea.width - 12) x = workArea.x + workArea.width - WIDGET_FULL.width - 12;
  x = Math.max(workArea.x + 12, x);
  animateTo(widgetWindow, { x, y: clampY(b.y, WIDGET_FULL.height), ...WIDGET_FULL });
}

function applyWidgetView(view, notifyRenderer = false) {
  widgetView = normalizeWidgetView(view);
  if (widgetView === 'collapsed') collapseWidget();
  else expandWidget();
  if (notifyRenderer) sendWidgetView(widgetView);
}

function showWidget(mode = widgetMode) {
  ensureWidgetRoute(mode, 'full');
  const wnd = createWidgetWindow();
  wnd.show();
  wnd.focus();
  applyWidgetView('full', true);
}
function hideWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
}
function toggleWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return showWidget();
  if (!widgetWindow.isVisible()) {
    widgetWindow.show();
    applyWidgetView('full', true);
  } else if (widgetWindow.getBounds().width < 240) {
    widgetWindow.focus();
    applyWidgetView('full', true);
  } else {
    hideWidget();
  }
}
/** Onboarding: el widget "aparece dentro de la app" (centro) y vuela al borde. */
function introWidget(mode = 'personal') {
  ensureWidgetRoute(mode, 'full');
  const wnd = createWidgetWindow();
  const { workArea } = screen.getPrimaryDisplay();
  programmaticMove = true;
  wnd.setBounds({
    x: Math.round(workArea.x + workArea.width / 2 - WIDGET_FULL.width / 2),
    y: Math.round(workArea.y + workArea.height / 2 - WIDGET_FULL.height / 2 + 40),
    ...WIDGET_FULL,
  });
  programmaticMove = false;
  wnd.show();
  wnd.focus();
  widgetOpened = true;
  setTimeout(
    () => animateTo(wnd, { x: workArea.x + workArea.width - WIDGET_FULL.width - 24, y: workArea.y + 24, ...WIDGET_FULL }, 460),
    420,
  );
}
/** Apertura no invasiva (relanzados ya configurados): pill pegada al borde. */
function openWidgetCollapsed(mode = widgetMode) {
  const nextMode = normalizeWidgetMode(mode);
  if (widgetOpened && widgetMode === nextMode) return;
  widgetOpened = true;
  ensureWidgetRoute(nextMode, 'collapsed');
  const wnd = createWidgetWindow();
  const { workArea } = screen.getPrimaryDisplay();
  programmaticMove = true;
  wnd.setBounds({
    x: workArea.x + workArea.width - WIDGET_PILL.width - 12,
    y: Math.round(clampY(state.y ?? workArea.y + 24, WIDGET_PILL.height)),
    ...WIDGET_PILL,
  });
  programmaticMove = false;
  wnd.show();
  sendWidgetView('collapsed');
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
ipcMain.on('widget:show', (_e, mode) => showWidget(mode));
ipcMain.on('widget:collapse', collapseWidget);
ipcMain.on('widget:expand', expandWidget);
ipcMain.on('widget:view', (_e, view) => applyWidgetView(view, false));
ipcMain.on('widget:intro', (_e, mode) => introWidget(mode));
// La web avisa cuando el espacio de trabajo está listo (personal onboarded o
// sesión Teams activa) → abrimos el widget minimizado en el borde (no invasivo).
ipcMain.on('pulso:personal-ready', () => openWidgetCollapsed('personal'));
ipcMain.on('pulso:auth', (_e, s) => {
  if (s === 'authed') openWidgetCollapsed('teams');
});

// Captura rápida de pantalla. Oculta el widget un instante para no salir en la foto.
ipcMain.handle('pulso:screenshot', async () => {
  const widgetWasVisible = widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible();
  try {
    if (widgetWasVisible) widgetWindow.hide();
    await new Promise((r) => setTimeout(r, 150));
    const display = screen.getPrimaryDisplay();
    const scale = Math.min(1, 1366 / display.size.width);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) },
    });
    const src = sources[0];
    if (!src || src.thumbnail.isEmpty()) return null;
    return `data:image/jpeg;base64,${src.thumbnail.toJPEG(70).toString('base64')}`;
  } catch {
    return null;
  } finally {
    if (widgetWasVisible && widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.show();
  }
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
