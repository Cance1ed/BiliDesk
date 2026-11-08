const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wallpaper', {
  ready: () => ipcRenderer.invoke('wallpaper:ready'),
  report: (type, generation) => ipcRenderer.send('wallpaper:report', { type, generation }),
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('wallpaper:command', listener);
    return () => ipcRenderer.removeListener('wallpaper:command', listener);
  },
});
