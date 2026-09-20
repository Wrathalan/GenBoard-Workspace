import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeMessage, encodeMessage } from '../shared/browser-wire';

type Options = {
  port: number;
  directory: string;
  invoke: (channel: string, ...args: any[]) => unknown;
  asset: (id: string, original: boolean) => string;
  disconnected: () => void;
};
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export async function startBrowserServer(options: Options) {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535)
    throw new Error('Choose a browser port between 1 and 65535.');
  const token = randomBytes(32).toString('hex');
  let origin = '';
  let client: WebSocket | undefined;
  let cookie = '';
  const root = fs.realpathSync(options.directory);
  const allowedRequest = (req: http.IncomingMessage) =>
    req.headers.host === new URL(origin).host &&
    (!req.headers.origin || req.headers.origin === origin) &&
    (!req.headers['sec-fetch-site'] ||
      ['same-origin', 'none'].includes(String(req.headers['sec-fetch-site'])));
  const authenticated = (req: http.IncomingMessage) =>
    (req.headers.cookie || '').split(';').some((v) => v.trim() === cookie);
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    const fail = (status: number, message: string) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(message);
    };
    if (!allowedRequest(req))
      return fail(403, 'This workspace is available on this computer only.');
    if (!['GET', 'HEAD'].includes(req.method || '')) return fail(405, 'Method not allowed');
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', origin).pathname);
      if (pathname === '/') {
        // The browser gets an ephemeral session; no credentials are placed in URLs or localStorage.
        res.setHeader('Set-Cookie', cookie + '; HttpOnly; SameSite=Strict; Path=/');
        res.setHeader('Content-Type', mime['.html']);
        const html = fs
          .readFileSync(path.join(root, 'index.html'), 'utf8')
          .replace('<head>', '<head><meta name="imagine-browser-token" content="' + token + '">')
          .replace("connect-src 'none'", "connect-src 'self'");
        res.end(req.method === 'HEAD' ? undefined : html);
        return;
      }
      if (!authenticated(req)) return fail(403, 'Open the workspace home page first.');
      let file: string;
      const asset = /^\/media\/([a-zA-Z0-9-]+)\/(original|thumbnail)$/.exec(pathname);
      if (asset) {
        file = options.asset(asset[1], asset[2] === 'original');
      } else {
        file = fs.realpathSync(path.resolve(root, '.' + pathname));
        if (!file.startsWith(root + path.sep) || !mime[path.extname(file).toLowerCase()])
          return fail(404, 'Not found');
      }
      const stat = fs.statSync(file);
      if (!stat.isFile()) return fail(404, 'Not found');
      res.setHeader(
        'Content-Type',
        mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      );
      res.setHeader('Content-Length', stat.size);
      if (req.method === 'HEAD') return void res.end();
      fs.createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch {
      fail(404, 'Not found');
    }
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 75_000_000 });
  server.on('upgrade', (req, socket, head) => {
    if (
      !allowedRequest(req) ||
      req.headers.origin !== origin ||
      !authenticated(req) ||
      req.url !== '/bridge' ||
      req.headers['sec-websocket-protocol'] !== 'imagine-' + token
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws));
  });
  sockets.on('connection', (ws) => {
    // One renderer owns the canvas. A second tab cannot overwrite its unsaved board or run tools twice.
    if (client && client.readyState !== WebSocket.CLOSED) {
      ws.close(4001, 'The workspace is already open in another tab.');
      return;
    }
    client = ws;
    ws.send(encodeMessage({ event: 'browser:ready' }));
    ws.on('error', () => {});
    ws.on('message', async (raw) => {
      let request: any;
      try {
        request = decodeMessage(raw.toString());
        if (
          !Number.isSafeInteger(request?.id) ||
          request.id < 1 ||
          typeof request.channel !== 'string' ||
          !Array.isArray(request.args)
        )
          throw new Error('Invalid workspace request.');
        const result = await options.invoke(request.channel, ...request.args);
        if (ws.readyState === WebSocket.OPEN) ws.send(encodeMessage({ id: request.id, result }));
      } catch (error) {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            encodeMessage({
              id: request?.id,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
      }
    });
    ws.once('close', () => {
      if (client === ws) {
        client = undefined;
        options.disconnected();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Browser server did not start.');
  origin = 'http://127.0.0.1:' + address.port;
  cookie = 'imagine_browser_' + address.port + '=' + token;
  return {
    url: origin + '/',
    emit(event: string, ...args: any[]) {
      if (client?.readyState === WebSocket.OPEN) client.send(encodeMessage({ event, args }));
    },
    close() {
      for (const ws of sockets.clients) ws.terminate();
      sockets.close();
      server.close();
      server.closeAllConnections();
    },
  };
}
