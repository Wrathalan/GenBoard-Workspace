import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
let app: ElectronApplication, page: Page, folder: string;
async function launch(create: boolean) {
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
    async (_, data) => (globalThis as any).imagineTest.openProject(data.folder, data.create),
    { folder, create },
  );
  await page.evaluate(() => {
    localStorage.setItem('imagine.chatOpen', 'false');
    localStorage.setItem('imagine.snapGrid', 'true');
    localStorage.setItem('imagine.snapAlignment', 'true');
  });
  await page.reload();
}
const snapshot = () =>
  page.evaluate(async () => (await window.imagine.currentProject())!.boards[0].items);
const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
async function drag(id: string, dx: number, dy: number, release = true) {
  await node(id).click();
  const box = (await node(id).boundingBox())!;
  await page.mouse.move(box.x + 35, box.y + 35);
  await page.mouse.down();
  await page.mouse.move(box.x + 39, box.y + 35);
  await page.mouse.move(box.x + 35 + dx, box.y + 35 + dy, { steps: 12 });
  if (release) await page.mouse.up();
}
test.beforeEach(async () => {
  folder = path.resolve('.test-data', `sticky-edges-${Date.now()}`);
  await fs.mkdir(folder, { recursive: true });
  await launch(true);
  await page.evaluate(async () => {
    const p = (await window.imagine.currentProject())!,
      b = p.boards[0];
    b.viewport = { x: 0, y: 0, zoom: 1 };
    b.items = [
      {
        id: 'a',
        type: 'text',
        position: { x: 100, y: 120 },
        width: 100,
        height: 80,
        data: { text: 'First card' },
      },
      {
        id: 'b',
        type: 'text',
        position: { x: 399, y: 120 },
        width: 100,
        height: 80,
        data: { text: 'Second card' },
      },
    ];
    await window.imagine.saveBoard(b);
  });
  await page.reload();
});
test.afterEach(async () => {
  await app?.close();
});
test('edge priority, cyan crosshair, persistent locks, joint motion, undo and unlock', async () => {
  await drag('a', 196, 0, false);
  await expect(page.locator('.snap-guide.sticky-aligned')).toBeVisible();
  await expect(page.getByLabel('Edges aligned', { exact: true })).toBeVisible();
  const colors = await page.locator('.snap-guide.sticky-aligned').evaluate((el) => ({
    actual: getComputedStyle(el).backgroundColor,
    ordinary: getComputedStyle(document.documentElement).getPropertyValue('--color-guides'),
  }));
  expect(colors.actual).toBe('rgb(38, 217, 236)');
  await page.mouse.up();
  await expect(page.getByTitle('Lock edges', { exact: true })).toBeVisible();
  await expect.poll(async () => (await snapshot())[0].position.x).toBe(299);
  await page.getByTitle('Lock edges', { exact: true }).click();
  await expect.poll(async () => (await snapshot())[0].data.edgeLinks).toEqual(['b']);
  await expect(page.getByTitle('Unlock edges', { exact: true })).toBeVisible();
  await expect(node('a').locator('.react-flow__resize-control')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTitle('Lock edges', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(page.getByTitle('Unlock edges', { exact: true })).toBeVisible();
  await drag('a', 51, 73);
  await expect.poll(async () => (await snapshot())[0].position.y).not.toBe(120);
  let items = await snapshot();
  expect(items[1].position.x - items[0].position.x).toBe(100);
  expect(items[1].position.y).toBe(items[0].position.y);
  await app.close();
  await launch(false);
  await node('b').click();
  await expect(page.getByTitle('Unlock edges', { exact: true })).toBeVisible();
  await drag('b', 37, 41);
  await expect.poll(async () => (await snapshot())[1].position.y).not.toBe(items[1].position.y);
  items = await snapshot();
  expect(items[1].position.x - items[0].position.x).toBe(100);
  expect(items[1].position.y).toBe(items[0].position.y);
  await page.screenshot({ path: path.join(folder, 'sticky-edge-locked.png') });
  await page.getByTitle('Unlock edges', { exact: true }).click();
  const before = await snapshot();
  await drag('b', 100, 100);
  await expect.poll(async () => (await snapshot())[1].position.y).not.toBe(before[1].position.y);
  expect((await snapshot())[0].position).toEqual(before[0].position);
});

test('Codex moves and alignment preserve edge locks; deleting an endpoint cleans links', async () => {
  await drag('a', 196, 0);
  await page.getByTitle('Lock edges', { exact: true }).click();
  const boardId = await page.evaluate(
    async () => (await window.imagine.currentProject())!.activeBoardId,
  );
  await app.evaluate(
    async (_, boardId) =>
      (globalThis as any).imagineTest.executeCodexTool(boardId, 'move', {
        ids: ['b'],
        dx: 25,
        dy: 40,
      }),
    boardId,
  );
  let items = await snapshot();
  expect(items[0].position).toEqual({ x: 324, y: 160 });
  expect(items[1].position).toEqual({ x: 424, y: 160 });
  await app.evaluate(
    async (_, boardId) =>
      (globalThis as any).imagineTest.executeCodexTool(boardId, 'align', { ids: ['a', 'b'] }),
    boardId,
  );
  expect((await snapshot()).map((i) => i.position)).toEqual(items.map((i) => i.position));
  await page.mouse.click(900, 600);
  await node('a').click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await snapshot()).length).toBe(1);
  expect((await snapshot())[0].data.edgeLinks).toEqual([]);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await snapshot()).length).toBe(2);
  items = await snapshot();
  expect(items[0].data.edgeLinks).toEqual(['b']);
});
