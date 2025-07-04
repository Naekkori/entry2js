const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    startConvert: (FilePath) => ipcRenderer.invoke('conv:Start', FilePath),
    onProcessLog: (callback) => ipcRenderer.on('proc:log', (_event, value) => callback(value))
});