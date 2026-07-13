// Shell de escritorio de Pulso (Electron) — experiencia por defecto: modo Personal.
// - Ventana principal: /personal (onboarding /welcome si todavía no se configuró).
// - Widget flotante: /captura (captura personal, local-first, always-on-top).
// - Empaquetado: levanta el server Next standalone embebido (SQLite) y apunta a él.
// - En dev: apunta a PULSO_URL.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell, dialog, desktopCapturer, session, safeStorage } = require('electron');
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
const WIDGET_EDGE_GAP = 12;
const WIDGET_RIGHT_SAFE_TOP = 72;
const WIDGET_VIEWS = new Set(['collapsed', 'quick', 'full']);
const TEAMS_PARTITION = 'persist:pulso-teams';
const LEGACY_PULSO_SERVER_URL = 'https://pulso.syswarm.com';
const DEFAULT_PULSO_SERVER_URL = 'https://pulsoapp.syswarm.com';
let BASE_URL = process.env.PULSO_URL || 'http://localhost:3000';

let mainWindow = null;
let widgetWindow = null;
let teamsWindow = null;
let tray = null;
let serverProcess = null;
let programmaticMove = false;
let widgetOpened = false;
let widgetMode = 'personal';
let widgetView = 'full';
// URL del server de Pulso Teams (web). Personal es local; Teams vive en el server.
let TEAMS_URL = null;
let teamsAuthInProgress = false;

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

// --- URL del server Teams (web), persistida en pulso.config.json ---
function configPath() {
  return path.join(app.getPath('userData'), 'pulso.config.json');
}

function normalizeTeamsUrl(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const url = new URL(raw.trim());
  const localDev = !app.isPackaged && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(localDev && url.protocol === 'http:')) {
    throw new Error('La URL de Teams debe usar HTTPS.');
  }
  if (url.username || url.password) throw new Error('La URL de Teams no puede incluir credenciales.');
  url.search = '';
  url.hash = '';
  const normalized = `${url.origin}${url.pathname}`.replace(/\/$/, '');
  return normalized === LEGACY_PULSO_SERVER_URL ? DEFAULT_PULSO_SERVER_URL : normalized;
}

function sameOrigin(candidate, trustedBase) {
  try {
    return Boolean(trustedBase) && new URL(candidate).origin === new URL(trustedBase).origin;
  } catch {
    return false;
  }
}

function senderIsMainFrame(event) {
  return !event.senderFrame || event.senderFrame === event.sender.mainFrame;
}

function senderMatchesWindow(event, win) {
  return Boolean(win && !win.isDestroyed() && event.sender === win.webContents && senderIsMainFrame(event));
}

function isLocalRenderer(event) {
  const owned = senderMatchesWindow(event, mainWindow) || senderMatchesWindow(event, widgetWindow);
  return owned && sameOrigin(event.sender.getURL(), BASE_URL);
}

function isTeamsRenderer(event) {
  const owned = senderMatchesWindow(event, teamsWindow) || senderMatchesWindow(event, widgetWindow);
  return owned && sameOrigin(event.sender.getURL(), TEAMS_URL);
}

function isPulsoRenderer(event) {
  return isLocalRenderer(event) || isTeamsRenderer(event);
}

function requireLocalRenderer(event) {
  if (!isLocalRenderer(event)) throw new Error('IPC no autorizado para contenido remoto.');
}

function safeOpenExternal(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(parsed.toString());
  } catch {
    /* URL no confiable: se ignora. */
  }
}
// Default horneado al build: la organización distribuye su desktop con su URL ya
// puesta (pulso.defaults.json) → el trabajador NO tipea nada, solo inicia sesión.
function bundledDefaultTeamsUrl() {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'pulso.defaults.json'), 'utf8'));
    return normalizeTeamsUrl(d.teamsUrl);
  } catch {
    return null;
  }
}
function readTeamsUrl() {
  // Prioridad: lo que guardó el usuario > el default del build.
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    const configured = normalizeTeamsUrl(cfg.teamsUrl);
    if (configured) return configured;
  } catch {
    /* primera vez */
  }
  return bundledDefaultTeamsUrl();
}
function writeTeamsUrl(url) {
  const clean = normalizeTeamsUrl(url);
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    /* primera vez */
  }
  cfg.teamsUrl = clean ?? '';
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch {
    /* no crítico */
  }
  TEAMS_URL = clean;
  return TEAMS_URL;
}

// --- Secretos BYOK de Personal (DPAPI/Keychain/Secret Service) ---
const PERSONAL_AI_SECRET_PROVIDERS = new Set(['openai', 'anthropic']);
function personalAiSecretsPath() {
  return path.join(app.getPath('userData'), 'personal-ai-secrets.json');
}
function readPersonalAiSecrets() {
  try {
    const parsed = JSON.parse(fs.readFileSync(personalAiSecretsPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function storePersonalAiSecret(provider, apiKey) {
  if (!PERSONAL_AI_SECRET_PROVIDERS.has(provider) || typeof apiKey !== 'string' || apiKey.trim().length < 8) return false;
  if (!safeStorage.isEncryptionAvailable()) return false;
  const secrets = readPersonalAiSecrets();
  secrets[provider] = safeStorage.encryptString(apiKey.trim()).toString('base64');
  fs.writeFileSync(personalAiSecretsPath(), JSON.stringify(secrets), { mode: 0o600 });
  return true;
}
function loadPersonalAiSecret(provider) {
  if (!PERSONAL_AI_SECRET_PROVIDERS.has(provider) || !safeStorage.isEncryptionAvailable()) return null;
  const encoded = readPersonalAiSecrets()[provider];
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(encoded)) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch {
    return null;
  }
}
function deletePersonalAiSecret(provider) {
  if (!PERSONAL_AI_SECRET_PROVIDERS.has(provider)) return false;
  const secrets = readPersonalAiSecrets();
  if (!(provider in secrets)) return true;
  delete secrets[provider];
  fs.writeFileSync(personalAiSecretsPath(), JSON.stringify(secrets), { mode: 0o600 });
  return true;
}

// --- Export a carpeta Markdown (modo Personal) ---
// La persona elige una carpeta (Obsidian, Logseq, un repo…) y cada entrada de
// bitácora aprobada se agrega a un .md por proyecto. Local y voluntario.
async function chooseFolder(win) {
  const res = await dialog.showOpenDialog(win ?? undefined, {
    title: 'Elegí la carpeta para tu bitácora Markdown',
    buttonLabel: 'Usar esta carpeta',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
}

// Escritura del diario .md y retrieval de notas como contexto: ver markdown.js
// y notes-index.js (módulos sin Electron, verificables con node puro).
const { exportMarkdown } = require('./markdown');
const { retrieveNotesContext } = require('./notes-index');
const embeddingsIndex = require('./embeddings-index');

// Cache de vectores del asistente de notas: SIEMPRE en userData, nunca en la
// carpeta del usuario — es un dato derivado de la app, no algo que le
// corresponda a su bóveda.
function embeddingsCacheDir() {
  return path.join(app.getPath('userData'), 'embeddings-cache');
}

/** Formatea chunks (BM25 o híbridos) al mismo formato de prompt que retrieveNotesContext. */
function chunksToContext(chunks, budget) {
  const parts = [];
  let total = 0;
  for (const c of chunks) {
    if (total >= budget) break;
    const text = c.text.slice(0, budget - total);
    const where = c.heading ? `${c.file} › ${c.heading}` : c.file;
    parts.push(`— ${where} —\n${text}`);
    total += text.length;
  }
  return parts.length > 0 ? parts.join('\n\n') : null;
}

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

// Red de seguridad para datos reales: una copia por día, conservando las 3
// últimas. Barato (solo si no existe la del día) y recuperable ante cualquier
// problema durante uso intensivo.
function backupDatabaseDaily(dbPath) {
  try {
    const dir = app.getPath('userData');
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const todayBackup = path.join(dir, `pulso.daily-${day}.db`);
    if (!fs.existsSync(todayBackup)) {
      fs.copyFileSync(dbPath, todayBackup);
      logDesktop(`daily backup created: ${todayBackup}`);
    }
    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('pulso.daily-') && f.endsWith('.db'))
      .sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - 3))) {
      try {
        fs.unlinkSync(path.join(dir, old));
      } catch {
        /* no critico */
      }
    }
  } catch (err) {
    logDesktop(`daily backup failed: ${err == null ? '' : err.message || err}`);
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
  } else {
    // DB con el schema actual y datos del usuario: la conservamos + backup diario.
    backupDatabaseDaily(dbPath);
  }
  return dbPath;
}

// --- Server Next standalone embebido (solo cuando está empaquetado) ---
function startEmbeddedServer() {
  const { cfg } = loadConfig();
  // El server embebido sirve SOLO el modo Personal (local-first, sin DB). Teams
  // vive en el server remoto (ver openTeams). Una DATABASE_URL válida en formato
  // alcanza: Prisma init es lazy y las rutas Personal no consultan la base.
  const databaseUrl =
    typeof cfg.DATABASE_URL === 'string' && cfg.DATABASE_URL.startsWith('postgresql://')
      ? cfg.DATABASE_URL
      : 'postgresql://pulso:pulso@127.0.0.1:5432/pulso?schema=public';
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
      PULSO_PERSONAL_API_ENABLED: 'true',
      PULSO_PUBLIC_REGISTRATION_ENABLED: 'false',
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
  // Teams vive en el server remoto; Personal es local (embebido).
  if (widgetMode === 'teams') return `${TEAMS_URL ?? BASE_URL}/widget?view=${widgetView}`;
  return `${BASE_URL}/captura`;
}

async function createDesktopCallbackServer(expectedState) {
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || '';
      if (url.pathname !== '/auth/callback' || state !== expectedState || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('Solicitud de autorización inválida.');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('Pulso Desktop quedó conectado. Ya podés cerrar esta ventana.');
      resolveCode(code);
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('Solicitud de autorización inválida.');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('No se pudo reservar el callback loopback.');
  }
  const timer = setTimeout(() => rejectCode(new Error('La autorización Desktop expiró.')), 2 * 60 * 1000);
  return {
    redirectUri: `http://127.0.0.1:${address.port}/auth/callback`,
    codePromise: codePromise.finally(() => {
      clearTimeout(timer);
      server.close();
    }),
  };
}

async function authenticatePulsoAccount(openTeamsAfter) {
  if (!TEAMS_URL) return { ok: false, error: 'server_not_configured' };
  if (teamsAuthInProgress) return { ok: false, error: 'authentication_in_progress' };
  teamsAuthInProgress = true;
  try {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(32).toString('base64url');
    const callback = await createDesktopCallbackServer(state);
    void callback.codePromise.catch(() => {});
    const authorizeUrl = new URL('/desktop/authorize', TEAMS_URL);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('redirect_uri', callback.redirectUri);
    authorizeUrl.searchParams.set('state', state);
    await shell.openExternal(authorizeUrl.toString());
    const code = await callback.codePromise;
    const tokenUrl = new URL('/api/desktop/token', TEAMS_URL);
    const response = await fetch(tokenUrl, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        codeVerifier: verifier,
        redirectUri: callback.redirectUri,
        deviceName: `Pulso Desktop ${app.getVersion()}`,
      }),
    });
    const payload = await response.json();
    if (!response.ok || typeof payload.accessToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.accessToken)) {
      throw new Error('El servidor rechazó el intercambio PKCE.');
    }
    const teamsSession = session.fromPartition(TEAMS_PARTITION);
    await teamsSession.cookies.set({
      url: TEAMS_URL,
      name: 'pulso_session',
      value: payload.accessToken,
      httpOnly: true,
      secure: new URL(TEAMS_URL).protocol === 'https:',
      sameSite: 'lax',
      expirationDate: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    });
    if (openTeamsAfter) {
      if (teamsWindow && !teamsWindow.isDestroyed()) await teamsWindow.loadURL(TEAMS_URL);
      else openTeams();
    }
    return { ok: true };
  } catch (err) {
    logDesktop(`teams auth failed: ${err == null ? '' : err.message || err}`);
    return { ok: false, error: 'authentication_failed' };
  } finally {
    teamsAuthInProgress = false;
  }
}

async function authenticateTeams() {
  return authenticatePulsoAccount(true);
}

async function accountAiFetch(method, payload) {
  if (!TEAMS_URL) return { ok: false, status: 0, error: 'server_not_configured' };
  const target = new URL('/api/desktop/personal-ai', TEAMS_URL);
  let body;
  if (payload !== undefined) {
    try {
      body = JSON.stringify(payload);
    } catch {
      return { ok: false, status: 400, error: 'invalid_input' };
    }
    if (body.length > 7_000_000) return { ok: false, status: 413, error: 'payload_too_large' };
  }
  try {
    const response = await session.fromPartition(TEAMS_PARTITION).fetch(target.toString(), {
      method,
      redirect: 'error',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body,
      signal: AbortSignal.timeout(35_000),
    });
    const text = await response.text();
    if (text.length > 1_000_000) return { ok: false, status: 502, error: 'invalid_response' };
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, status: 502, error: 'invalid_response' };
    }
    return response.ok
      ? { ok: true, status: response.status, data }
      : { ok: false, status: response.status, error: typeof data.error === 'string' ? data.error : 'request_failed' };
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
}

/** Ventana de Pulso Teams: carga el server web remoto (mismo dato que la web, en
 *  vivo). Si no hay URL configurada, avisa al panel para que la pida. */
function openTeams() {
  if (!TEAMS_URL) {
    createMainWindow();
    mainWindow.webContents.send('pulso:need-teams-url');
    return;
  }
  if (teamsWindow && !teamsWindow.isDestroyed()) {
    teamsWindow.show();
    teamsWindow.focus();
    return;
  }
  teamsWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Pulso Teams',
    backgroundColor: '#15110c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-teams.js'),
      partition: TEAMS_PARTITION,
      additionalArguments: [`--pulso-version=${app.getVersion()}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  teamsWindow.loadURL(TEAMS_URL);
  teamsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url, TEAMS_URL)) {
      try {
        if (new URL(url).pathname === '/widget') showWidget('teams');
        else void teamsWindow?.loadURL(url);
      } catch {
        /* URL inválida: se deniega. */
      }
    } else {
      safeOpenExternal(url);
    }
    return { action: 'deny' };
  });
  teamsWindow.webContents.on('will-navigate', (event, url) => {
    if (sameOrigin(url, TEAMS_URL)) return;
    event.preventDefault();
    safeOpenExternal(url);
  });
  teamsWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  teamsWindow.webContents.on('render-process-gone', (_event, details) => {
    logDesktop(`teams renderer stopped: ${details.reason}`);
  });
  teamsWindow.on('closed', () => {
    teamsWindow = null;
  });
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow.loadURL(`${BASE_URL}/personal`);
  attachWindowOpenHandler(mainWindow.webContents);
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
  const remembered = state.x != null && state.y != null
    ? { x: state.x, y: state.y, ...WIDGET_FULL }
    : null;
  const { workArea } = remembered ? screen.getDisplayMatching(remembered) : screen.getPrimaryDisplay();
  const x = state.x ?? workArea.x + workArea.width - WIDGET_FULL.width - WIDGET_EDGE_GAP;
  const y = clampWidgetY(state.y ?? workArea.y + WIDGET_RIGHT_SAFE_TOP, WIDGET_FULL.height, x, WIDGET_FULL.width, workArea);

  const createdWindow = new BrowserWindow({
    width: WIDGET_FULL.width,
    height: WIDGET_FULL.height,
    x: Math.round(x),
    y: Math.round(y),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, widgetMode === 'teams' ? 'preload-teams.js' : 'preload.js'),
      partition: widgetMode === 'teams' ? TEAMS_PARTITION : undefined,
      additionalArguments: [`--pulso-version=${app.getVersion()}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  widgetWindow = createdWindow;
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.loadURL(widgetUrl());
  if (widgetMode === 'teams') {
    widgetWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (sameOrigin(url, TEAMS_URL)) void widgetWindow?.loadURL(url);
      else safeOpenExternal(url);
      return { action: 'deny' };
    });
    widgetWindow.webContents.on('will-navigate', (event, url) => {
      if (sameOrigin(url, TEAMS_URL)) return;
      event.preventDefault();
      safeOpenExternal(url);
    });
    widgetWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  } else {
    attachWindowOpenHandler(widgetWindow.webContents);
  }
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
  createdWindow.on('closed', () => {
    if (widgetWindow === createdWindow) widgetWindow = null;
  });
  return widgetWindow;
}

function ensureWidgetRoute(mode = widgetMode, view = widgetView) {
  const nextMode = normalizeWidgetMode(mode);
  const nextView = normalizeWidgetView(view);
  const modeChanged = widgetMode !== nextMode;
  const changed = modeChanged || widgetView !== nextView;
  widgetMode = nextMode;
  widgetView = nextView;
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    if (modeChanged) {
      widgetWindow.destroy();
      widgetWindow = null;
    } else if (changed) {
      widgetWindow.loadURL(widgetUrl());
    }
  }
}

function sendWidgetView(view) {
  if (widgetMode !== 'teams' || !widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.webContents.send('widget:view-state', view);
}

function displayForBounds(bounds) {
  return screen.getDisplayMatching(bounds);
}

function snapX(width, bounds, workArea) {
  const center = bounds.x + bounds.width / 2;
  return center < workArea.x + workArea.width / 2
    ? workArea.x + WIDGET_EDGE_GAP
    : workArea.x + workArea.width - width - WIDGET_EDGE_GAP;
}

function clampWidgetY(y, height, x, width, workArea) {
  const onRight = x + width / 2 >= workArea.x + workArea.width / 2;
  const topGap = onRight ? WIDGET_RIGHT_SAFE_TOP : WIDGET_EDGE_GAP;
  const min = workArea.y + topGap;
  const max = workArea.y + workArea.height - height - WIDGET_EDGE_GAP;
  return Math.max(min, Math.min(y, Math.max(min, max)));
}

function snappedWidgetBounds(width, height, bounds) {
  const { workArea } = displayForBounds(bounds);
  const x = snapX(width, bounds, workArea);
  return { x, y: clampWidgetY(bounds.y, height, x, width, workArea), width, height };
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
  animateTo(widgetWindow, snappedWidgetBounds(WIDGET_PILL.width, WIDGET_PILL.height, b));
}
function expandWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const b = widgetWindow.getBounds();
  animateTo(widgetWindow, snappedWidgetBounds(WIDGET_FULL.width, WIDGET_FULL.height, b));
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
    () => animateTo(wnd, {
      x: workArea.x + workArea.width - WIDGET_FULL.width - WIDGET_EDGE_GAP,
      y: workArea.y + WIDGET_RIGHT_SAFE_TOP,
      ...WIDGET_FULL,
    }, 460),
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
  const remembered = state.x != null && state.y != null
    ? { x: state.x, y: state.y, ...WIDGET_PILL }
    : null;
  const { workArea } = remembered ? screen.getDisplayMatching(remembered) : screen.getPrimaryDisplay();
  const initialBounds = remembered ?? {
    x: workArea.x + workArea.width - WIDGET_PILL.width - WIDGET_EDGE_GAP,
    y: workArea.y + WIDGET_RIGHT_SAFE_TOP,
    ...WIDGET_PILL,
  };
  const x = snapX(WIDGET_PILL.width, initialBounds, workArea);
  programmaticMove = true;
  wnd.setBounds({
    x,
    y: Math.round(clampWidgetY(
      state.y ?? workArea.y + WIDGET_RIGHT_SAFE_TOP,
      WIDGET_PILL.height,
      x,
      WIDGET_PILL.width,
      workArea,
    )),
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
      { label: 'Abrir Pulso Teams', click: openTeams },
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
  TEAMS_URL = readTeamsUrl();
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

ipcMain.on('widget:hide', (e) => { if (isPulsoRenderer(e)) hideWidget(); });
ipcMain.on('widget:show', (e, mode) => { if (isPulsoRenderer(e)) showWidget(mode); });
ipcMain.on('widget:collapse', (e) => { if (isPulsoRenderer(e)) collapseWidget(); });
ipcMain.on('widget:expand', (e) => { if (isPulsoRenderer(e)) expandWidget(); });
ipcMain.on('widget:view', (e, view) => { if (isPulsoRenderer(e)) applyWidgetView(view, false); });
ipcMain.on('widget:intro', (e, mode) => { if (isLocalRenderer(e)) introWidget(mode); });
// La web avisa cuando el espacio de trabajo está listo (personal onboarded o
// sesión Teams activa) → abrimos el widget minimizado en el borde (no invasivo).
ipcMain.on('pulso:personal-ready', (e) => { if (isLocalRenderer(e)) openWidgetCollapsed('personal'); });
ipcMain.on('pulso:auth', (e, s) => {
  if (isTeamsRenderer(e) && s === 'authed') openWidgetCollapsed('teams');
});
ipcMain.on('pulso:teams-auth', (e) => {
  if (isTeamsRenderer(e) || isLocalRenderer(e)) void authenticateTeams();
});

// Pulso Teams (web): configurar la URL del server y abrir la ventana remota.
ipcMain.handle('pulso:get-teams-url', (e) => { requireLocalRenderer(e); return TEAMS_URL; });
ipcMain.handle('pulso:connect-account', (e) => {
  requireLocalRenderer(e);
  return authenticatePulsoAccount(false);
});
ipcMain.handle('pulso:account-ai-status', (e) => {
  requireLocalRenderer(e);
  return accountAiFetch('GET');
});
ipcMain.handle('pulso:account-ai-request', (e, payload) => {
  requireLocalRenderer(e);
  if (!payload || typeof payload !== 'object' || !['draft', 'task'].includes(payload.operation)) {
    return { ok: false, status: 400, error: 'invalid_input' };
  }
  return accountAiFetch('POST', payload);
});
ipcMain.handle('pulso:personal-ai-key-store', (e, provider, apiKey) => {
  requireLocalRenderer(e);
  try { return storePersonalAiSecret(provider, apiKey); } catch { return false; }
});
ipcMain.handle('pulso:personal-ai-key-load', (e, provider) => {
  requireLocalRenderer(e);
  return loadPersonalAiSecret(provider);
});
ipcMain.handle('pulso:personal-ai-key-delete', (e, provider) => {
  requireLocalRenderer(e);
  try { return deletePersonalAiSecret(provider); } catch { return false; }
});
ipcMain.on('pulso:set-teams-url', (e, url) => {
  if (!isLocalRenderer(e)) return;
  try {
    writeTeamsUrl(url);
  } catch (err) {
    logDesktop(`teams URL rejected: ${err == null ? '' : err.message || err}`);
  }
});
ipcMain.on('pulso:open-teams', (e) => { if (isLocalRenderer(e)) openTeams(); });
// "Ir a Personal" desde la ventana Teams (login o sesión): cierra Teams y
// vuelve al espacio Personal sin tocar ninguna configuración.
ipcMain.on('pulso:back-to-personal', (e) => {
  if (!isTeamsRenderer(e)) return;
  if (teamsWindow && !teamsWindow.isDestroyed()) teamsWindow.close();
  createMainWindow();
});

// Carpeta Markdown (modo Personal): elegir carpeta y agregar entradas aprobadas.
ipcMain.handle('pulso:choose-folder', async (e) => {
  requireLocalRenderer(e);
  return chooseFolder(BrowserWindow.fromWebContents(e.sender));
});
ipcMain.handle('pulso:export-markdown', (e, payload) => {
  requireLocalRenderer(e);
  return exportMarkdown(payload?.dir, payload?.fileName, payload?.text, payload?.subdir, payload?.header, (err) =>
    logDesktop(`export-markdown falló: ${err.message}`),
  );
});
ipcMain.handle('pulso:read-notes-context', (e, payload) => {
  requireLocalRenderer(e);
  const dir = payload?.dir;
  const query = typeof payload?.query === 'string' ? payload.query.trim() : '';
  const budget = Math.min(Math.max(Number(payload?.maxChars) || 3000, 500), 8000);
  const queryVector = Array.isArray(payload?.queryVector) ? payload.queryVector : null;

  // Híbrido (BM25 + embeddings vía RRF) solo si hay query Y un vector de esa
  // query. Sin vector (embeddings apagados o proveedor sin soporte), o sin
  // query, se comporta exactamente igual que antes (BM25 puro / recientes).
  if (typeof dir === 'string' && dir.length > 0 && query.length > 0 && queryVector) {
    try {
      const chunks = embeddingsIndex.hybridSearch(dir, query, queryVector, 12, embeddingsCacheDir());
      const out = chunksToContext(chunks, budget);
      if (out) return out;
    } catch {
      /* si el híbrido falla por lo que sea, cae a BM25/recientes abajo */
    }
  }
  return retrieveNotesContext(dir, query, budget);
});

// Asistente de notas — embeddings (etapa 2b): qué falta vectorizar, guardar
// vectores recién calculados, y un status liviano para la UI de indexado.
ipcMain.handle('pulso:embeddings-pending', (e, payload) => {
  requireLocalRenderer(e);
  return embeddingsIndex.pendingChunks(payload?.dir, payload?.model, embeddingsCacheDir());
});
ipcMain.handle('pulso:embeddings-save', (e, payload) => {
  requireLocalRenderer(e);
  return embeddingsIndex.saveEmbeddings(payload?.dir, payload?.model, payload?.entries, embeddingsCacheDir());
});
ipcMain.handle('pulso:embeddings-status', (e, payload) => {
  requireLocalRenderer(e);
  return embeddingsIndex.status(payload?.dir, payload?.model, embeddingsCacheDir());
});

// Captura rápida de pantalla. Oculta el widget un instante para no salir en la foto.
ipcMain.handle('pulso:screenshot', async (e) => {
  requireLocalRenderer(e);
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
