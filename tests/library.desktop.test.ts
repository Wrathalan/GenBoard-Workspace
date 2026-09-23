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
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
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
