import { expect, it, vi } from 'vitest';
import { parseToolArguments } from '../shared/codex';
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
it('routes sign-in, tools, duplicate call IDs and interruption through app-server', async () => {
  const events: any[] = [];
  const requests: any[] = [];
  const responses: any[] = [];
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
    () => rpc,
  );
  (h as any).executable = () => 'codex.exe';
  await h.login();
  expect(shell.openExternal).toHaveBeenCalledWith('https://auth.openai.com/authorize?test=1');
  await h.run('board-test', 'Add a note');
  expect(requests.find((r) => r.method === 'thread/start').params.dynamicTools[0].name).toBe(
    'imagine_workspace',
  );
  expect(requests.find((r) => r.method === 'thread/start').params.environments).toEqual([]);
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
  h.close();
});

import { generatedImageBytes } from '../electron/codex-images';
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
