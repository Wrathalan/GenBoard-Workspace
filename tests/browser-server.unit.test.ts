import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startBrowserServer } from '../electron/browser-server';
import { decodeMessage, encodeMessage } from '../shared/browser-wire';

let host: Awaited<ReturnType<typeof startBrowserServer>>;
let directory: string;
let cookie: string;
let token: string;
let clients: WebSocket[];
const invoke = vi.fn();
const disconnected = vi.fn();
async function request(route: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>(
    (resolve, reject) => {
      const req = http.request(host.url + route, { method, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (data) => chunks.push(data));
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          }),
        );
      });
      req.on('error', reject);
      req.end();
    },
  );
}
function connect(headers: Record<string, string> = {}) {
  const ws = new WebSocket(host.url.replace('http:', 'ws:') + 'bridge', 'imagine-' + token, {
    headers: { Origin: new URL(host.url).origin, Cookie: cookie, ...headers },
  });
  ws.on('error', () => {});
  clients.push(ws);
  return ws;
}
beforeEach(async () => {
  fs.mkdirSync('.test-data', { recursive: true });
  directory = fs.mkdtempSync(path.resolve('.test-data/browser-server-'));
  fs.writeFileSync(
    path.join(directory, 'index.html'),
    '<html><head><meta content="connect-src \'none\'"></head><body>Local Imagine</body></html>',
  );
  fs.writeFileSync(path.join(directory, 'app.js'), '/* fixture */');
  fs.writeFileSync(path.join(directory, 'secret.txt'), 'unserved');
  fs.writeFileSync(path.join(directory, 'pixel.png'), 'test-image');
  clients = [];
  invoke.mockReset();
  disconnected.mockReset();
  host = await startBrowserServer({
    port: 0,
    directory,
    invoke,
    disconnected,
    asset: (id) => {
      if (id !== 'asset-one') throw new Error('Unknown image');
      return path.join(directory, 'pixel.png');
    },
  });
  const page = await request('');
  cookie = page.headers['set-cookie']![0].split(';')[0];
  token = /imagine-browser-token" content="([a-f0-9]+)"/.exec(page.body)![1];
});
afterEach(() => {
  for (const client of clients) client.terminate();
  host.close();
  // This fixture directory is created by this test under .test-data.
  fs.rmSync(directory, { recursive: true, force: true });
});

it('serves the browser shell without changing the desktop CSP, and requires a session for assets', async () => {
  const page = await request('');
  expect(page.status).toBe(200);
  expect(page.body).toContain("connect-src 'self'");
  expect(fs.readFileSync(path.join(directory, 'index.html'), 'utf8')).toContain(
    "connect-src 'none'",
  );
  expect(page.headers['set-cookie']![0]).toContain('HttpOnly; SameSite=Strict');
  expect((await request('app.js')).status).toBe(403);
  expect((await request('app.js', { Cookie: cookie })).status).toBe(200);
  expect((await request('secret.txt', { Cookie: cookie })).status).toBe(404);
  expect((await request('media/asset-one/original', { Cookie: cookie })).body).toBe('test-image');
  expect((await request('media/missing/original', { Cookie: cookie })).status).toBe(404);
  expect((await request('media/asset-one/thumbnail', { Cookie: cookie }, 'HEAD')).body).toBe('');
});

it('rejects cross-site requests, rebinding, non-GET requests and path traversal', async () => {
  expect((await request('', { Host: 'attacker.invalid' })).status).toBe(403);
  expect((await request('', { Origin: 'https://attacker.invalid' })).status).toBe(403);
  expect((await request('', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  expect((await request('', {}, 'POST')).status).toBe(405);
  expect((await request('%2e%2e%5csecret.txt', { Cookie: cookie })).status).toBe(404);
});

it('rejects WebSocket clients from another origin or without the browser session', async () => {
  for (const headers of [{ Origin: 'https://attacker.invalid' }, { Cookie: '' }] as Record<string, string>[]) {
    const ws = connect(headers);
    const [error] = await once(ws, 'error');
    expect(error.message).toContain('403');
  }
  expect(invoke).not.toHaveBeenCalled();
});

it('carries binary imports, RPC errors and live project events', async () => {
  const ws = connect();
  expect(decodeMessage(String((await once(ws, 'message'))[0])).event).toBe('browser:ready');
  invoke.mockImplementation((channel, ...args) => {
    if (channel !== 'asset:import') throw new Error('Unknown workspace action.');
    expect(args[0][0].bytes).toEqual(new Uint8Array([0, 255, 20]));
    return [{ id: 'asset-one' }];
  });
  ws.send(
    encodeMessage({
      id: 1,
      channel: 'asset:import',
      args: [[{ name: 'test.png', bytes: new Uint8Array([0, 255, 20]) }]],
    }),
  );
  expect(decodeMessage(String((await once(ws, 'message'))[0]))).toEqual({
    id: 1,
    result: [{ id: 'asset-one' }],
  });
  ws.send(encodeMessage({ id: 2, channel: 'unknown', args: [] }));
  expect(decodeMessage(String((await once(ws, 'message'))[0])).error).toBe(
    'Unknown workspace action.',
  );
  const update = once(ws, 'message');
  host.emit('project:update', { activeBoardId: 'board-one' });
  expect(decodeMessage(String((await update)[0]))).toEqual({
    event: 'project:update',
    args: [{ activeBoardId: 'board-one' }],
  });
});

it('prevents two editing tabs and releases ownership when the first tab closes', async () => {
  const first = connect();
  await once(first, 'message');
  const second = connect();
  expect((await once(second, 'close'))[0]).toBe(4001);
  first.close();
  await once(first, 'close');
  await vi.waitFor(() => expect(disconnected).toHaveBeenCalledTimes(1));
  const replacement = connect();
  expect(decodeMessage(String((await once(replacement, 'message'))[0])).event).toBe(
    'browser:ready',
  );
});

it('rejects malformed messages without invoking the application', async () => {
  const ws = connect();
  await once(ws, 'message');
  ws.send(JSON.stringify({ id: 1, channel: 'board:save', args: 'invalid' }));
  expect(decodeMessage(String((await once(ws, 'message'))[0])).error).toBe(
    'Invalid workspace request.',
  );
  expect(invoke).not.toHaveBeenCalled();
});
