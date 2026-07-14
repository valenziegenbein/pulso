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
  // Pulso Teams (web): el desktop abre el server remoto en su propia ventana.
  getTeamsUrl: () => ipcRenderer.invoke('pulso:get-teams-url'),
  setTeamsUrl: (url) => ipcRenderer.send('pulso:set-teams-url', url),
  openTeams: () => ipcRenderer.send('pulso:open-teams'),
  // Personal AI con cuenta: la cookie remota queda en la partición segura de
  // Electron. El renderer local nunca recibe el token ni la API key administrada.
  connectAccount: () => ipcRenderer.invoke('pulso:connect-account'),
  accountAiStatus: () => ipcRenderer.invoke('pulso:account-ai-status'),
  accountAiRequest: (payload) => ipcRenderer.invoke('pulso:account-ai-request', payload),
  knowledgeTargets: () => ipcRenderer.invoke('pulso:knowledge-targets'),
  deleteKnowledgeSource: (sourceId) => ipcRenderer.invoke('pulso:knowledge-source-delete', sourceId),
  syncKnowledgeFolder: (payload) => ipcRenderer.invoke('pulso:knowledge-sync-folder', payload),
  storePersonalAiKey: (provider, apiKey) => ipcRenderer.invoke('pulso:personal-ai-key-store', provider, apiKey),
  loadPersonalAiKey: (provider) => ipcRenderer.invoke('pulso:personal-ai-key-load', provider),
  deletePersonalAiKey: (provider) => ipcRenderer.invoke('pulso:personal-ai-key-delete', provider),
  // "Ir a Personal": cierra la ventana Teams y vuelve al espacio Personal.
  backToPersonal: () => ipcRenderer.send('pulso:back-to-personal'),
  // Carpeta Markdown (Personal): elegir carpeta destino y agregar entradas .md.
  chooseFolder: () => ipcRenderer.invoke('pulso:choose-folder'),
  exportMarkdown: (payload) => ipcRenderer.invoke('pulso:export-markdown', payload),
  // Importar desde una carpeta Markdown / Obsidian: reconstruye entradas
  // propias de Pulso o las trae como notas genéricas.
  importMarkdown: (payload) => ipcRenderer.invoke('pulso:import-markdown', payload),
  // Asistente de notas: extractos relevantes (BM25 y, si se pasa queryVector,
  // híbrido con embeddings) o recientes de una carpeta (solo lectura).
  readNotesContext: (payload) => ipcRenderer.invoke('pulso:read-notes-context', payload),
  // Asistente de notas — embeddings (etapa 2b, opt-in): indexado explícito.
  embeddingsPending: (payload) => ipcRenderer.invoke('pulso:embeddings-pending', payload),
  embeddingsSave: (payload) => ipcRenderer.invoke('pulso:embeddings-save', payload),
  embeddingsStatus: (payload) => ipcRenderer.invoke('pulso:embeddings-status', payload),
  // El panel escucha si falta configurar la URL del server Teams.
  onNeedTeamsUrl: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('pulso:need-teams-url', listener);
    return () => ipcRenderer.removeListener('pulso:need-teams-url', listener);
  },
});
