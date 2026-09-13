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
  findPrevious: (query) => ipcRenderer.invoke('archive:findPrevious', query),
  archiveSecurityStatus: () => ipcRenderer.invoke('archive:security:status'),
  archiveEnable: (opts) => ipcRenderer.invoke('archive:security:enable', opts),
  archiveUnlock: (opts) => ipcRenderer.invoke('archive:security:unlock', opts),
  archiveSetPassword: (opts) => ipcRenderer.invoke('archive:security:setPassword', opts),
  archiveRenewRecovery: () => ipcRenderer.invoke('archive:security:renewRecovery'),
  archiveDisable: () => ipcRenderer.invoke('archive:security:disable'),

  copyText: (t) => ipcRenderer.invoke('clipboard:write', t),
  exportPdf: (name) => ipcRenderer.invoke('pdf:export', name),
  print: () => ipcRenderer.invoke('print'),

  onGdtRequest: (cb) => ipcRenderer.on('gdt:request', (_e, req) => cb(req)),
  gdtReady: () => ipcRenderer.invoke('gdt:ready'),
  gdtSend: (data) => ipcRenderer.invoke('gdt:send', data),
  gdtCheckDir: (dir) => ipcRenderer.invoke('gdt:checkDir', dir),
  onGdtStatus: (cb) => ipcRenderer.on('gdt:status', (_e, status) => cb(status)),
  openGuide: (anchor) => ipcRenderer.invoke('open:guide', anchor),

  importSr: () => ipcRenderer.invoke('sr:import'),

  chooseProfile: () => ipcRenderer.invoke('profile:choose'),
  profileRead: (file) => ipcRenderer.invoke('profile:read', file),
  profileWrite: (file, data, stamp, force) => ipcRenderer.invoke('profile:write', file, data, stamp, force),

  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  openRelease: (url) => ipcRenderer.invoke('open:release', url),
});
