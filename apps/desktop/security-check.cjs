const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const remotePreload = fs.readFileSync(path.join(__dirname, 'preload-teams.js'), 'utf8');

const requirements = [
  [main.includes("preload: path.join(__dirname, 'preload-teams.js')"), 'Teams debe usar preload remoto dedicado'],
  [main.includes("widgetMode === 'teams' ? 'preload-teams.js' : 'preload.js'"), 'Widget Teams debe usar preload remoto dedicado'],
  [main.includes('if (modeChanged)'), 'El widget debe recrearse al cambiar entre Personal y Teams'],
  [main.includes('contextIsolation: true'), 'contextIsolation debe estar activo'],
  [main.includes('nodeIntegration: false'), 'nodeIntegration debe estar desactivado'],
  [main.includes('sandbox: true'), 'sandbox debe estar activo'],
  [main.includes("webContents.on('will-attach-webview'"), 'Teams debe bloquear webviews'],
  [main.includes("ipcMain.handle('pulso:screenshot', async (e)"), 'screenshot debe validar el sender'],
  [main.includes('requireLocalRenderer(e);'), 'IPC privilegiado debe exigir renderer local'],
  [!remotePreload.includes('screenshot'), 'preload remoto no debe exponer screenshot'],
  [!remotePreload.includes('export-markdown'), 'preload remoto no debe exponer filesystem'],
  [!remotePreload.includes('read-notes-context'), 'preload remoto no debe exponer notas'],
];

const failed = requirements.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error(failed.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}
console.log('Electron security checks: OK');
