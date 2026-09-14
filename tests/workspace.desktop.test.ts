import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fakeComfy } from './fake-comfy';
let app: ElectronApplication;
let page: Page;
let folder: string;
async function launch(projectFolder: string, create = true) {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    IMAGINE_TEST: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await page.waitForFunction(() => !!window.imagine);
  await app.evaluate(
    async (_electron, data) =>
      (globalThis as any).imagineTest.openProject(data.folder, data.create),
    { folder: projectFolder, create },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Text card', exact: true })).toBeVisible();
  if (await page.getByRole('complementary', { name: 'Codex agent panel' }).isVisible())
    await page.getByRole('button', { name: 'Close Codex', exact: true }).click();
}
test.beforeEach(async ({}, info) => {
  folder = path.resolve('.test-data', `project-${info.workerIndex}-${Date.now()}`);
  await fs.mkdir(folder, { recursive: true });
  await launch(folder);
});
test.afterEach(async () => {
  await app?.close();
});
test('canvas edits, image import, clipboard, groups, resize, compare, persistence and project relocation', async () => {
  const server = await fakeComfy();
  try {
    await page.getByRole('button', { name: 'Text card', exact: true }).click();
    await page.locator('.text-node').dblclick();
    await page
      .getByRole('textbox', { name: 'Edit text card' })
      .fill('A local board\nReferences stay here.');
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(page.locator('.text-content')).toContainText('References stay here');
    await page.keyboard.press('Control+d');
    await expect(page.locator('.text-node')).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.text-node')).toHaveCount(1);
    await page.keyboard.press('Control+y');
    await expect(page.locator('.text-node')).toHaveCount(2);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+g');
    await expect(page.locator('.group-node')).toHaveCount(1);
    await page.keyboard.press('Control+Shift+g');
    await expect(page.locator('.group-node')).toHaveCount(0);
    // Exercise native asset import and clipboard, then place library assets through the UI.
    await page.evaluate(
      async (bytes) => {
        await window.imagine.importImages([{ name: 'fixture.png', bytes: new Uint8Array(bytes) }]);
      },
      [...server.png],
    );
    await app.evaluate(
      async ({ clipboard, ClipboardItem }, bytes) =>
        clipboard.write([
          new ClipboardItem({
            'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
          }),
        ]),
      [...server.png],
    );
    await page.keyboard.press('Control+v');
    await expect(page.locator('.image-node')).toHaveCount(1);
    await page.keyboard.press('Control+d');
    await expect(page.locator('.image-node')).toHaveCount(2);
    await page.keyboard.press('Control+a');
    await page.getByTitle('Inspector', { exact: true }).click();
    await page.getByRole('button', { name: 'Compare selected images' }).click();
    await expect(page.locator('.viewer-images img')).toHaveCount(2);
    await page.getByTitle('Close viewer').click();
    await page.getByTitle('Close inspector').click();
    await page.keyboard.press('Escape');
    await page.locator('.image-node').last().click();
    const handle = page
      .locator('.react-flow__node-image')
      .last()
      .locator('.react-flow__resize-control.handle.bottom.right');
    const box = await handle.boundingBox();
    if (!box) throw new Error('Resize handle missing');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 120, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Control+s');
    const before = await page.evaluate(() => window.imagine.currentProject());
    expect(before!.boards[0].items.filter((i) => i.type === 'image')).toHaveLength(2);
    const resized = before!.boards[0].items.filter((i) => i.type === 'image').at(-1)!;
    expect(resized.height / resized.width).toBeCloseTo(1.5, 1);
    await page.screenshot({ path: 'test-results/canvas.png' });
    await app.close();
    const moved = folder + '-moved';
    await fs.rename(folder, moved);
    await launch(moved, false);
    const after = await page.evaluate(() => window.imagine.currentProject());
    expect(after!.boards).toEqual(before!.boards);
    expect(after!.assets).toEqual(before!.assets);
    await expect(page.locator('.image-node img').first()).toBeVisible();
    expect(
      await page
        .locator('.image-node img')
        .first()
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    ).toBeGreaterThan(0);
    await expect(
      app.evaluate(async () => {
        const s = (globalThis as any).imagineTest.getStore();
        new s.constructor(s.folder, false, '');
      }),
    ).rejects.toThrow('already open');
  } finally {
    await server.close();
  }
});
test('ComfyUI batch, reference upload, failure, cancellation and reconnect without duplicates', async () => {
  const server = await fakeComfy();
  try {
    await page.getByRole('button', { name: 'Generate with ComfyUI' }).click();
    await page.getByLabel('ComfyUI port').fill(String(server.port));
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByText('ComfyUI connected', { exact: true })).toBeVisible();
    await page.getByLabel('Checkpoint', { exact: true }).selectOption('sdxl-test.safetensors');
    await page.getByLabel('This checkpoint is SDXL-compatible').check();
    await page.getByLabel('Generation prompt').fill('A simple test image');
    await page.getByLabel('Graphic anime style preset').uncheck();
    await page.getByLabel('Output count').fill('2');
    await page.getByLabel('Seed', { exact: true }).fill('123');
    await page.getByRole('button', { name: 'Generate 2 images', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.imagine.currentProject()))!.jobs.filter(
            (j) => j.state === 'completed',
          ).length,
      )
      .toBe(2);
    expect(server.submissions).toBe(2);
    const p = await page.evaluate(() => window.imagine.currentProject());
    expect(p!.jobs.map((j) => j.seed)).toEqual([123, 124]);
    expect(p!.jobs.every((j) => j.workflow['2'].inputs.text === 'A simple test image')).toBe(true);
    // Replay history repeatedly: no duplicate canvas output or submission.
    await page.evaluate(async () => {
      await window.imagine.reconcile();
      await window.imagine.reconcile();
    });
    expect(server.submissions).toBe(2);
    const request = {
      templateId: 'sdxl-image',
      boardId: p!.activeBoardId,
      prompt: 'Reference test',
      negative: '',
      checkpoint: 'sdxl-test.safetensors',
      seed: 9,
      count: 1,
      width: 1024,
      height: 1024,
      referenceAssetId: p!.assets[0].id,
      sourceIds: [p!.assets[0].id],
      position: { x: 0, y: 450 },
    };
    await page.evaluate((r) => window.imagine.generate(r), request);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.imagine.currentProject()))!.jobs.filter(
            (j) => j.state === 'completed',
          ).length,
      )
      .toBe(3);
    expect(server.uploads).toBe(1);
    server.setMode('reject');
    await page.evaluate((r) => window.imagine.generate({ ...r, templateId: 'sdxl-text' }), request);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.imagine.currentProject()))!.jobs.at(-1)!.state,
      )
      .toBe('failed');
    server.setMode('hold');
    const cancel = await page.evaluate(
      (r) => window.imagine.generate({ ...r, templateId: 'sdxl-text' }),
      request,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.imagine.currentProject()))!.jobs.at(-1)!.state,
      )
      .toBe('running');
    await page.evaluate((id) => window.imagine.cancelJob(id), cancel[0].id);
    expect(server.interrupted).toBe(1);
    // Lost POST response: match the durable client job ID in the server queue, never POST twice.
    server.setMode('drop');
    await page.evaluate((r) => window.imagine.generate({ ...r, templateId: 'sdxl-text' }), request);
    await expect.poll(async () => server.submissions).toBe(6);
    await page.evaluate(() => window.imagine.reconcile());
    const reconciled = (await page.evaluate(() => window.imagine.currentProject()))!.jobs.at(-1)!;
    expect(reconciled.promptId).toBe('6');
    expect(server.submissions).toBe(6);
    await page.screenshot({ path: 'test-results/generation.png' });
  } finally {
    await server.close();
  }
});
test('500-card board benchmark and blocked renderer networking', async () => {
  const server = await fakeComfy();
  try {
    const fixtures = [];
    for (let i = 0; i < 500; i++)
      fixtures.push([
        ...(await sharp({
          create: {
            width: 512,
            height: 768,
            channels: 3,
            background: { r: i % 256, g: Math.floor(i / 256) * 100 + 80, b: (i * 31) % 256 },
          },
        })
          .png()
          .toBuffer()),
      ]);
    await page.evaluate(async (files) => {
      const assets = await window.imagine.importImages(
        files.map((bytes, i) => ({ name: `benchmark-${i}.png`, bytes: new Uint8Array(bytes) })),
      );
      const p = (await window.imagine.currentProject())!;
      const b = p.boards[0];
      b.items = assets.map((a, i) => ({
        id: `benchmark-${i}`,
        type: 'image' as const,
        position: { x: (i % 25) * 170, y: Math.floor(i / 25) * 240 },
        width: 150,
        height: 225,
        data: { assetId: a.id },
      }));
      b.viewport = { x: 30, y: 50, zoom: 0.22 };
      await window.imagine.saveBoard(b);
    }, fixtures);
    await page.reload();
    await expect(page.locator('.image-node').first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      (window as any).frameTimes = [];
      (window as any).measuring = true;
      let last = performance.now();
      const frame = (now: number) => {
        (window as any).frameTimes.push(now - last);
        last = now;
        if ((window as any).measuring) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await page.keyboard.down('Space');
    await page.mouse.move(650, 350);
    await page.mouse.down();
    await page.mouse.move(950, 500, { steps: 50 });
    await page.mouse.move(550, 300, { steps: 50 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const frames = await page.evaluate(() => {
      (window as any).measuring = false;
      const times = ((window as any).frameTimes as number[]).sort((a, b) => a - b);
      return {
        samples: times.length,
        medianMs: times[Math.floor(times.length * 0.5)],
        p95Ms: times[Math.floor(times.length * 0.95)],
      };
    });
    await fs.writeFile(
      'test-results/benchmark.json',
      JSON.stringify(
        {
          cards: 500,
          uniqueAssets: 500,
          fixtureResolution: '512x768',
          ...frames,
          note: 'requestAnimationFrame timing during 100-step native pointer pan; 500 distinct synthetic color images, viewport culling enabled. Does not measure photographic decode complexity or GPU inference concurrency.',
        },
        null,
        2,
      ),
    );
    expect(frames.medianMs).toBeLessThan(25);
    expect(
      await page.evaluate(() =>
        fetch('https://example.com')
          .then(() => false)
          .catch(() => true),
      ),
    ).toBe(true);
    await page.screenshot({ path: 'test-results/benchmark.png' });
  } finally {
    await server.close();
  }
});
test('partial ingestion retries, stale saves preserve new outputs, immutable mapping and path containment', async () => {
  const server = await fakeComfy();
  try {
    server.setMode('partial');
    await page.evaluate((port) => window.imagine.connect(port), server.port);
    const p = (await page.evaluate(() => window.imagine.currentProject()))!;
    const stale = structuredClone(p.boards[0]);
    await page.evaluate((r) => window.imagine.generate(r), {
      templateId: 'sdxl-text',
      boardId: p.activeBoardId,
      prompt: 'Partial recovery',
      negative: '',
      checkpoint: 'sdxl-test.safetensors',
      seed: 100,
      width: 1024,
      height: 1024,
      count: 1,
      sourceIds: [],
      position: { x: 0, y: 0 },
    });
    await expect
      .poll(
        async () => (await page.evaluate(() => window.imagine.currentProject()))!.jobs[0].state,
        { timeout: 20000 },
      )
      .toBe('completed');
    expect(server.submissions).toBe(1);
    stale.items.push({
      id: 'concurrent-note',
      type: 'text',
      position: { x: 400, y: 200 },
      width: 240,
      height: 120,
      data: { text: 'Saved from an older snapshot' },
    });
    await page.evaluate((b) => window.imagine.saveBoard(b, []), stale);
    const after = (await page.evaluate(() => window.imagine.currentProject()))!;
    expect(after.boards[0].items.filter((i) => i.type === 'image')).toHaveLength(2);
    expect(after.boards[0].items.some((i) => i.id === 'concurrent-note')).toBe(true);
    await expect(
      app.evaluate(() => {
        const t = (globalThis as any).imagineTest;
        t.contained(t.getStore().folder, '../outside.txt');
      }),
    ).rejects.toThrow('outside');
    const template = {
      ...p.templates[0],
      id: 'imported-test',
      builtin: false,
      offlineVerified: false,
    };
    await page.evaluate((t) => window.imagine.saveTemplate(t), template);
    await expect(
      page.evaluate((t) => window.imagine.verifyOffline(t, 'not-a-job'), template.id),
    ).rejects.toThrow('Complete a run');
    server.setMode('success');
    await page.evaluate((r) => window.imagine.generate(r), {
      templateId: template.id,
      boardId: p.activeBoardId,
      prompt: 'Offline acceptance fixture',
      negative: '',
      checkpoint: 'sdxl-test.safetensors',
      seed: 200,
      width: 1024,
      height: 1024,
      count: 1,
      sourceIds: [],
      position: { x: 500, y: 0 },
      offlineTestConfirmed: true,
    });
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.imagine.currentProject()))!.jobs.at(-1)!.state,
      )
      .toBe('completed');
    const job = (await page.evaluate(() => window.imagine.currentProject()))!.jobs.at(-1)!;
    const verified = await page.evaluate(
      ({ id, jobId }) => window.imagine.verifyOffline(id, jobId),
      { id: template.id, jobId: job.id },
    );
    expect(verified.offlineEvidence!.method).toBe('user-confirmed-network-block');
    const changed = structuredClone(verified);
    changed.workflow['5'].inputs.steps = 30;
    expect(
      (await page.evaluate((t) => window.imagine.saveTemplate(t), changed)).offlineVerified,
    ).toBe(false);
  } finally {
    await server.close();
  }
});
test('drag/drop import, cancelled-job retry and preservation of another client’s running job', async () => {
  const server = await fakeComfy();
  try {
    const data = await page.evaluateHandle(
      (bytes) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(bytes)], 'drop.png', { type: 'image/png' }));
        return dt;
      },
      [...server.png],
    );
    await page
      .locator('.canvas-wrap')
      .dispatchEvent('drop', { dataTransfer: data, clientX: 300, clientY: 300 });
    await expect(page.locator('.image-node')).toHaveCount(1);
    server.setMode('hold');
    await page.evaluate((port) => window.imagine.connect(port), server.port);
    const p = (await page.evaluate(() => window.imagine.currentProject()))!;
    const [job] = await page.evaluate((r) => window.imagine.generate(r), {
      templateId: 'sdxl-text',
      boardId: p.activeBoardId,
      prompt: 'Cancel fixture',
      negative: '',
      checkpoint: 'sdxl-test.safetensors',
      seed: 300,
      width: 1024,
      height: 1024,
      count: 1,
      sourceIds: [],
      position: { x: 500, y: 0 },
    });
    await expect
      .poll(async () => (await page.evaluate(() => window.imagine.currentProject()))!.jobs[0].state)
      .toBe('running');
    server.waiting.push(server.pending.pop()!);
    await page.evaluate(() => window.imagine.reconcile());
    expect((await page.evaluate(() => window.imagine.currentProject()))!.jobs[0].state).toBe(
      'queued',
    );
    await page.evaluate((id) => window.imagine.cancelJob(id), job.id);
    expect(server.waiting).toHaveLength(0);
    expect(server.interrupted).toBe(0);
    const retry = await page.evaluate((id) => window.imagine.retryJob(id), job.id);
    expect(retry.parentJobId).toBe(job.id);
    expect(retry.seed).toBe(300);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.imagine.currentProject()))!.jobs.at(-1)!.state,
      )
      .toBe('running');
    server.pending.splice(0, server.pending.length, [999, 'other-client', {}, {}]);
    await page.evaluate((id) => window.imagine.cancelJob(id), retry.id);
    expect(server.interrupted).toBe(0);
    expect(server.pending[0][1]).toBe('other-client');
    expect((await page.evaluate(() => window.imagine.currentProject()))!.jobs.at(-1)!.state).toBe(
      'connection-unknown',
    );
  } finally {
    await server.close();
  }
});
test('submitted job survives application restart without another prompt submission', async () => {
  const server = await fakeComfy();
  try {
    server.setMode('hold');
    await page.evaluate((port) => window.imagine.connect(port), server.port);
    const p = (await page.evaluate(() => window.imagine.currentProject()))!;
    await page.evaluate((r) => window.imagine.generate(r), {
      templateId: 'sdxl-text',
      boardId: p.activeBoardId,
      prompt: 'Restart recovery',
      negative: '',
      checkpoint: 'sdxl-test.safetensors',
      seed: 400,
      width: 1024,
      height: 1024,
      count: 1,
      sourceIds: [],
      position: { x: 500, y: 0 },
    });
    await expect
      .poll(async () => (await page.evaluate(() => window.imagine.currentProject()))!.jobs[0].state)
      .toBe('running');
    await app.close();
    await launch(folder, false);
    expect((await page.evaluate(() => window.imagine.currentProject()))!.jobs[0].state).toBe(
      'connection-unknown',
    );
    await page.evaluate((port) => window.imagine.connect(port), server.port);
    const restored = (await page.evaluate(() => window.imagine.currentProject()))!.jobs[0];
    expect(restored.state).toBe('running');
    expect(restored.promptId).toBe('1');
    expect(server.submissions).toBe(1);
  } finally {
    await server.close();
  }
});
