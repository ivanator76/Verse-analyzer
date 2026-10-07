const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  exportPdf: (orientation) => ipcRenderer.invoke('export-pdf', orientation),
  print: () => ipcRenderer.invoke('print'),
  openHelp: (anchor) => ipcRenderer.invoke('help:open', anchor),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (p) => ipcRenderer.invoke('prefs:set', p),
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (args) => ipcRenderer.invoke('file:save', args),
  listBackups: (currentPath) => ipcRenderer.invoke('backups:list', currentPath),
  readBackup: (file) => ipcRenderer.invoke('backups:read', file),
  revealBackup: (file) => ipcRenderer.invoke('backups:reveal', file),
  writeRecovery: (args) => ipcRenderer.invoke('recovery:write', args),
  deleteRecovery: (id) => ipcRenderer.invoke('recovery:delete', id),
  listRecovery: () => ipcRenderer.invoke('recovery:list'),
  setDirty: (s) => ipcRenderer.send('set-dirty', s),
  onRequestSave: (cb) => {
    ipcRenderer.on('request-save', () => cb());
  },
  saveResult: (ok) => ipcRenderer.send('save-result', ok),
});
