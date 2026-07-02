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
});
