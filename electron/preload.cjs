const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('teach', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (data) => ipcRenderer.invoke('state:save', data),
  connect: (opts) => ipcRenderer.invoke('agent:connect', opts),
  disconnect: () => ipcRenderer.invoke('agent:disconnect'),
  setMethod: (method) => ipcRenderer.invoke('agent:setMethod', method),
  setModel: (model) => ipcRenderer.invoke('agent:setModel', model),
  startCourse: (payload) => ipcRenderer.invoke('teach:start', payload),
  nextLesson: (payload) => ipcRenderer.invoke('teach:next', payload),
  askThread: (payload) => ipcRenderer.invoke('teach:thread', payload),
  getLogs: () => ipcRenderer.invoke('log:history'),
  clearLogs: () => ipcRenderer.invoke('log:clear'),
  onLog: (cb) => {
    const h = (_e, entry) => cb(entry);
    ipcRenderer.on('agent:log', h);
    return () => ipcRenderer.removeListener('agent:log', h);
  },
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('update:status', h);
    return () => ipcRenderer.removeListener('update:status', h);
  },
});
