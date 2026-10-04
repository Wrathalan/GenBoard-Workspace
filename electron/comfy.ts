import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Capabilities, Workflow } from '../shared/types';

export function loopbackEndpoint(port: number): string {
  return comfyEndpoint(port);
}
export function comfyEndpoint(port: number, host = '127.0.0.1'): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Enter a port from 1 to 65535.');
  if (typeof host !== 'string') throw new Error('Enter a ComfyUI hostname or IP address.');
  let hostname = host.trim().toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
    if (isIP(hostname) !== 6) throw new Error('Brackets are only valid around an IPv6 address.');
  }
  const ip = isIP(hostname);
  const validName =
    hostname.length <= 253 &&
    hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  if (!ip && (!validName || /^[\d.]+$/.test(hostname)))
    throw new Error('Enter a hostname or IP address only, without a URL, path, or port.');
  if (hostname === '0.0.0.0' || (ip === 6 && new URL(`http://[${hostname}]`).hostname === '[::]'))
    throw new Error('Enter the server’s actual IP address, not its listen address.');
  const address = ip === 6 ? new URL(`http://[${hostname}]`).hostname : hostname;
  return `http://${address}:${port}`;
}
export class ComfyClient {
  endpoint: string;
  clientId = randomUUID();
  socket?: WebSocket;
  constructor(
    port: number,
    private event: (event: { type: string; data: any }) => void = () => {},
    host = '127.0.0.1',
  ) {
    this.endpoint = comfyEndpoint(port, host);
  }
  async request(route: string, init: RequestInit = {}) {
    const response = await fetch(this.endpoint + route, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2000);
      throw new Error(`ComfyUI ${response.status}: ${detail}`);
    }
    return response;
  }
  async json(route: string, data?: unknown): Promise<any> {
    return (
      await this.request(
        route,
        data === undefined
          ? {}
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            },
      )
    ).json();
  }
  async connect(): Promise<Capabilities> {
    const [nodes, stats] = await Promise.all([
      this.json('/object_info'),
      this.json('/system_stats'),
    ]);
    this.socket?.close();
    this.socket = new WebSocket(
      this.endpoint.replace('http:', 'ws:') + '/ws?clientId=' + this.clientId,
    );
    this.socket.on('message', (data, binary) => {
      if (!binary) {
        try {
          this.event(JSON.parse(data.toString()));
        } catch {}
      }
    });
    this.socket.on('error', () => {});
    return {
      endpoint: this.endpoint,
      nodes,
      checkpoints: nodes.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [],
      device: stats.devices?.map((d: any) => d.name).join(', ') || 'Local ComfyUI',
    };
  }
  async upload(bytes: Buffer, name: string): Promise<string> {
    const data = new FormData();
    data.append('image', new Blob([new Uint8Array(bytes)]), name);
    data.append('overwrite', 'false');
    const out = (await (
      await this.request('/upload/image', { method: 'POST', body: data })
    ).json()) as { name: string; subfolder?: string };
    return out.subfolder ? `${out.subfolder}/${out.name}` : out.name;
  }
  submit(workflow: Workflow, jobId: string) {
    return this.json('/prompt', {
      prompt: workflow,
      client_id: this.clientId,
      extra_data: { local_imagine_job_id: jobId },
    });
  }
  queue() {
    return this.json('/queue');
  }
  history(id?: string) {
    return this.json(id ? '/history/' + encodeURIComponent(id) : '/history?max_items=1000');
  }
  async output(file: { filename: string; subfolder?: string; type?: string }) {
    const q = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder || '',
      type: file.type || 'output',
    });
    return Buffer.from(await (await this.request('/view?' + q)).arrayBuffer());
  }
  async cancel(id: string): Promise<'cancelled' | 'finished'> {
    const q = await this.queue();
    if ((q.queue_pending || []).some((entry: any[]) => entry[1] === id)) {
      await this.json('/queue', { delete: [id] });
      return 'cancelled';
    }
    if ((q.queue_running || []).some((entry: any[]) => entry[1] === id)) {
      await this.json('/interrupt', {});
      return 'cancelled';
    }
    return 'finished';
  }
  close() {
    this.socket?.close();
  }
}
