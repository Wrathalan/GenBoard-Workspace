import { expect, it, vi } from 'vitest';
import { parseToolArguments } from '../shared/codex';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { validateReferenceIds } from '../shared/image-references';
it('accepts bounded known workspace actions only', () => {
  expect(
    parseToolArguments({ action: 'add_text', parameters: '{"text":"hello","x":1,"y":2}' }),
  ).toEqual({ action: 'add_text', args: { text: 'hello', x: 1, y: 2 } });
  for (const input of [
    { action: 'shell', parameters: '{}' },
    { action: 'generate', parameters: 'null' },
    { action: 'generate', parameters: '[]' },
    { action: 'snapshot', parameters: 'invalid' },
  ])
    expect(() => parseToolArguments(input)).toThrow();
});

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.test-data/codex-unit' },
  shell: { openExternal: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
}));
import { CodexHarness } from '../electron/codex';
import { shell } from 'electron';
it('sends turns without waiting for optional capabilities and reports scoped progress timings', async () => {
  const events: any[] = [];
  const requests: string[] = [];
  const rpc: any = {
    send: vi.fn(), close: vi.fn(),
    request: async (method: string) => {
      requests.push(method);
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      // A nonresponsive optional endpoint must never block sending a message.
      if (method === 'modelProvider/capabilities/read') return new Promise(() => {});
      if (method === 'thread/start') return { thread: { id: 'latency-thread' } };
      if (method === 'turn/start') return { turn: { id: 'latency-turn' } };
      return {};
    },
  };
  const h = new CodexHarness({ isDestroyed: () => false } as any, vi.fn(), () => rpc, (e) => events.push(e));
  (h as any).executable = () => 'codex.exe';
  const run = h.run('latency-board', 'Hello');
  await vi.waitFor(() => expect(requests).toContain('turn/start'));
  await run;
  expect(requests).not.toContain('modelProvider/capabilities/read');
  const params = { threadId: 'latency-thread', turnId: 'latency-turn', item: { type: 'reasoning' } };
  rpc.onMessage({ method: 'item/started', params: { ...params, threadId: 'unrelated' } });
  expect(events.some((e) => e.text === 'Codex is thinking...')).toBe(false);
  rpc.onMessage({ method: 'item/started', params });
  expect(events.at(-1).text).toBe('Codex is thinking...');
  rpc.onMessage({ method: 'item/started', params: { ...params, item: { type: 'contextCompaction' } } });
  expect(events.at(-1).text).toContain('condensing conversation');
  rpc.onMessage({ method: 'turn/completed', params: { ...params, turn: { status: 'completed' } } });
  await vi.waitFor(() => expect(h.busy).toBe(false));
  const timing = events.filter((e) => e.type === 'timing').at(-1);
  expect(timing.setupMs).toBeGreaterThanOrEqual(0);
  expect(timing.firstActivityMs).toBeGreaterThanOrEqual(timing.setupMs);
  expect(timing.totalMs).toBeGreaterThanOrEqual(timing.firstActivityMs);
  h.close();
});

it('routes sign-in, tools, duplicate call IDs and interruption through app-server', async () => {
  const events: any[] = [];
  const requests: any[] = [];
  const responses: any[] = [];
  let launchArgs: string[] = [];
  const rpc: any = {
    onMessage: () => {},
    onExit: () => {},
    close: vi.fn(),
    send: (m: any) => responses.push(m),
    request: async (method: string, params: any) => {
      requests.push({ method, params });
      if (method === 'account/read')
        return { account: { type: 'chatgpt', email: 'test@example.invalid' } };
      if (method === 'account/login/start')
        return { loginId: 'login-test', authUrl: 'https://auth.openai.com/authorize?test=1' };
      if (method === 'thread/start') return { thread: { id: 'thread-test' } };
      if (method === 'turn/start') return { turn: { id: 'turn-test' } };
      return {};
    },
  };
  const execute = vi.fn(async (..._args: any[]) => ({
    created: 'card-test',
    assetId: 'asset-test',
  }));
  const h = new CodexHarness(
    {
      isDestroyed: () => false,
      webContents: { send: (_: string, e: any) => events.push(e) },
    } as any,
    execute,
    (_executable, args) => {
      launchArgs = args;
      return rpc;
    },
  );
  (h as any).executable = () => 'codex.exe';
  await h.login();
  expect(launchArgs).toContain('features.image_generation=true');
  expect(launchArgs).toContain('features.shell_tool=false');
  expect(launchArgs).toContain('features.unified_exec=false');
  expect(shell.openExternal).toHaveBeenCalledWith('https://auth.openai.com/authorize?test=1');
  await expect(
    h.run('board-test', 'Missing image', { images: ['missing-reference.png'] }),
  ).rejects.toThrow('Reference 1');
  expect(h.busy).toBe(false);
  expect(requests.some((r) => r.method === 'turn/start')).toBe(false);
  const folder = await fs.mkdtemp(path.resolve('.test-data', 'codex-references-'));
  const bytes = await sharp({
    create: { width: 8, height: 9, channels: 4, background: '#ff008080' },
  })
    .png()
    .toBuffer();
  const file = path.join(folder, 'reference.png');
  await fs.writeFile(file, bytes);
  const ids = Array.from({ length: 16 }, (_, i) => `asset-${i}`);
  await h.run('board-test', 'Use all references', {
    images: ids.map(() => file),
    referenceAssetIds: ids,
  });
  const input = requests.find((r) => r.method === 'turn/start').params.input;
  expect(input.filter((i: any) => i.type === 'image')).toHaveLength(16);
  expect(input.some((i: any) => i.type === 'localImage')).toBe(false);
  for (const image of input.filter((i: any) => i.type === 'image')) {
    expect(image.detail).toBe('original');
    expect(Buffer.from(image.url.split(',')[1], 'base64')).toEqual(bytes);
  }
  expect(
    input.filter((i: any) => /^Reference image /.test(i.text || '')).map((i: any) => i.text),
  ).toEqual(ids.map((_, i) => `Reference image ${i + 1}`));
  expect(events).toContainEqual({ type: 'busy', text: '', busy: true });
  expect(requests.find((r) => r.method === 'thread/start').params.dynamicTools[0].name).toBe(
    'imagine_workspace',
  );
  expect(requests.find((r) => r.method === 'thread/start').params.environments).toEqual([]);
  expect(requests.find((r) => r.method === 'thread/start').params.developerInstructions).toContain(
    'do not invent a workspace setting',
  );
  expect(requests.find((r) => r.method === 'thread/start').params.developerInstructions).toContain(
    'using that wrapper to call the native image tool is allowed',
  );
  const skill = await fs.readFile(input.find((i: any) => i.type === 'skill').path, 'utf8');
  expect(skill).toContain('native JavaScript tool orchestration wrapper is allowed');
  expect(skill).toContain('Do not claim a workspace setting exists');
  const retry = {
    method: 'error',
    params: {
      threadId: 'thread-test',
      turnId: 'turn-test',
      willRetry: true,
      error: { message: 'Reconnecting... 1/5' },
    },
  };
  rpc.onMessage(retry);
  expect(events.at(-1)).toEqual({ type: 'status', text: 'Reconnecting... 1/5' });
  expect(h.busy).toBe(true);
  const count = events.length;
  rpc.onMessage({ ...retry, params: { ...retry.params, threadId: 'unrelated-thread' } });
  rpc.onMessage({ ...retry, params: { ...retry.params, turnId: 'old-turn' } });
  expect(events).toHaveLength(count);
  rpc.onMessage({ ...retry, params: { ...retry.params, willRetry: false } });
  expect(events.at(-1)).toEqual({ type: 'error', text: 'Reconnecting... 1/5' });
  const m = {
    id: 100,
    method: 'item/tool/call',
    params: {
      threadId: 'thread-test',
      turnId: 'turn-test',
      callId: 'call-test',
      tool: 'imagine_workspace',
      arguments: { action: 'add_text', parameters: '{"text":"note","x":1,"y":2}' },
    },
  };
  rpc.onMessage(m);
  rpc.onMessage({ ...m, id: 101 });
  await vi.waitFor(() => expect(responses.filter((r) => r.result?.success)).toHaveLength(2));
  expect(execute).toHaveBeenCalledTimes(1);
  expect(
    requests
      .find((r) => r.method === 'turn/start')
      .params.input.some((i: any) => i.type === 'skill' && i.name === 'imagegen'),
  ).toBe(true);
  const imageEvent = {
    method: 'item/completed',
    params: {
      threadId: 'thread-test',
      item: { type: 'imageGeneration', id: 'generated-1', status: 'completed', result: 'aGVsbG8=' },
    },
  };
  rpc.onMessage(imageEvent);
  rpc.onMessage(imageEvent);
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  expect(execute.mock.calls[1][1]).toBe('ingest_codex_image');
  expect(execute.mock.calls[1][2].sourceIds).toEqual(ids);
  rpc.onMessage({
    ...imageEvent,
    params: { ...imageEvent.params, item: { ...imageEvent.params.item, id: 'generated-2' } },
  });
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
  expect(execute.mock.calls[2][2].position.x - execute.mock.calls[1][2].position.x).toBe(360);
  await h.stop();
  expect(requests.at(-1).method).toBe('turn/interrupt');
  rpc.onMessage({ method: 'turn/completed', params: { turn: { status: 'interrupted' } } });
  await vi.waitFor(() => expect(h.busy).toBe(false));
  expect(events).toContainEqual({ type: 'busy', text: '', busy: false });
  await h.run('board-test', 'A text-only follow-up');
  expect(
    requests
      .filter((r) => r.method === 'turn/start')
      .at(-1)
      .params.input.some((i: any) => i.type === 'image'),
  ).toBe(false);
  h.close();
});

import {
  generatedImageBytes,
  prepareCodexImages,
  MAX_REFERENCE_DATA_URL_LENGTH,
} from '../electron/codex-images';
it('validates and preserves reference bytes, format and order without truncation', async () => {
  const ids = Array.from({ length: 16 }, (_, i) => `image-${i}`);
  expect(validateReferenceIds([...ids, ids[0]])).toEqual(ids);
  expect(() => validateReferenceIds([...ids, 'extra'])).toThrow('16');
  expect(() => validateReferenceIds([42])).toThrow('Invalid');
  const folder = await fs.mkdtemp(path.resolve('.test-data', 'codex-formats-'));
  const files = [],
    originals = [];
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const bytes = await sharp({ create: { width: 4, height: 6, channels: 4, background: 'red' } })
      .toFormat(format)
      .toBuffer();
    const file = path.join(folder, `${format}.wrong-extension`);
    await fs.writeFile(file, bytes);
    files.push(file);
    originals.push(bytes);
  }
  const images = await prepareCodexImages(files);
  expect(images.map((i) => i.url.split(';')[0])).toEqual([
    'data:image/png',
    'data:image/jpeg',
    'data:image/webp',
  ]);
  expect(images.map((i) => Buffer.from(i.url.split(',')[1], 'base64'))).toEqual(originals);
  await expect(prepareCodexImages(Array(17).fill(files[0]))).rejects.toThrow('16');
  const corrupt = path.join(folder, 'corrupt.png');
  await fs.writeFile(corrupt, 'not an image');
  await expect(prepareCodexImages([files[0], corrupt])).rejects.toThrow('Reference 2');
  await fs.truncate(corrupt, MAX_REFERENCE_DATA_URL_LENGTH);
  await expect(prepareCodexImages([corrupt])).rejects.toThrow('20 MiB');
});

it('rejects incomplete images, remote URLs and paths outside the private profile', () => {
  expect(() =>
    generatedImageBytes({ status: 'running', result: 'aGVsbG8=' }, process.cwd()),
  ).toThrow();
  expect(() =>
    generatedImageBytes(
      { status: 'completed', result: 'https://example.com/image.png' },
      process.cwd(),
    ),
  ).toThrow();
  expect(() =>
    generatedImageBytes(
      { status: 'completed', savedPath: process.cwd() + '/../outside.png' },
      process.cwd(),
    ),
  ).toThrow();
  expect(
    generatedImageBytes({ status: 'completed', result: 'aGVsbG8=' }, process.cwd()).toString(),
  ).toBe('hello');
});
