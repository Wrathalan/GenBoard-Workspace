import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  Menu,
} from 'electron';
import fs from 'node:fs';
import { startBrowserServer } from './browser-server';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { RecentProjects } from './recent-projects';
import { ProjectStore, contained } from './project';
import { JobService } from './jobs';
import { parseWorkflow, validateWorkflow } from '../shared/workflow';
import type { CodexRunOptions } from '../shared/codex';
import type { Asset, Board, GenerateRequest, Template } from '../shared/types';
import { CodexHarness } from './codex';
import { copyAssetImage, exportAsset, revealAsset } from './asset-actions';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'imagine',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
const browserMode = process.argv.includes('--browser');
let browserServer: Awaited<ReturnType<typeof startBrowserServer>> | undefined;
const handlers = new Map<string, (...args: any[]) => any>();
let win: BrowserWindow;
function send(channel: string, ...args: any[]) {
  if (browserMode) browserServer?.emit(channel, ...args);
  else if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}
let store: ProjectStore | undefined;
let jobs: JobService | undefined;
let closing = false;
const recentProjects = () =>
  new RecentProjects(
    path.join(
      process.env.IMAGINE_TEST === '1'
        ? path.resolve('.test-data', 'preferences')
        : app.getPath('userData'),
      'recent-projects.json',
    ),
  );
let codex: CodexHarness;
const codexTools = new Map<
  string,
  {
    resolve: (r: unknown) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
async function executeCodexTool(boardId: string, action: string, args: Record<string, unknown>) {
  const project = requireStore().snapshot();
  if (project.activeBoardId !== boardId)
    throw new Error('The active board changed. Start a new request.');
  if (action === 'ingest_codex_image') {
    const current = requireStore();
    const bytes = Buffer.from(args.bytes as Uint8Array);
    if (bytes.length > 50_000_000) throw new Error('Generated image is too large.');
    const asset = await current.importAsset(bytes, `Codex image ${Date.now()}.png`, true);
    current.setting(
      'codex-image:' + String(args.providerItemId),
      JSON.stringify({
        assetId: asset.id,
        sourceIds: args.sourceIds,
        revisedPrompt: args.revisedPrompt,
        createdAt: Date.now(),
      }),
    );
    emit();
    await executeCodexTool(boardId, 'place_codex_image', {
      assetId: asset.id,
      position: args.position,
    });
    return { assetId: asset.id };
  }
  if (action === 'connect') {
    const c = await jobs!.connect(Number(args.port || 8188));
    return { checkpoints: c.checkpoints, device: c.device };
  }
  if (action === 'cancel_job' || action === 'retry_job') {
    const j = project.jobs.find((j) => j.id === args.id && j.boardId === boardId);
    if (!j) throw new Error('Unknown job on this board.');
    return action === 'cancel_job' ? await jobs!.cancel(j.id) : await jobs!.retry(j.id);
  }
  if (action === 'reconcile') {
    await jobs!.tick();
    return {
      jobs: requireStore()
        .snapshot()
        .jobs.filter((j) => j.boardId === boardId),
    };
  }
  return new Promise<unknown>((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => {
      codexTools.delete(id);
      reject(new Error('Workspace action timed out. Inspect the board/jobs before retrying.'));
    }, 45000);
    codexTools.set(id, { resolve, reject, timer });
    send('codex:tool', {
      id,
      boardId,
      action,
      args,
      caps: jobs?.caps ? { checkpoints: jobs.caps.checkpoints, device: jobs.caps.device } : null,
    });
  });
}
const requireStore = () => {
  if (!store) throw new Error('Open or create a project first.');
  return store;
};
function emit() {
  if (store) send('project:update', store.snapshot());
}
async function openProject(folder: string, create: boolean) {
  if (codex?.busy) throw new Error('Stop the Codex turn before switching projects.');
  if (store?.folder === fs.realpathSync(folder)) {
    const p = store.snapshot();
    recentProjects().record(p.folder, p.name);
    return p;
  }
  if (
    jobs?.busy ||
    store
      ?.list<any>('jobs')
      .some((j) => ['running', 'submitting', 'queued', 'connection-unknown'].includes(j.state))
  )
    throw new Error('Finish or cancel active jobs before switching projects.');
  const sourceStyle = fs.readFileSync(path.join(__dirname, 'graphic-anime-generation.md'), 'utf8');
  const style =
    'Preserve the subject’s strongest likeness and identity. Use bold graphic anime forms inspired by Gurren Lagann / Studio Trigger. Preserve facial structure, age, anatomy, signature silhouette, clothing coverage, equipment, and palette. Reference roles and the current request determine identity and composition.\n\n' +
    sourceStyle
      .split('POSE AND PROPORTIONS')[1]
      .split('## Universal refinement prompt')[0]
      .replace(/\[[^\]]*\]/g, '')
      .trim();
  const next = new ProjectStore(folder, create, style);
  try {
    const p = next.snapshot();
    recentProjects().record(p.folder, p.name);
  } catch (e) {
    next.close();
    throw e;
  }
  jobs?.close();
  store?.close();
  store = next;
  jobs = new JobService(store, emit);
  return store.snapshot();
}
function handle(name: string, fn: (...args: any[]) => any) {
  handlers.set(name, fn);
  ipcMain.handle(name, (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
      throw new Error('Invalid IPC sender.');
    return fn(...args);
  });
}
app
  .whenReady()
  .then(async () => {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !/^(file:|imagine:|devtools:)/.test(details.url) }),
    );
    session.defaultSession.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
    protocol.handle('imagine', async (request) => {
      try {
        const u = new URL(request.url);
        const a = requireStore()
          .list<Asset>('assets')
          .find((a) => a.id === u.hostname);
        if (!a || !['/original', '/thumbnail'].includes(u.pathname))
          return new Response('Not found', { status: 404 });
        const file = contained(
          requireStore().folder,
          u.pathname === '/original' ? a.path : a.thumbnail,
        );
        return net.fetch(pathToFileURL(file).toString());
      } catch {
        return new Response('Unavailable', { status: 404 });
      }
    });
    win = new BrowserWindow({
      show: !browserMode,
      width: 1500,
      height: 950,
      minWidth: 900,
      minHeight: 620,
      backgroundColor: '#111110',
      title: 'Local Imagine Workspace',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('context-menu', (_event, params) => {
      if (!params.isEditable) return;
      Menu.buildFromTemplate([
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' },
      ]).popup({ window: win });
    });
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.on('close', (e) => {
      if (browserMode) return;
      if (!closing) {
        e.preventDefault();
        win.webContents.send('app:closing');
      }
    });
    codex = new CodexHarness(win, executeCodexTool, undefined, (event) =>
      send('codex:event', event),
    );
    handle('codex:status', () => codex.status());
    handle('codex:login', () => codex.login());
    handle('codex:logout', () => codex.logout());
    handle('codex:choose', () => codex.choose());
    handle('codex:run', (boardId: string, prompt: string, options: CodexRunOptions = {}) => {
      if (requireStore().snapshot().activeBoardId !== boardId) throw new Error('Board changed.');
      const ids = options.referenceAssetIds || [];
      if (!Array.isArray(ids) || ids.length > 5 || ids.some((id) => typeof id !== 'string'))
        throw new Error('Attach up to five images.');
      const project = requireStore().snapshot();
      const images = ids.map((id) => {
        const a = project.assets.find((a) => a.id === id);
        if (!a) throw new Error('Unknown reference asset.');
        return contained(requireStore().folder, a.path);
      });
      const position = options.position || { x: 0, y: 0 };
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
        throw new Error('Invalid output position.');
      return codex.run(boardId, prompt, { images, referenceAssetIds: ids, position });
    });
    handle('codex:new-chat', () => codex.newChat());
    handle('codex:stop', () => codex.stop());
    handle('codex:tool-result', (id: string, result: unknown, error?: string) => {
      const pending = codexTools.get(id);
      if (!pending) throw new Error('Expired workspace request.');
      codexTools.delete(id);
      clearTimeout(pending.timer);
      error ? pending.reject(new Error(error)) : pending.resolve(result);
    });
    win.on('closed', () => {
      codex.close();
      for (const p of codexTools.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('Window closed.'));
      }
      codexTools.clear();
    });
    handle('project:choose', async (create: boolean) => {
      const selection = await dialog.showOpenDialog(win, {
        title: create ? 'Choose a folder for your project' : 'Open Imagine project folder',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (selection.canceled) return null;
      return openProject(selection.filePaths[0], create);
    });
    if (browserMode)
      handle('project:open-path', async (folder: string, create: boolean) => {
        if (typeof folder !== 'string' || !path.isAbsolute(folder) || typeof create !== 'boolean')
          throw new Error('Enter the full path to a project folder on this computer.');
        if (create && !fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        return openProject(folder, create);
      });
    handle('project:recent', () => recentProjects().list());
    handle('project:open-recent', (id: string) => openProject(recentProjects().resolve(id), false));
    handle('project:forget-recent', (id: string) => recentProjects().remove(id));
    handle('project:current', () => store?.snapshot() || null);
    handle('board:save', (b: Board, known?: string[]) => {
      requireStore().saveBoard(b, known);
      emit();
    });
    handle('board:create', (name: string) => requireStore().createBoard(name));
    handle('board:activate', (id: string) => {
      if (codex.busy) throw new Error('Stop the Codex turn before switching boards.');
      if (
        !requireStore()
          .list<Board>('boards')
          .some((b) => b.id === id)
      )
        throw new Error('Unknown board');
      requireStore().setting('activeBoardId', id);
    });
    handle('asset:import', async (files?: { name: string; bytes: Uint8Array }[]) => {
      const s = requireStore();
      if (!files) {
        const result = await dialog.showOpenDialog(win, {
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        });
        if (result.canceled) return [];
        files = result.filePaths.map((file) => ({
          name: path.basename(file),
          bytes: fs.readFileSync(file),
        }));
      }
      if (files.length > 500) throw new Error('Import up to 500 images at a time.');
      const assets: Asset[] = [];
      for (const file of files)
        assets.push(await s.importAsset(Buffer.from(file.bytes), file.name));
      return assets;
    });
    handle('asset:clipboard', async () => {
      const items = await clipboard.read();
      const image = items.find((i) => i.types.includes('image/png'));
      if (!image) return null;
      const blob = (await image.getType('image/png')) as Blob;
      return requireStore().importAsset(
        Buffer.from(await blob.arrayBuffer()),
        'Clipboard image.png',
      );
    });
    handle('canvas:capture', async (rect: { x: number; y: number; width: number; height: number }) => {
      if (browserMode) throw new Error('Safe capture is available in the desktop app. Hide sensitive items before taking a browser screenshot.');
      if (!rect || !['x', 'y', 'width', 'height'].every((k) => Number.isInteger(rect[k as keyof typeof rect])))
        throw new Error('Invalid capture bounds.');
      const [width, height] = win.getContentSize();
      if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > width || rect.y + rect.height > height)
        throw new Error('Capture bounds are outside the window.');
      const png = (await win.webContents.capturePage(rect)).toPNG();
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
    });
    handle('asset:copy-image' , (id: string) => copyAssetImage(requireStore(), id));
    handle('asset:export', (id: string) => exportAsset(requireStore(), win, id));
    handle('asset:reveal', (id: string) => revealAsset(requireStore(), id));
    handle('style:save', (style: string) => {
      if (typeof style !== 'string' || style.length > 100000) throw new Error('Invalid style');
      requireStore().setting('style', style);
    });
    handle('workflow:import', async () => {
      requireStore();
      const result = await dialog.showOpenDialog(win, {
        filters: [{ name: 'ComfyUI API workflow', extensions: ['json'] }],
      });
      if (result.canceled) return null;
      const file = result.filePaths[0];
      if (fs.statSync(file).size > 5_000_000) throw new Error('Workflow is too large.');
      const workflow = parseWorkflow(JSON.parse(fs.readFileSync(file, 'utf8')));
      const t: Template = {
        id: randomUUID(),
        name: path.basename(file, '.json'),
        workflow,
        mappings: {},
        outputs: Object.keys(workflow).filter((id) => workflow[id].class_type === 'SaveImage'),
        builtin: false,
        offlineVerified: false,
      };
      return requireStore().saveTemplate(t);
    });
    handle('workflow:save', (t: Template) => requireStore().saveTemplate(t));
    handle('workflow:verify-offline', (templateId: string, jobId: string) =>
      requireStore().verifyOffline(templateId, jobId),
    );
    handle('comfy:connect', (port: number) => {
      requireStore();
      return jobs!.connect(port);
    });
    handle('workflow:validate', (t: Template) => {
      if (!jobs?.caps) throw new Error('Connect to ComfyUI first.');
      return validateWorkflow(t, jobs.caps);
    });
    handle('job:generate', (r: GenerateRequest) => {
      requireStore();
      return jobs!.enqueue(r);
    });
    handle('job:cancel', (id: string) => jobs?.cancel(id));
    handle('job:retry', (id: string) => jobs?.retry(id));
    handle('job:reconcile', () => jobs?.tick());
    ipcMain.on('app:finish-close', async (event) => {
      if (event.sender !== win.webContents) return;
      jobs?.close();
      while (jobs?.busy) await new Promise((r) => setTimeout(r, 50));
      store?.close();
      closing = true;
      win.close();
    });
    if (process.env.IMAGINE_TEST === '1') {
      (globalThis as any).imagineTest = {
        openProject,
        snapshot: () => store?.snapshot(),
        getStore: () => store,
        getJobs: () => jobs,
        executeCodexTool,
        getCodex: () => codex,
        contained,
      };
    }
    if (browserMode) {
      const projectArg = process.argv.find((arg) => arg.startsWith('--project='));
      if (projectArg) await openProject(projectArg.slice('--project='.length), false);
      browserServer = await startBrowserServer({
        port: Number(process.env.IMAGINE_BROWSER_PORT || 4317),
        directory: path.join(__dirname, '../dist'),
        invoke: (channel, ...args) => {
          const fn = handlers.get(channel);
          if (!fn) throw new Error('Unknown workspace action.');
          return fn(...args);
        },
        asset: (id, original) => {
          const current = requireStore();
          const asset = current.list<Asset>('assets').find((a) => a.id === id);
          if (!asset) throw new Error('Unknown image.');
          return contained(current.folder, original ? asset.path : asset.thumbnail);
        },
        disconnected: () => {
          for (const pending of codexTools.values()) {
            clearTimeout(pending.timer);
            pending.reject(
              new Error('The browser disconnected. Inspect the workspace before retrying.'),
            );
          }
          codexTools.clear();
          if (codex.busy) void codex.stop().catch(() => {});
        },
      });
      console.log('Local Imagine Workspace: ' + browserServer.url);
    } else {
      await win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  })
  .catch((error) => {
    console.error(error);
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
if (browserMode) {
  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());
}
app.on('will-quit', () => {
  browserServer?.close();
  codex?.close();
  jobs?.close();
  store?.close();
});
