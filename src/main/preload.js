const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  exportSettings: (s) => ipcRenderer.invoke('settings:export', s),
  importSettings: () => ipcRenderer.invoke('settings:import'),

  archiveDir: () => ipcRenderer.invoke('archive:dir'),
  chooseArchiveDir: () => ipcRenderer.invoke('archive:chooseDir'),
  listRecords: () => ipcRenderer.invoke('archive:list'),
  loadRecord: (id) => ipcRenderer.invoke('archive:load', id),
  saveRecord: (r) => ipcRenderer.invoke('archive:save', r),
  deleteRecord: (id) => ipcRenderer.invoke('archive:delete', id),

  copyText: (t) => ipcRenderer.invoke('clipboard:write', t),
  exportPdf: (name) => ipcRenderer.invoke('pdf:export', name),
  print: () => ipcRenderer.invoke('print'),

  onGdtRequest: (cb) => ipcRenderer.on('gdt:request', (_e, req) => cb(req)),
  gdtReady: () => ipcRenderer.invoke('gdt:ready'),
  gdtSend: (data) => ipcRenderer.invoke('gdt:send', data),
  gdtCheckDir: (dir) => ipcRenderer.invoke('gdt:checkDir', dir),
});
