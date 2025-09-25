console.log(`[PRELOAD] preload.js loaded at ${Date.now()}`);
const { contextBridge, ipcRenderer } = require('electron');

console.log(`[PRELOAD] contextBridge.exposeInMainWorld called at ${Date.now()}`);
contextBridge.exposeInMainWorld('electronAPI', {
    openCompilerPath: () => ipcRenderer.invoke('dialog:openCompilerPath'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    getProgramInfo: () => ipcRenderer.invoke('info:get'),
    setCompileFlag:(flag)=>ipcRenderer.invoke('flag:set',flag),
    getCompileFlag:()=>ipcRenderer.invoke('flag:get'),
    startConvert: (FilePath) => ipcRenderer.invoke('conv:Start', FilePath),
    onProcessLog: (callback) => ipcRenderer.on('proc:log', (_event, value) => callback(value))
});
console.log(`[PRELOAD] contextBridge.exposeInMainWorld finished at ${Date.now()}`);