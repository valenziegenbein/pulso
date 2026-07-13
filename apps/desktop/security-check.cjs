const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const remotePreload = fs.readFileSync(path.join(__dirname, 'preload-teams.js'), 'utf8');
const localPreload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');

const requirements = [
  [main.includes("preload: path.join(__dirname, 'preload-teams.js')"), 'Teams debe usar preload remoto dedicado'],
  [main.includes("widgetMode === 'teams' ? 'preload-teams.js' : 'preload.js'"), 'Widget Teams debe usar preload remoto dedicado'],
  [main.includes('if (modeChanged)'), 'El widget debe recrearse al cambiar entre Personal y Teams'],
  [main.includes('contextIsolation: true'), 'contextIsolation debe estar activo'],
  [main.includes('nodeIntegration: false'), 'nodeIntegration debe estar desactivado'],
  [main.includes('sandbox: true'), 'sandbox debe estar activo'],
  [main.includes("webContents.on('will-attach-webview'"), 'Teams debe bloquear webviews'],
  [main.includes("const TEAMS_PARTITION = 'persist:pulso-teams'"), 'Teams debe usar una partición de sesión dedicada'],
  [main.includes("ipcMain.on('pulso:teams-auth'"), 'Desktop auth debe validar el sender en main'],
  [remotePreload.includes('beginTeamsAuth'), 'preload remoto debe exponer sólo el inicio PKCE'],
  [main.includes("ipcMain.handle('pulso:screenshot', async (e)"), 'screenshot debe validar el sender'],
  [main.includes('requireLocalRenderer(e);'), 'IPC privilegiado debe exigir renderer local'],
  [!remotePreload.includes('screenshot'), 'preload remoto no debe exponer screenshot'],
  [!remotePreload.includes('export-markdown'), 'preload remoto no debe exponer filesystem'],
  [!remotePreload.includes('read-notes-context'), 'preload remoto no debe exponer notas'],
  [main.includes("ipcMain.handle('pulso:account-ai-request'"), 'Personal AI debe resolverse en main'],
  [main.includes("requireLocalRenderer(e);\n  if (!payload"), 'Personal AI debe exigir renderer local'],
  [localPreload.includes('accountAiRequest'), 'preload local debe exponer Personal AI'],
  [!remotePreload.includes('accountAiRequest'), 'preload remoto no debe exponer Personal AI'],
  [main.includes("new URL('/api/desktop/personal-ai', TEAMS_URL)"), 'Personal AI debe usar una ruta remota fija'],
  [main.includes("LEGACY_PULSO_SERVER_URL = 'https://pulso.syswarm.com'") && main.includes("DEFAULT_PULSO_SERVER_URL = 'https://pulsoapp.syswarm.com'"), 'Desktop debe migrar el dominio SaaS anterior'],
];

const failed = requirements.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error(failed.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}
console.log('Electron security checks: OK');
