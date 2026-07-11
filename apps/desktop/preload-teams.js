// Puente mínimo para contenido remoto de Pulso Teams.
// No expone archivos, notas, configuración, embeddings ni captura de pantalla.
const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((a) => a.startsWith('--pulso-version=')) || '';
const appVersion = versionArg.split('=')[1] || '';

contextBridge.exposeInMainWorld('pulso', {
  isDesktop: true,
  version: appVersion,
  showTeamsWidget: () => ipcRenderer.send('widget:show', 'teams'),
  authState: (state) => ipcRenderer.send('pulso:auth', state),
  backToPersonal: () => ipcRenderer.send('pulso:back-to-personal'),
});
