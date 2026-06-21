// Puente seguro entre el widget web y el shell de escritorio.
// Expone window.pulso solo dentro de Electron; en el navegador no existe,
// así que la web detecta el contexto y adapta la UI (glass, drag, estados).
const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((a) => a.startsWith('--pulso-version=')) || '';
const appVersion = versionArg.split('=')[1] || '';

contextBridge.exposeInMainWorld('pulso', {
  isDesktop: true,
  version: appVersion,
  showWidget: () => ipcRenderer.send('widget:show'),
  hideWidget: () => ipcRenderer.send('widget:hide'),
  setView: (view) => ipcRenderer.send('widget:setView', view),
  // La web avisa cuando hay sesión (página autenticada montada) para que el
  // shell abra el widget. Señal confiable (las navegaciones de Next son "soft").
  authState: (state) => ipcRenderer.send('pulso:auth', state),
});
