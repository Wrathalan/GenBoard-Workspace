import { contextBridge, ipcRenderer } from 'electron';
import type { WorkspaceAPI } from '../shared/types';
const api: WorkspaceAPI = {
  chooseProject: (create) => ipcRenderer.invoke('project:choose', create),
  currentProject: () => ipcRenderer.invoke('project:current'),
  saveBoard: (board, known) => ipcRenderer.invoke('board:save', board, known),
  createBoard: (name) => ipcRenderer.invoke('board:create', name),
  activateBoard: (id) => ipcRenderer.invoke('board:activate', id),
  importImages: (files) => ipcRenderer.invoke('asset:import', files),
  clipboardImage: () => ipcRenderer.invoke('asset:clipboard'),
  copyAssetImage: (id) => ipcRenderer.invoke('asset:copy-image', id),
  exportAsset: (id) => ipcRenderer.invoke('asset:export', id),
  revealAsset: (id) => ipcRenderer.invoke('asset:reveal', id),
  saveStyle: (style) => ipcRenderer.invoke('style:save', style),
  importWorkflow: () => ipcRenderer.invoke('workflow:import'),
  saveTemplate: (t) => ipcRenderer.invoke('workflow:save', t),
  verifyOffline: (templateId, jobId) =>
    ipcRenderer.invoke('workflow:verify-offline', templateId, jobId),
  connect: (port) => ipcRenderer.invoke('comfy:connect', port),
  validateTemplate: (t) => ipcRenderer.invoke('workflow:validate', t),
  generate: (request) => ipcRenderer.invoke('job:generate', request),
  cancelJob: (id) => ipcRenderer.invoke('job:cancel', id),
  retryJob: (id) => ipcRenderer.invoke('job:retry', id),
  reconcile: () => ipcRenderer.invoke('job:reconcile'),
  onUpdate: (callback) => {
    const listener = (_event: unknown, p: any) => callback(p);
    ipcRenderer.on('project:update', listener);
    return () => ipcRenderer.removeListener('project:update', listener);
  },
  onClosing: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:closing', listener);
    return () => ipcRenderer.removeListener('app:closing', listener);
  },
  finishClose: () => ipcRenderer.send('app:finish-close'),
};
contextBridge.exposeInMainWorld('imagine', api);
