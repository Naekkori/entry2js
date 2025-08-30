const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openCompilerPath: () => ipcRenderer.invoke('dialog:openCompilerPath'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    startConvert: (FilePath) => ipcRenderer.invoke('conv:Start', FilePath),
    onProcessLog: (callback) => ipcRenderer.on('proc:log', (_event, value) => callback(value))
});