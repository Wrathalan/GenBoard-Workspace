import { contextBridge, ipcRenderer } from 'electron';
import { createWorkspaceAPI } from '../shared/workspace-api';
const api = createWorkspaceAPI(
  (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  (channel, callback) => {
    const listener = (_event: unknown, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  () => ipcRenderer.send('app:finish-close'),
);
contextBridge.exposeInMainWorld('imagine', api);
