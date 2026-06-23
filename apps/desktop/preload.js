// Puente seguro entre el widget web y el shell de escritorio.
// Expone window.pulso solo dentro de Electron; en el navegador no existe,
// así que la web detecta el contexto y adapta la UI (glass, drag, estados).
const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((a) => a.startsWith('--pulso-version=')) || '';
const appVersion = versionArg.split('=')[1] || '';

contextBridge.exposeInMainWorld('pulso', {
  isDesktop: true,
  version: appVersion,
  showWidget: (mode) => ipcRenderer.send('widget:show', mode),
  showPersonalWidget: () => ipcRenderer.send('widget:show', 'personal'),
  showTeamsWidget: () => ipcRenderer.send('widget:show', 'teams'),
  hideWidget: () => ipcRenderer.send('widget:hide'),
  setView: (view) => ipcRenderer.send('widget:view', view),
  onWidgetView: (handler) => {
    const listener = (_event, view) => handler(view);
    ipcRenderer.on('widget:view-state', listener);
    return () => ipcRenderer.removeListener('widget:view-state', listener);
  },
  // Minimizar (pill pegada al borde) / expandir el widget flotante.
  collapse: () => ipcRenderer.send('widget:collapse'),
  expand: () => ipcRenderer.send('widget:expand'),
  // Onboarding: materializa el widget real y lo snapea al borde (efecto sorpresa).
  introWidget: (mode) => ipcRenderer.send('widget:intro', mode),
  // Captura rápida de pantalla → devuelve un data URL (JPEG) o null.
  screenshot: () => ipcRenderer.invoke('pulso:screenshot'),
  // La web avisa cuando el espacio de trabajo está listo para que el shell abra
  // el widget (señal confiable: las navegaciones de Next son client-side "soft").
  personalReady: () => ipcRenderer.send('pulso:personal-ready'),
  authState: (state) => ipcRenderer.send('pulso:auth', state),
});
