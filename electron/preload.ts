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
api.startAssetDrag = (ids) => ipcRenderer.send('asset:start-drag', ids);
api.onAssetDragError = (callback) => {
  const listener = (_event: unknown, message: string) => callback(message);
  ipcRenderer.on('asset:drag-error', listener);
  return () => ipcRenderer.removeListener('asset:drag-error', listener);
};
contextBridge.exposeInMainWorld('imagine', api);
