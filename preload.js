const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openCompilerPath: () => ipcRenderer.invoke('dialog:openCompilerPath'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    getProgramInfo: () => ipcRenderer.invoke('info:get'),
    setCompileFlag:(flag)=>ipcRenderer.invoke('flag:set',flag),
    getCompileFlag:()=>ipcRenderer.invoke('flag:get'),
    startConvert: (FilePath) => ipcRenderer.invoke('conv:Start', FilePath),
    onProcessLog: (callback) => ipcRenderer.on('proc:log', (_event, value) => callback(value))
});