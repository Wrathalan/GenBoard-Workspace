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
});
test.afterEach(async () => {
  await app?.close();
});
const menu = () => page.getByRole('menu', { name: 'Canvas context menu' });
const menuitem = (name: string) => page.getByRole('menuitem', { name, exact: true });
async function right(x: number, y: number) {
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
