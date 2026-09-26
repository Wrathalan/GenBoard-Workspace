// Exercises the actual hidden Electron backend over its browser transport; no browser automation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import sharp from 'sharp';

const root = process.cwd();
fs.mkdirSync(path.join(root, '.test-data'), { recursive: true });
const fixture = fs.mkdtempSync(path.join(root, '.test-data', 'browser-integration-'));
const projectFolder = path.join(fixture, 'project');
let processHandle;
let ws;
async function stop() {
  if (ws) {
    ws.close();
    await once(ws, 'close');
    ws = undefined;
  }
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill();
    await once(processHandle, 'exit');
  }
}
async function launch(project) {
  const env = { ...process.env, IMAGINE_TEST: '1', IMAGINE_BROWSER_PORT: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = ['.', '--browser', ...(project ? ['--project=' + project] : [])];
  processHandle = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(
      () => reject(new Error('Server startup timed out: ' + output)),
      20000,
    );
    processHandle.stderr.on('data', (data) => {
      output += data;
    });
    processHandle.stdout.on('data', (data) => {
      output += data;
      const match = /Weave: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    processHandle.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error('Server exited ' + code + ': ' + output));
    });
  });
  const page = await fetch(url);
  const html = await page.text();
  const token = /imagine-browser-token" content="([a-f0-9]+)"/.exec(html)[1];
  const cookie = page.headers.get('set-cookie').split(';')[0];
  ws = new WebSocket(url.replace('http:', 'ws:') + 'bridge', 'imagine-' + token, {
    headers: { Origin: new URL(url).origin, Cookie: cookie },
  });
  ws.on('error', () => {});
  const ready = JSON.parse(String((await once(ws, 'message'))[0]));
  assert.equal(ready.event, 'browser:ready');
  let id = 0;
  const pending = new Map();
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    message.error ? call.reject(new Error(message.error)) : call.resolve(message.result);
  });
  const call = (channel, ...args) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ id: requestId, channel, args }));
    });
  return { call, url, cookie };
}
try {
  let { call, url, cookie } = await launch();
  assert.equal(await call('project:current'), null);
  await assert.rejects(call('project:open-path', 'relative/folder', true), /full path/);
  const project = await call('project:open-path', projectFolder, true);
  const board = project.boards[0];
  board.items.push({
    id: 'browser-note',
    type: 'text',
    position: { x: 30, y: 40 },
    width: 320,
    height: 180,
    data: { text: 'Saved through the browser bridge' },
  });
  await call('board:save', board, []);
  const png = await sharp({ create: { width: 20, height: 30, channels: 4, background: '#c78c58' } })
    .png()
    .toBuffer();
  const assets = await call('asset:import', [
    { name: 'browser-fixture.png', bytes: { $imagineBytes: png.toString('base64') } },
  ]);
  assert.equal(assets[0].width, 20);
  const library = {
    folders: [{ id: 'cast', name: 'Cast' }, { id: 'heroes', name: 'Heroes', parentId: 'cast' }],
    assetFolders: { [assets[0].id]: 'heroes' },
    characters: [{ id: 'hero', name: 'Hero', description: 'Blue coat', assetIds: [assets[0].id] }],
  };
  await call('library:save', library);
  await assert.rejects(call('library:save', { ...library, folders: [{ id: 'cast', name: 'Cast', parentId: 'cast' }] }), /hierarchy/);
  const original = await fetch(url + 'media/' + assets[0].id + '/original', {
    headers: { Cookie: cookie },
  });
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), png);
  board.items.push({
    id: 'browser-image',
    type: 'image',
    position: { x: 400, y: 40 },
    width: 240,
    height: 360,
    data: { assetId: assets[0].id },
  });
  await call('board:save', board, []);
  const recents = await call('project:recent');
  assert.equal(await call('codex:busy'), false);
  await assert.rejects(call('board:create-and-activate', '   '), /board name/);
  await assert.rejects(call('board:create-and-activate', 'x'.repeat(101)), /100 characters/);
  assert.equal((await call('project:current')).boards.length, 1);
  const navigated = await call('board:create-and-activate', '  Browser board  ');
  assert.equal(navigated.boards.length, 2);
  assert.equal(navigated.boards.find(b => b.id === navigated.activeBoardId).name, 'Browser board');
  await call('board:activate', board.id);
  assert.ok(recents.some((item) => item.folder.toLowerCase() === projectFolder.toLowerCase()));
  await assert.rejects(call('unknown:action'), /Unknown workspace action/);
  await stop();
  ({ call } = await launch(projectFolder));
  const reopened = await call('project:current');
  assert.equal(reopened.activeBoardId, board.id);
  assert.equal(reopened.boards.length, 2);
  assert.equal(reopened.boards[0].items.length, 2);
  assert.equal(reopened.boards[0].items[0].data.text, 'Saved through the browser bridge');
  assert.equal(reopened.assets.length, 1);
  assert.deepEqual(reopened.library, library);
  console.log(
    'Browser integration passed: board navigation and validation, project create/save/reopen, folders and characters, binary import, image serving, recents, and RPC errors.',
  );
  console.log('UI test fixture: ' + projectFolder);
} finally {
  await stop();
}
