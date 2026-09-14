import { contextBridge, ipcRenderer } from 'electron';
import type { WorkspaceAPI } from '../shared/types';
const api: WorkspaceAPI = {
  codexStatus: () => ipcRenderer.invoke('codex:status'),
  codexLogin: () => ipcRenderer.invoke('codex:login'),
  codexLogout: () => ipcRenderer.invoke('codex:logout'),
  codexChoose: () => ipcRenderer.invoke('codex:choose'),
  codexRun: (board, prompt) => ipcRenderer.invoke('codex:run', board, prompt),
  codexStop: () => ipcRenderer.invoke('codex:stop'),
  codexToolResult: (id, result, error) =>
    ipcRenderer.invoke('codex:tool-result', id, result, error),
  onCodexEvent: (callback) => {
    const listener = (_: unknown, event: any) => callback(event);
    ipcRenderer.on('codex:event', listener);
    return () => ipcRenderer.removeListener('codex:event', listener);
  },
  onCodexTool: (callback) => {
    const listener = (_: unknown, call: any) => callback(call);
    ipcRenderer.on('codex:tool', listener);
    return () => ipcRenderer.removeListener('codex:tool', listener);
  },
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
