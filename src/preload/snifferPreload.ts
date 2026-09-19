import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('aniscribeSniffer', {
  batchExtract: (url: string) => ipcRenderer.send('aniscribe:batchExtractFromPage', url),
  queueAll: () => ipcRenderer.send('aniscribe:queueAllCaptured'),
  setCookie: (val: string) => ipcRenderer.send('aniscribe:setCookie', val),
});
