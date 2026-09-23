import { createWorkspaceAPI } from '../shared/workspace-api';
import { decodeMessage, encodeMessage } from '../shared/browser-wire';
import type { WorkspaceAPI } from '../shared/types';

export const browserMode = !window.imagine;
const listeners = new Map<string, Set<(...args: any[]) => void>>();
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let nextId = 0;
let socket: WebSocket;
let ready: Promise<void>;
let disconnected = false;
function showConnectionError(message: string) {
  disconnected = true;
  const overlay = document.createElement('div');
  overlay.className = 'browser-disconnected';
  overlay.setAttribute('role', 'alert');
  const title = document.createElement('h2');
  title.textContent = 'Workspace connection paused';
  const detail = document.createElement('p');
  detail.textContent = message;
  const reload = document.createElement('button');
  reload.className = 'primary';
  reload.textContent = 'Reconnect';
  reload.onclick = () => location.reload();
  overlay.append(title, detail, reload);
  document.body.append(overlay);
}

function chooseFolder(create: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'browser-project-dialog';
    const form = document.createElement('form');
    form.method = 'dialog';
    const title = document.createElement('h2');
    title.textContent = create ? 'Create Weave project' : 'Open Weave project';
    const label = document.createElement('label');
    label.textContent = 'Project folder on this computer';
    const input = document.createElement('input');
    input.required = true;
    input.placeholder = 'E:\\Codex\\My project\\Weave';
    input.autocomplete = 'off';
    label.append(input);
    const buttons = document.createElement('div');
    buttons.className = 'row';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => dialog.close();
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary';
    submit.textContent = create ? 'Create project' : 'Open project';
    form.onsubmit = (event) => {
      event.preventDefault();
      if (input.value.trim()) dialog.close(input.value.trim());
    };
    buttons.append(cancel, submit);
    form.append(title, label, buttons);
    dialog.append(form);
    dialog.onclose = () => {
      const value = dialog.returnValue;
      dialog.remove();
      resolve(value || null);
    };
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}

export function installBrowserAPI() {
  if (!browserMode) return;
  const token = document.querySelector<HTMLMetaElement>(
    'meta[name="imagine-browser-token"]',
  )?.content;
  if (!token) throw new Error('Start this workspace with npm run browser.');
  socket = new WebSocket(location.origin.replace(/^http/, 'ws') + '/bridge', 'imagine-' + token);
  ready = new Promise<void>((resolve, reject) => {
    socket.onmessage = (message) => {
      const data = decodeMessage(message.data);
      if (data.event === 'browser:ready') {
        resolve();
        return;
      }
      if (data.event) {
        for (const listener of listeners.get(data.event) || []) listener(...(data.args || []));
      } else {
        const call = pending.get(data.id);
        if (!call) return;
        pending.delete(data.id);
        data.error ? call.reject(new Error(data.error)) : call.resolve(data.result);
      }
    };
    socket.onclose = (event) => {
      const message =
        event.code === 4001
          ? 'This workspace is open in another tab. Close that tab, then reconnect here.'
          : 'The local server disconnected. Restart it, then reconnect. Requests are not retried automatically.';
      const error = new Error(message);
      reject(error);
      for (const call of pending.values()) call.reject(error);
      pending.clear();
      showConnectionError(message);
    };
  });
  // App effects attach their own error handlers; avoid an unhandled rejection before mount.
  void ready.catch(() => {});
  const invoke = async (channel: string, ...args: any[]) => {
    await ready;
    if (socket.readyState !== WebSocket.OPEN)
      throw new Error('The local workspace is disconnected.');
    return new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      const message = encodeMessage({ id, channel, args });
      if (message.length > 74_000_000) {
        reject(new Error('Import fewer images at a time.'));
        return;
      }
      pending.set(id, { resolve, reject });
      socket.send(message);
    });
  };
  const api: WorkspaceAPI = createWorkspaceAPI(
    invoke,
    (channel, callback) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(callback);
      return () => {
        listeners.get(channel)?.delete(callback);
      };
    },
    () => {},
  );
  api.chooseProject = async (create) => {
    const folder = await chooseFolder(create);
    return folder ? invoke('project:open-path', folder, create) : null;
  };
  window.imagine = api;
}

export function protectBrowserChanges(isDirty: () => boolean, flush: () => Promise<void>) {
  if (!browserMode) return;
  window.addEventListener('beforeunload', (event) => {
    if (!isDirty()) return;
    if (!disconnected) void flush().catch(() => {});
    event.preventDefault();
    event.returnValue = '';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !disconnected) void flush().catch(() => {});
  });
}
