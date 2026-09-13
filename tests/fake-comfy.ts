import http from 'node:http';
import { WebSocketServer } from 'ws';
import sharp from 'sharp';
import { builtinTemplates } from '../shared/workflow';
export async function fakeComfy() {
  const png = await sharp({
    create: { width: 128, height: 192, channels: 3, background: '#aabb88' },
  })
    .png()
    .toBuffer();
  const nodes: Record<string, any> = {};
  for (const t of builtinTemplates())
    for (const n of Object.values(t.workflow))
      nodes[n.class_type] = {
        input: {
          required: Object.fromEntries(
            Object.entries(n.inputs).map(([k, v]) => [
              k,
              k === 'ckpt_name'
                ? [['sdxl-test.safetensors']]
                : [typeof v === 'number' ? 'INT' : 'STRING'],
            ]),
          ),
        },
        output_node: n.class_type === 'SaveImage',
        python_module: 'nodes',
      };
  let mode: 'success' | 'hold' | 'reject' | 'drop' | 'partial' = 'success';
  let submissions = 0;
  let interrupted = 0;
  let uploads = 0;
  let outputRequests = 0;
  const pending: any[][] = [];
  const waiting: any[][] = [];
  const history: Record<string, any> = {};
  let socket: WebSocketServer;
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url!, 'http://localhost');
    const json = (v: any, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(v));
    };
    if (url.pathname === '/object_info') return json(nodes);
    if (url.pathname === '/system_stats')
      return json({ devices: [{ name: 'SIMULATED ComfyUI · test fixture' }] });
    if (url.pathname === '/queue' && req.method === 'GET')
      return json({ queue_running: pending, queue_pending: waiting });
    if (url.pathname === '/upload/image') {
      uploads++;
      return json({ name: 'reference.png', subfolder: '' });
    }
    if (url.pathname === '/prompt') {
      submissions++;
      const data = JSON.parse(body.toString());
      if (mode === 'reject')
        return json({ error: 'Invalid workflow', node_errors: { '5': 'bad sampler' } }, 400);
      const id = String(submissions);
      const entry = [submissions, id, data.prompt, data.extra_data];
      pending.push(entry);
      if (mode === 'drop') {
        req.socket.destroy();
        return;
      }
      json({ prompt_id: id });
      if (mode !== 'hold')
        setTimeout(() => {
          pending.splice(pending.indexOf(entry), 1);
          history[id] = {
            prompt: entry,
            outputs: {
              '7': {
                images: [
                  { filename: 'test.png' },
                  ...(mode === 'partial' ? [{ filename: 'second.png' }] : []),
                ],
              },
            },
            status: {
              completed: true,
              status_str: 'success',
              messages: [['execution_cached', { nodes: ['1'] }]],
            },
          };
          socket.clients.forEach((s) =>
            s.send(JSON.stringify({ type: 'execution_success', data: { prompt_id: id } })),
          );
        }, 100);
      return;
    }
    if (url.pathname.startsWith('/history/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop()!);
      return json(history[id] ? { [id]: history[id] } : {});
    }
    if (url.pathname === '/history') return json(history);
    if (url.pathname === '/view') {
      outputRequests++;
      if (
        mode === 'partial' &&
        url.searchParams.get('filename') === 'second.png' &&
        outputRequests < 4
      )
        return json({ error: 'temporary output failure' }, 503);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(png);
    }
    if (url.pathname === '/interrupt') {
      interrupted++;
      pending.splice(0);
      return json({});
    }
    if (url.pathname === '/queue' && req.method === 'POST') {
      const d = JSON.parse(body.toString());
      for (const id of d.delete || [])
        for (const list of [pending, waiting]) {
          const at = list.findIndex((e) => e[1] === id);
          if (at >= 0) list.splice(at, 1);
        }
      return json({});
    }
    return json({ error: 'Unknown route' }, 404);
  });
  socket = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as any).port as number,
    png,
    nodes,
    pending,
    waiting,
    history,
    get submissions() {
      return submissions;
    },
    get interrupted() {
      return interrupted;
    },
    get uploads() {
      return uploads;
    },
    setMode: (value: typeof mode) => {
      mode = value;
    },
    close: async () => {
      socket.clients.forEach((s) => s.terminate());
      socket.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
