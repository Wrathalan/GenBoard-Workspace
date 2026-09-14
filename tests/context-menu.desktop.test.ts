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
let app: ElectronApplication, page: Page, folder: string;
test.beforeEach(async () => {
  folder = path.resolve('.test-data', 'menus-' + Date.now());
  await fs.mkdir(folder, { recursive: true });
  const env = Object.fromEntries(
    Object.entries({ ...process.env, IMAGINE_TEST: '1' }).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await page.waitForFunction(() => !!window.imagine);
  await app.evaluate(
    async (_, folder) => (globalThis as any).imagineTest.openProject(folder, true),
    folder,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Text card', exact: true }).waitFor();
  if (await page.getByRole('complementary', { name: 'Codex agent panel' }).isVisible())
    await page.getByRole('button', { name: 'Close Codex', exact: true }).click();
});
test.afterEach(async () => {
  await app?.close();
});
const menu = () => page.getByRole('menu', { name: 'Canvas context menu' });
const menuitem = (name: string) => page.getByRole('menuitem', { name, exact: true });
async function right(x: number, y: number) {
  await page.getByRole('button', { name: 'Text card', exact: true }).waitFor();
  await page.mouse.click(x, y, { button: 'right' });
  await expect(menu()).toBeVisible();
}
async function seedImages() {
  const png = await sharp({
    create: { width: 80, height: 120, channels: 3, background: '#7c976a' },
  })
    .png()
    .toBuffer();
  await page.evaluate(
    async (bytes) => {
      const [a] = await window.imagine.importImages([
        { name: 'menu-fixture.png', bytes: new Uint8Array(bytes) },
      ]);
      const p = (await window.imagine.currentProject())!;
      const b = p.boards[0];
      b.items = ['a', 'b'].map((id, index) => ({
        id,
        type: 'image',
        position: { x: 140 + index * 260, y: 130 },
        width: 160,
        height: 240,
        data: { assetId: a.id },
      }));
      await window.imagine.saveBoard(b);
    },
    [...png],
  );
  await page.reload();
  await expect(page.locator('.image-node')).toHaveCount(2);
  return png;
}
test('canvas creation anchors, right-drag, edge placement, keyboard and selection preservation', async () => {
  await page.evaluate(async () => {
    const p = (await window.imagine.currentProject())!;
    p.boards[0].viewport = { x: 60, y: 30, zoom: 0.5 };
    await window.imagine.saveBoard(p.boards[0]);
  });
  await page.reload();
  await right(320, 260);
  await menuitem('Add text here').click();
  await page.keyboard.press('Control+s');
  const wrap = await page.locator('.canvas-wrap').boundingBox();
  const p = (await page.evaluate(() => window.imagine.currentProject()))!;
  expect(p.boards[0].items[0].position.x).toBeCloseTo((320 - wrap!.x - 60) / 0.5);
  expect(p.boards[0].items[0].position.y).toBeCloseTo((260 - wrap!.y - 30) / 0.5);
  await page.locator('.text-node').click({ button: 'right' });
  await menuitem('Edit text').click();
  await page.getByLabel('Edit text card').fill('Context-created note');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await right(50, 100);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu()).toHaveCount(0);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  const before = (await page.evaluate(() => window.imagine.currentProject()))!.boards[0].viewport;
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(690, 360, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(menu()).toHaveCount(0);
  await page.keyboard.press('Control+s');
  const after = (await page.evaluate(() => window.imagine.currentProject()))!.boards[0].viewport;
  expect(after.x - before.x).toBeCloseTo(90);
  expect(after.y - before.y).toBeCloseTo(60);
  const size = page.viewportSize() || { width: 1500, height: 950 };
  await right(size.width - 40, size.height - 100);
  const box = await menu().boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width - 8);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height - 8);
  await page.keyboard.press('End');
  await expect(menuitem('Undo')).toBeFocused(); // Redo is disabled; last enabled item is Undo.
  await page.keyboard.press('Home');
  await expect(menuitem('Import images here…')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node-text').focus();
  await page.keyboard.press('Shift+F10');
  await expect(menuitem('Edit text')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.react-flow__node-text')).toBeFocused();
});
test('image menus preserve multi-selection, locks, references, copy, export, and reveal boundaries', async () => {
  const png = await seedImages();
  await page.locator('.image-node').first().click();
  await page
    .locator('.image-node')
    .last()
    .click({ modifiers: ['Control'] });
  await page.locator('.image-node').first().click({ button: 'right' });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await expect(menuitem('Copy image')).toHaveCount(0);
  await menuitem('Compare images').click();
  await expect(page.locator('.viewer-images img')).toHaveCount(2);
  await page.getByTitle('Close viewer').click();
  await page.keyboard.press('Escape');
  await page.locator('.image-node').first().click({ button: 'right' });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await menuitem('Copy image').click();
  const clipboard = await app.evaluate(async ({ clipboard }) => {
    const i = (await clipboard.read()).find((i) => i.types.includes('image/png'))!;
    const b = (await i.getType('image/png')) as Blob;
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  expect(await sharp(Buffer.from(clipboard)).raw().toBuffer()).toEqual(
    await sharp(png).raw().toBuffer(),
  );
  const destination = path.resolve('.test-data', 'export-' + Date.now() + '.png');
  await app.evaluate(({ dialog, shell }, destination) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: destination })) as any;
    shell.showItemInFolder = (file) => {
      (globalThis as any).revealedFile = file;
    };
  }, destination);
  await page.locator('.image-node').first().click({ button: 'right' });
  await menuitem('Save original as…').click();
  await expect
    .poll(() =>
      fs
        .readFile(destination)
        .then((b) => b.length)
        .catch(() => 0),
    )
    .toBe(png.length);
  expect(await fs.readFile(destination)).toEqual(png);
  await page.locator('.image-node').first().click({ button: 'right' });
  await menuitem('Show in Explorer').click();
  expect(await app.evaluate(() => (globalThis as any).revealedFile)).toContain(
    path.join(folder, 'originals'),
  );
  const p = (await page.evaluate(() => window.imagine.currentProject()))!;
  const id = p.assets[0].id;
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = (async () => ({ canceled: true, filePath: '' })) as any;
  });
  expect(await page.evaluate((id) => window.imagine.exportAsset(id), id)).toBe(false);
  await app.evaluate(
    ({ dialog }, destination) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: destination })) as any;
    },
    path.join(folder, p.assets[0].path),
  );
  await expect(page.evaluate((id) => window.imagine.exportAsset(id), id)).rejects.toThrow(
    'outside the project',
  );
  await expect(page.evaluate(() => window.imagine.copyAssetImage('../invalid'))).rejects.toThrow(
    'no longer available',
  );
  await page.locator('.image-node').first().click({ button: 'right' });
  await menuitem('Lock').click();
  await page.locator('.image-node').first().click({ button: 'right' });
  await expect(menuitem('Delete')).toBeDisabled();
  await expect(menuitem('Duplicate')).toBeDisabled();
  await expect(menuitem('Copy image')).toBeEnabled();
  await menuitem('Use as reference').click();
  await expect(page.getByLabel('Workflow', { exact: true })).toHaveValue('sdxl-image');
  await expect(page.getByAltText('Generation reference')).toBeVisible();
  await page.getByTitle('Close generation').click();
  await page.locator('.image-node').first().click({ button: 'right' });
  await menuitem('Unlock').click();
  await page.locator('.image-node').first().click({ button: 'right' });
  await page.screenshot({ path: 'test-results/context-menu.png' });
});
test('import and clipboard placement, native editing menu, group rename and job actions', async () => {
  const fixture = await fakeComfy();
  try {
    const source = path.resolve('.test-data', 'import-' + Date.now() + '.png');
    await fs.writeFile(source, fixture.png);
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as any;
    }, source);
    await right(210, 180);
    await menuitem('Import images here…').click();
    await expect(page.locator('.image-node')).toHaveCount(1);
    await page.locator('.image-node').click({ button: 'right' });
    await menuitem('Copy image').click();
    await right(650, 250);
    await menuitem('Paste image here').click();
    await expect(page.locator('.image-node')).toHaveCount(2);
    await page.keyboard.press('Control+a');
    await page.locator('.image-node').first().click({ button: 'right' });
    await menuitem('Group').click();
    await expect(page.locator('.group-node')).toHaveCount(1);
    await page.locator('.group-node > span').click({ button: 'right' });
    await menuitem('Rename group').click();
    await expect(page.getByLabel('Group name')).toBeFocused();
    await page.getByLabel('Group name').fill('Menu references');
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function () {
        (globalThis as any).nativeMenuRoles = this.items.map((i) => i.role || i.type);
      };
    });
    await page.getByLabel('Group name').click({ button: 'right' });
    await expect(menu()).toHaveCount(0);
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).nativeMenuRoles))
      .toEqual(['cut', 'copy', 'paste', 'separator', 'selectall']);
    await page.getByTitle('Close inspector').click();
    await app.evaluate(({ clipboard }) => clipboard.clear());
    await right(50, 100);
    await menuitem('Paste image here').click();
    await expect(page.getByRole('alert')).toContainText('No image on clipboard');
    await page.getByTitle('Dismiss error').click();
    fixture.setMode('hold');
    await page.evaluate((port) => window.imagine.connect(port), fixture.port);
    const p = (await page.evaluate(() => window.imagine.currentProject()))!;
    await page.evaluate((r) => window.imagine.generate(r), {
      templateId: 'sdxl-text',
      boardId: p.activeBoardId,
      prompt: 'Menu job test',
      negative: '',
      checkpoint: 'sdxl-test.safetensors',
      seed: 10,
      count: 1,
      width: 1024,
      height: 1024,
      sourceIds: [],
      position: { x: 800, y: 300 },
    });
    await expect
      .poll(async () => (await page.evaluate(() => window.imagine.currentProject()))!.jobs[0].state)
      .toBe('running');
    await page.locator('.job-node').click({ button: 'right' });
    await menuitem('View job details').click();
    await expect(page.locator('.job-row details')).toHaveAttribute('open', '');
    await page.getByTitle('Close generation').click();
    await page.locator('.job-node').click({ button: 'right' });
    await menuitem('Cancel job').click();
    await expect
      .poll(async () => (await page.evaluate(() => window.imagine.currentProject()))!.jobs[0].state)
      .toBe('cancelled');
    await page.locator('.job-node').click({ button: 'right' });
    await expect(menuitem('Retry as new attempt')).toBeEnabled();
    await menuitem('Remove placeholder').click();
    await expect(page.locator('.job-node')).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});

test('grid snapping and alignment guides work during a drag and undo restores position', async () => {
  await page.evaluate(async () => {
    const p = (await window.imagine.currentProject())!;
    const b = p.boards[0];
    b.viewport = { x: 0, y: 0, zoom: 1 };
    b.items = ['a', 'b'].map((id, index) => ({
      id,
      type: 'text',
      position: { x: 120 + index * 360, y: 120 + index * 180 },
      width: 100,
      height: 80,
      data: { text: id },
    }));
    await window.imagine.saveBoard(b);
  });
  await page.reload();
  const grid = page.getByRole('button', { name: 'Snap to grid', exact: true });
  const guides = page.getByRole('button', { name: 'Alignment guides', exact: true });
  if ((await grid.getAttribute('aria-pressed')) === 'false') await grid.click();
  if ((await guides.getAttribute('aria-pressed')) === 'true') await guides.click();
  let box = (await page.locator('[data-id="a"]').boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 59, box.y + 67, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('Control+s');
  let p = (await page.evaluate(() => window.imagine.currentProject()))!;
  expect(p.boards[0].items.find((i) => i.id === 'a')!.position).toEqual({ x: 144, y: 144 });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+s');
  p = (await page.evaluate(() => window.imagine.currentProject()))!;
  expect(p.boards[0].items.find((i) => i.id === 'a')!.position).toEqual({ x: 120, y: 120 });
  await guides.click();
  box = (await page.locator('[data-id="a"]').boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 34, box.y + 30);
  await page.mouse.move(box.x + 393, box.y + 110, { steps: 10 });
  await expect(page.locator('.snap-guide.x')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.snap-guide')).toHaveCount(0);
  await page.keyboard.press('Control+s');
  p = (await page.evaluate(() => window.imagine.currentProject()))!;
  expect(p.boards[0].items.find((i) => i.id === 'a')!.position.x).toBe(480);
  await page.reload();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(guides).toHaveAttribute('aria-pressed', 'true');
});

test('appearance colors preview, persist and reset without changing board content', async () => {
  await page.getByRole('button', { name: 'Text card', exact: true }).click();
  await page.keyboard.press('Control+s');
  const before = (await page.evaluate(() => window.imagine.currentProject()))!.boards[0].items;
  await page.getByRole('button', { name: 'Customize colors', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Customize colors' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Canvas background', { exact: true }).fill('#203040');
  await dialog.getByLabel('Selection highlights', { exact: true }).fill('#ff8800');
  await dialog.getByLabel('Text cards', { exact: true }).fill('#aaddff');
  await expect(page.locator('.canvas-wrap')).toHaveCSS('background-color', 'rgb(32, 48, 64)');
  await expect(page.locator('.text-node')).toHaveCSS('color', 'rgb(170, 221, 255)');
  await page.keyboard.press('Delete');
  await page.screenshot({ path: 'docs/screenshots/appearance.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Customize colors', exact: true }).click();
  await expect(dialog.getByLabel('Canvas background', { exact: true })).toHaveValue('#203040');
  await dialog.getByRole('button', { name: 'Reset colors' }).click();
  await expect(dialog.getByLabel('Canvas background', { exact: true })).toHaveValue('#111110');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  expect((await page.evaluate(() => window.imagine.currentProject()))!.boards[0].items).toEqual(
    before,
  );
});

test('Codex tool bridge edits with undo and generates through the local harness', async () => {
  const run = async (action: string, args: Record<string, unknown>) =>
    app.evaluate(
      async (_, input) => {
        const t = (globalThis as any).imagineTest;
        return t.executeCodexTool(t.snapshot().activeBoardId, input.action, input.args);
      },
      { action, args },
    );
  const created = (await run('add_text', { text: 'Agent note', x: 200, y: 200 })) as { id: string };
  await expect(page.locator('.text-node')).toHaveText('Agent note');
  await run('move', { ids: [created.id], dx: 24, dy: 48 });
  await run('undo', {});
  let snapshot = (await run('snapshot', {})) as any;
  expect(snapshot.board.items[0].position).toEqual({ x: 200, y: 200 });
  expect(snapshot).not.toHaveProperty('folder');
  await run('lock', { ids: [created.id] });
  await expect(run('edit_text', { id: created.id, text: 'no' })).rejects.toThrow('unlocked');
  const server = await fakeComfy();
  try {
    await run('connect', { port: server.port });
    snapshot = (await run('snapshot', {})) as any;
    const template = snapshot.workflows.find((t: any) => t.id === 'sdxl-text');
    expect(template).toBeTruthy();
    const result = (await run('generate', {
      templateId: template.id,
      prompt: 'graphic mountain',
      checkpoint: snapshot.capabilities.checkpoints[0],
      width: 1024,
      height: 1024,
      count: 1,
      seed: 123,
      x: 500,
      y: 200,
    })) as any;
    expect(result.jobs).toHaveLength(1);
    expect(result.finalPrompt).toContain('Current request');
    await expect
      .poll(async () => ((await run('snapshot', {})) as any).jobs[0].state)
      .toBe('completed');
  } finally {
    await server.close();
  }
  await page.getByRole('button', { name: 'Codex workspace agent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign into Codex', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/codex.png' });
});

test('installed Codex app-server initializes with isolated signed-out profile', async () => {
  await page.getByRole('button', { name: 'Codex workspace agent', exact: true }).click();
  const status = await page.evaluate(() => window.imagine.codexStatus());
  expect(status.signedIn).toBe(false);
  expect(status.label).toBe('Not signed in');
});

test('left chat sends conversational messages, attaches selections and imports imagegen results', async () => {
  await seedImages();
  await page.locator('.image-node').first().click();
  await page.getByRole('button', { name: 'Codex workspace agent', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Codex agent panel' });
  const bounds = (await panel.boundingBox())!,
    canvas = (await page.locator('.canvas-wrap').boundingBox())!;
  expect(bounds.x).toBeLessThan(10);
  expect(canvas.x).toBeGreaterThanOrEqual(bounds.x + bounds.width - 1);
  await app.evaluate(({ BrowserWindow }) => {
    const h = (globalThis as any).imagineTest.getCodex();
    h.status = async () => ({ signedIn: true, label: 'Test account', imageGeneration: true });
    h.run = async (board: string, prompt: string, options: any) => {
      (globalThis as any).chatTest = { board, prompt, options };
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send('codex:event', {
        type: 'text',
        itemId: 'reply-1',
        text: 'Here is a new direction.',
      });
      win.webContents.send('codex:event', { type: 'done', text: 'Completed' });
    };
  });
  await page.getByRole('button', { name: 'Connect / refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Attach selected images', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Codex request' });
  await composer.fill('Make a variation');
  await composer.press('Shift+Enter');
  await composer.type('with blue light');
  await composer.press('Enter');
  await expect(page.getByLabel('Your message', { exact: true })).toContainText('with blue light');
  await expect(page.getByLabel('Codex message', { exact: true })).toContainText(
    'Here is a new direction.',
  );
  expect(await app.evaluate(() => (globalThis as any).chatTest.options.images.length)).toBe(1);
  const png = await sharp({
    create: { width: 80, height: 120, channels: 3, background: '#3e88bb' },
  })
    .png()
    .toBuffer();
  const imported = await app.evaluate(
    async ({ BrowserWindow }, bytes) => {
      const t = (globalThis as any).imagineTest;
      const r = await t.executeCodexTool(t.snapshot().activeBoardId, 'ingest_codex_image', {
        bytes: new Uint8Array(bytes),
        providerItemId: 'fixture-image',
        revisedPrompt: 'Blue lighting',
        sourceIds: [],
        position: { x: 600, y: 250 },
      });
      BrowserWindow.getAllWindows()[0].webContents.send('codex:event', {
        type: 'image',
        itemId: 'image-result',
        text: 'Generated image',
        assetId: r.assetId,
      });
      return r;
    },
    [...png],
  );
  await expect(page.getByAltText('Chat image').last()).toBeVisible();
  expect(
    (await page.evaluate(() => window.imagine.currentProject()))!.assets.some(
      (a) => a.id === imported.assetId,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/codex-chat.png' });
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.getByLabel('Your message', { exact: true })).toHaveCount(0);
});

test('recent project opens from the welcome screen after restarting without a folder dialog', async () => {
  await page.getByRole('button', { name: 'Text card', exact: true }).click();
  await page.keyboard.press('Control+s');
  const name = (await page.evaluate(() => window.imagine.currentProject()))!.name;
  await app.close();
  const env = Object.fromEntries(
    Object.entries({ ...process.env, IMAGINE_TEST: '1' }).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => {
      throw new Error('Recent project must not open a folder dialog');
    };
  });
  await page.getByRole('button', { name: `Open recent project ${name}`, exact: true }).click();
  await expect(page.locator('.text-node')).toHaveCount(1);
  await page.getByRole('button', { name: 'Projects and boards', exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Open recent project ${name}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/recent-projects.png' });
  await page.getByRole('button', { name: `Forget recent project ${name}`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Open recent project ${name}`, exact: true }),
  ).toHaveCount(0);
  expect((await fs.stat(path.join(folder, 'workspace.sqlite'))).isFile()).toBe(true);
});
