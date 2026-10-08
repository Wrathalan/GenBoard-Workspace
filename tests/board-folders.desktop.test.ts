import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;
test.beforeEach(async () => {
  const folder = path.resolve('.test-data', 'board-folders-' + Date.now());
  await fs.mkdir(folder, { recursive: true });
  const env = Object.fromEntries(Object.entries({ ...process.env, IMAGINE_TEST: '1' })
    .filter((e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE'));
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await page.waitForFunction(() => !!window.imagine);
  await app.evaluate(async (_, folder) => (globalThis as any).imagineTest.openProject(folder, true), folder);
  await page.evaluate(() => localStorage.setItem('imagine.referenceTrayCollapsed', 'true'));
  await page.reload();
  await page.getByRole('button', { name: 'Text card', exact: true }).waitFor();
  if (await page.getByRole('complementary', { name: 'Codex agent panel' }).isVisible())
    await page.getByRole('button', { name: 'Close Codex', exact: true }).click();
});
test.afterEach(async () => { await app?.close(); });

test('send-to menu moves to folders, releases to canvas, and copies to another board', async () => {
  await page.evaluate(async () => {
    const project = (await window.imagine.currentProject())!;
    const board = project.boards[0];
    board.viewport = { x: 0, y: 0, zoom: 1 };
    board.items = [
      { id: 'archive', type: 'group', position: { x: 500, y: 100 }, width: 240, height: 96,
        data: { folder: true, collapsed: true, label: 'Archive', expandedSize: { width: 480, height: 320 } } },
      { id: 'note', type: 'text', position: { x: 100, y: 100 }, width: 160, height: 100, data: { text: 'Send this note' } },
    ];
    await window.imagine.saveBoard(board);
    await window.imagine.createBoard('Destination');
  });
  await page.reload();
  await page.locator('.text-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Send to folder…', exact: true }).click();
  const folders = page.getByRole('dialog', { name: 'Send to folder', exact: true });
  await folders.getByLabel('Search destinations').fill('Arch');
  await folders.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('.text-node')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.text-node')).toHaveCount(1);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.text-node')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand folder Archive', exact: true }).click();
  await page.locator('.text-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Send to folder…', exact: true }).click();
  await folders.getByRole('button', { name: 'Board canvas (outside folders)', exact: true }).click();
  await expect(page.locator('.text-node')).toHaveCount(1);
  await page.locator('.text-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Send to board…', exact: true }).click();
  await page.getByRole('dialog', { name: 'Send to board', exact: true }).getByRole('button', { name: 'Destination', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Send to board', exact: true })).toHaveCount(0);
  const project = (await page.evaluate(() => window.imagine.currentProject()))!;
  expect(project.boards[0].items.find((i) => i.id === 'note')!.parentId).toBeUndefined();
  const copied = project.boards.find((b) => b.name === 'Destination')!.items;
  expect(copied).toHaveLength(1);
  expect(copied[0].id).not.toBe('note');
  expect(copied[0].data.text).toBe('Send this note');
});

test('new folder toolbar and drag-in release contents through Ungroup', async () => {
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await expect(page.locator('.folder-node')).toHaveCount(1);
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const project = (await window.imagine.currentProject())!;
    const board = project.boards[0];
    board.viewport = { x: 0, y: 0, zoom: 1 };
    board.items[0].position = { x: 500, y: 100 };
    board.items.push({ id: 'drop-note', type: 'text', position: { x: 100, y: 100 },
      width: 160, height: 100, data: { text: 'Drag me into a folder' } });
    await window.imagine.saveBoard(board);
  });
  await page.reload();
  const note = (await page.locator('.text-node').boundingBox())!;
  const folder = (await page.locator('.folder-node').boundingBox())!;
  await page.mouse.move(note.x + 80, note.y + 50);
  await page.mouse.down();
  await page.mouse.move(folder.x + 120, folder.y + 70, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.text-node')).toHaveCount(0);
  await expect(page.locator('.folder-node')).toContainText('1 item');
  await page.locator('.folder-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Ungroup', exact: true }).click();
  await expect(page.locator('.folder-node')).toHaveCount(0);
  await expect(page.locator('.text-node')).toHaveCount(1);
});

test('folder creation, expansion, undo, naming, duplication, and reload preserve contents', async () => {
  await page.getByRole('button', { name: 'Text card', exact: true }).click();
  await expect(page.locator('.text-node')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.locator('.text-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move selection into folder', exact: true }).click();
  await expect(page.locator('.folder-node')).toHaveCount(1);
  await expect(page.locator('.text-node')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand folder Folder', exact: true }).click();
  await expect(page.locator('.text-node')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.text-node')).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.text-node')).toHaveCount(1);
  await page.getByRole('button', { name: 'Collapse folder Folder', exact: true }).click();
  await page.locator('.folder-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename folder', exact: true }).click();
  await page.getByLabel('Folder name', { exact: true }).fill('References');
  await page.getByLabel('Folder name', { exact: true }).press('Tab');
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand folder References', exact: true })).toBeVisible();
  await expect(page.locator('.text-node')).toHaveCount(0);
  await page.locator('.folder-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('.folder-node')).toHaveCount(2);
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const project = (await page.evaluate(() => window.imagine.currentProject()))!;
  const items = project.boards[0].items;
  expect(items.filter((i) => i.data.folder)).toHaveLength(2);
  expect(items.filter((i) => i.type === 'text' && i.parentId)).toHaveLength(2);
});
