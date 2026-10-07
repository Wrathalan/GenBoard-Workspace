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
let app: ElectronApplication, page: Page, folder: string;
test.beforeEach(async () => {
  folder = path.resolve('.test-data', `library-${Date.now()}`);
  await fs.mkdir(folder, { recursive: true });
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    IMAGINE_TEST: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await app.evaluate(
    async (_, folder) => (globalThis as any).imagineTest.openProject(folder, true),
    folder,
  );
  await page.evaluate(() => localStorage.setItem('imagine.chatOpen', 'true'));
  await page.reload();
  await expect(page.getByLabel('Codex request')).toBeVisible();
  const bytes = await sharp({
    create: { width: 100, height: 100, channels: 4, background: '#326eb3' },
  })
    .png()
    .toBuffer();
  await page.evaluate(
    async (bytes) => {
      await window.imagine.importImages([{ name: 'hero.png', bytes: new Uint8Array(bytes) }]);
    },
    [...bytes],
  );
  await page.reload();
});
test.afterEach(async () => {
  await app?.close();
});

test('folders and character profiles persist; references drop into Codex', async () => {
  await page.getByLabel('Projects and boards').click();
  await page.getByLabel('Folder name', { exact: true }).fill('Cast');
  await page.getByRole('region', { name: 'Project library' }).getByRole('button', { name: 'New folder', exact: true }).click();
  await expect(page.getByRole('button', { name: '📁 Cast' })).toBeVisible();
  await page.getByLabel('Select reference hero.png').check();
  const folderId = await page.evaluate(
    async () => (await window.imagine.currentProject())!.library!.folders[0].id,
  );
  await page.getByLabel('Move references to folder').selectOption(folderId);
  await page.getByRole('button', { name: 'New character from selection' }).click();
  await page.getByLabel('Character name', { exact: true }).fill('Hero');
  await page.getByLabel('Character description').fill('Blue coat, amber eyes');
  await page.getByRole('button', { name: 'Save character', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hero · 1 refs' })).toBeVisible();
  await page.getByTitle('Add hero.png to board').dragTo(page.getByLabel('Codex request'));
  await expect(page.locator('.chat-attachments img')).toHaveCount(1);
  await page.reload();
  await page.getByLabel('Projects and boards').click();
  await expect(page.getByRole('button', { name: '📁 Cast' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hero · 1 refs' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Hero · 1 refs' })
    .dragTo(page.getByLabel('Codex request'));
  await expect(page.getByLabel('Codex character reference')).not.toHaveValue('');
  const library = await page.evaluate(
    async () => (await window.imagine.currentProject())!.library!,
  );
  expect(Object.values(library.assetFolders)).toEqual([folderId]);
  await page.screenshot({ path: path.join(folder, 'library-and-references.png') });
});

test('queued Codex tasks wait for completion, retain references, and pause on failures', async () => {
  // Replace only the provider in this synthetic test; the UI and IPC stay real.
  await app.evaluate(() => {
    const codex = (globalThis as any).imagineTest.getCodex();
    (globalThis as any).testRuns = [];
    codex.status = async () => ({ signedIn: true, label: 'Synthetic test provider' });
    codex.run = async (board: string, text: string, options: unknown) => {
      (globalThis as any).testRuns.push({ board, text, options });
    };
    codex.stop = async () => codex.emit('done', 'interrupted');
  });
  await page.getByRole('button', { name: 'Connect / refresh', exact: true }).click();
  const send = async (text: string) => {
    await page.getByLabel('Codex request').fill(text);
    await page.getByLabel('Codex request').press('Enter');
  };
  await send('First');
  await expect(page.getByRole('button', { name: 'Queue task', exact: true })).toBeVisible();
  const assetId = await page.evaluate(async () => {
    const p = (await window.imagine.currentProject())!;
    await window.imagine.saveLibrary({
      folders: [],
      assetFolders: {},
      characters: [
        { id: 'hero', name: 'Hero', description: 'Blue coat', assetIds: [p.assets[0].id] },
      ],
    });
    return p.assets[0].id;
  });
  await page.getByLabel('Codex character reference').selectOption('hero');
  await send('Second');
  await page.evaluate(async () => {
    const p = (await window.imagine.currentProject())!;
    p.library!.characters[0].description = 'Changed after queueing';
    await window.imagine.saveLibrary(p.library!);
  });
  await send('Third');
  await expect(page.getByLabel('Queued Codex tasks')).toContainText('2 queued');
  expect(await app.evaluate(() => (globalThis as any).testRuns.length)).toBe(1);
  await page.getByLabel('Move queued task 2 up').click();
  await app.evaluate(() => (globalThis as any).imagineTest.getCodex().emit('done', 'completed'));
  await expect.poll(() => app.evaluate(() => (globalThis as any).testRuns.length)).toBe(2);
  expect(await app.evaluate(() => (globalThis as any).testRuns[1].text)).toBe('Third');
  await app.evaluate(() => (globalThis as any).imagineTest.getCodex().emit('done', 'failed'));
  await expect(page.getByRole('button', { name: 'Resume queue' })).toBeVisible();
  expect(await app.evaluate(() => (globalThis as any).testRuns.length)).toBe(2);
  await page.getByRole('button', { name: 'Resume queue' }).click();
  await expect.poll(() => app.evaluate(() => (globalThis as any).testRuns.length)).toBe(3);
  const second = await app.evaluate(() => (globalThis as any).testRuns[2]);
  expect(second.text).toContain('Blue coat');
  expect(second.text).not.toContain('Changed after queueing');
  expect(second.options.referenceAssetIds).toEqual([assetId]);
  await send('Fourth');
  await page.getByTitle('Stop response').click();
  await expect(page.getByRole('button', { name: 'Resume queue' })).toBeVisible();
  await page.getByLabel('Cancel queued task 1').click();
  await expect(page.getByLabel('Queued Codex tasks')).toHaveCount(0);
});

test('a reply after generation failure runs first and resumes pending tasks only after success', async () => {
  await app.evaluate(() => {
    const codex = (globalThis as any).imagineTest.getCodex();
    (globalThis as any).testRuns = [];
    codex.status = async () => ({ signedIn: true, label: 'Synthetic test provider' });
    codex.run = async (_board: string, text: string) => {
      (globalThis as any).testRuns.push(text);
      if (text === 'Submission failure') {
        codex.emit('done', 'Stopped');
        throw new Error('Synthetic submission failure');
      }
    };
    codex.stop = async () => codex.emit('done', 'interrupted');
  });
  const runs = () => app.evaluate(() => (globalThis as any).testRuns as string[]);
  const emit = (type: string, text: string) =>
    app.evaluate((_, e) => (globalThis as any).imagineTest.getCodex().emit(e.type, e.text), {
      type,
      text,
    });
  const send = async (text: string) => {
    await page.getByLabel('Codex request').fill(text);
    await page.getByLabel('Codex request').press('Enter');
  };
  await page.getByRole('button', { name: 'Connect / refresh', exact: true }).click();
  await send('Generate');
  await expect.poll(runs).toEqual(['Generate']);
  await send('Pending one');
  await send('Pending two');
  await emit('error', 'Image generation failed.');
  await emit('done', 'completed');
  await expect(page.getByRole('button', { name: 'Resume queue' })).toBeVisible();
  await send('Use a simpler prompt');
  await expect.poll(runs).toEqual(['Generate', 'Use a simpler prompt']);
  await expect(page.getByLabel('Queued Codex tasks')).toContainText('2 queued');
  // Streaming a response is not completion; a second generation error keeps the queue paused.
  await emit('text', 'Trying the revised prompt');
  await emit('error', 'Image generation failed again.');
  await emit('done', 'completed');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  expect(await runs()).toEqual(['Generate', 'Use a simpler prompt']);
  await send('Submission failure');
  await expect(page.getByText(/Request failed:.*Synthetic submission failure/)).toBeVisible();
  await send('Skip the failed image');
  await expect
    .poll(runs)
    .toEqual(['Generate', 'Use a simpler prompt', 'Submission failure', 'Skip the failed image']);
  await emit('done', 'completed');
  await expect
    .poll(runs)
    .toEqual([
      'Generate',
      'Use a simpler prompt',
      'Submission failure',
      'Skip the failed image',
      'Pending one',
    ]);
  // Stop remains a deliberate pause: sending another message must not override it.
  await page.getByTitle('Stop response').click();
  await send('After stop');
  await expect(page.getByLabel('Queued Codex tasks')).toContainText('2 queued');
  expect((await runs()).at(-1)).toBe('Pending one');
  await page.getByRole('button', { name: 'Resume queue' }).click();
  await expect.poll(async () => (await runs()).at(-1)).toBe('Pending two');
  await page.getByRole('button', { name: 'Pause queue' }).click();
  await emit('error', 'Image generation failed.');
  await emit('done', 'completed');
  await send('After manual pause');
  await expect(page.getByLabel('Queued Codex tasks')).toContainText('2 queued');
  expect((await runs()).at(-1)).toBe('Pending two');
});

test('16 references cross the real Codex handoff as images; overflow remains editable', async () => {
  const originals: number[][] = [];
  for (let index = 0; index < 17; index++)
    originals.push([
      ...(await sharp({
        create: {
          width: 10,
          height: 12,
          channels: 4,
          background: { r: index * 10, g: 50, b: 80, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer()),
    ]);
  const ids = await page.evaluate(async (originals) => {
    const assets = await window.imagine.importImages(
      originals.map((bytes, index) => ({ name: `ref-${index}.png`, bytes: new Uint8Array(bytes) })),
    );
    await window.imagine.saveLibrary({
      folders: [],
      assetFolders: {},
      characters: [
        {
          id: 'many',
          name: 'Many references',
          description: 'Preserve identity',
          assetIds: assets.slice(0, 16).map((a) => a.id),
        },
      ],
    });
    return assets.map((a) => a.id);
  }, originals);
  await page.reload();
  await app.evaluate(() => {
    const codex = (globalThis as any).imagineTest.getCodex();
    (globalThis as any).attachmentRequests = [];
    // Keep the real run/validation/encoding path; replace only the RPC provider.
    codex.status = async () => {
      codex.rpc = {
        request: async (method: string, params: unknown) => {
          (globalThis as any).attachmentRequests.push({ method, params });
          return method === 'thread/start'
            ? { thread: { id: 'attachment-thread' } }
            : { turn: { id: 'attachment-turn' } };
        },
        close: () => {},
      };
      return { signedIn: true, label: 'Synthetic attachment provider' };
    };
  });
  await page.getByRole('button', { name: 'Connect / refresh', exact: true }).click();
  await page.getByLabel('Codex character reference').selectOption('many');
  await page.evaluate(
    (ids) =>
      window.dispatchEvent(
        new CustomEvent('imagine:attach-references', { detail: [ids[0], ids[16]] }),
      ),
    ids,
  );
  await expect(page.getByLabel('Reference image count')).toHaveText('17/16 reference images');
  await page.getByLabel('Codex request').fill('Use the whole reference set');
  await page.getByLabel('Codex request').press('Enter');
  await expect(page.locator('.chat-status')).toContainText('up to 16');
  await expect(page.getByLabel('Codex request')).toHaveValue('Use the whole reference set');
  expect(await app.evaluate(() => (globalThis as any).attachmentRequests.length)).toBe(0);
  await page.getByLabel('Remove reference 2', { exact: true }).click();
  await expect(page.getByLabel('Reference image count')).toHaveText('16/16 reference images');
  await page.screenshot({ path: path.join(folder, 'sixteen-references.png') });
  await page.getByLabel('Codex request').press('Enter');
  await expect
    .poll(() =>
      app.evaluate(
        () =>
          (globalThis as any).attachmentRequests.filter((r: any) => r.method === 'turn/start')
            .length,
      ),
    )
    .toBe(1);
  const input = await app.evaluate(
    () =>
      (globalThis as any).attachmentRequests.find((r: any) => r.method === 'turn/start').params
        .input,
  );
  expect(input.filter((i: any) => i.type === 'localImage')).toHaveLength(0);
  const images = input.filter((i: any) => i.type === 'image');
  expect(images).toHaveLength(16);
  expect(images.map((i: any) => [...Buffer.from(i.url.split(',')[1], 'base64')])).toEqual(
    originals.slice(0, 16),
  );
  const rejection = await page.evaluate(async (ids) => {
    try {
      const p = (await window.imagine.currentProject())!;
      await window.imagine.codexRun(p.activeBoardId, 'Too many', { referenceAssetIds: ids });
    } catch (error) {
      return String(error);
    }
  }, ids);
  expect(rejection).toContain('up to 16');
});

test('dropping an existing image into a group preserves membership through undo and reopen', async () => {
  await page.getByLabel('Close Codex').click();
  await page.evaluate(async () => {
    const p = (await window.imagine.currentProject())!,
      b = p.boards[0];
    b.viewport = { x: 0, y: 0, zoom: 1 };
    b.items = [
      {
        id: 'destination',
        type: 'group',
        position: { x: 400, y: 200 },
        width: 400,
        height: 400,
        data: { label: 'Destination' },
      },
      {
        id: 'image',
        type: 'image',
        position: { x: 100, y: 100 },
        width: 100,
        height: 100,
        data: { assetId: p.assets[0].id },
      },
    ];
    await window.imagine.saveBoard(b);
  });
  await page.reload();
  const image = page.locator('.react-flow__node[data-id="image"]');
  const box = (await image.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 390, box.y + 190, { steps: 15 });
  await page.mouse.up();
  const parent = () =>
    page.evaluate(
      async () =>
        (await window.imagine.currentProject())!.boards[0].items.find((i) => i.id === 'image')
          ?.parentId,
    );
  await expect.poll(parent).toBe('destination');
  await page.keyboard.press('Control+z');
  await expect.poll(parent).toBeUndefined();
  await page.keyboard.press('Control+y');
  await expect.poll(parent).toBe('destination');
  await page.reload();
  await expect.poll(parent).toBe('destination');
  const before = await page.evaluate(
    async () => (await window.imagine.currentProject())!.boards[0].items,
  );
  await page.getByLabel('Codex workspace agent').click();
  const movedBox = (await image.boundingBox())!;
  await page.mouse.move(movedBox.x + 40, movedBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(150, 400, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator('.chat-attachments img')).toHaveCount(1);
  await expect
    .poll(async () =>
      page.evaluate(async () => (await window.imagine.currentProject())!.boards[0].items),
    )
    .toEqual(before);
});
