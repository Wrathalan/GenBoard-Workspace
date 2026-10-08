import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

let app: ElectronApplication;
test.afterEach(async () => { await app?.close(); });

test('reference tray stays in viewport and saves separate categories without board items', async () => {
  const folder = path.resolve('.test-data', `reference-tray-${Date.now()}`);
  await fs.mkdir(folder, { recursive: true });
  const env = Object.fromEntries(Object.entries({ ...process.env, IMAGINE_TEST: '1' })
    .filter((e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE'));
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.imagine);
  await page.evaluate(() => localStorage.removeItem('imagine.referenceTrayCollapsed'));
  await app.evaluate(async (_, folder) => (globalThis as any).imagineTest.openProject(folder, true), folder);
  await page.reload();
  const tray = page.getByRole('region', { name: 'Reference tray', exact: true });
  await expect(tray).toBeVisible();
  expect(await tray.getByRole('tab').allTextContents()).toEqual(['Character', 'Attire', 'Environment']);
  await expect(tray.getByRole('tab', { name: 'Character', exact: true })).toHaveAttribute('aria-selected', 'true');
  const image = [...await sharp({ create: { width: 64, height: 64, channels: 3, background: '#7d9a67' } }).png().toBuffer()];
  const drop = async () => {
    await tray.evaluate((element, bytes) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([new Uint8Array(bytes)], 'reference.png', { type: 'image/png' }));
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    }, image);
    await expect(tray.getByRole('button', { name: 'Preview reference.png', exact: true })).toBeVisible();
    await expect.poll(async () => (await page.evaluate(() => window.imagine.currentProject()))!
      .boards[0].references).not.toBeUndefined();
  };
  await drop();
  await tray.getByRole('tab', { name: 'Attire', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Preview reference.png', exact: true })).toHaveCount(0);
  await drop();
  await expect.poll(async () => (await page.evaluate(() => window.imagine.currentProject()))!
    .boards[0].references?.attire?.length).toBe(1);
  await page.reload();
  await expect(tray.getByRole('button', { name: 'Preview reference.png', exact: true })).toBeVisible();
  await tray.getByRole('tab', { name: 'Attire', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Preview reference.png', exact: true })).toBeVisible();
  await tray.getByRole('tab', { name: 'Environment', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Preview reference.png', exact: true })).toHaveCount(0);
  const before = (await tray.boundingBox())!;
  const canvas = (await page.locator('.canvas-wrap').boundingBox())!;
  expect(before.x - canvas.x).toBe(12);
  expect(before.y - canvas.y).toBe(12);
  const project = (await page.evaluate(() => window.imagine.currentProject()))!;
  expect(project.boards[0].items).toHaveLength(0);
  await page.mouse.move(canvas.x + canvas.width - 100, canvas.y + canvas.height - 150);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(canvas.x + canvas.width - 200, canvas.y + canvas.height - 200, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  expect(await tray.boundingBox()).toEqual(before);
  await tray.getByRole('tab', { name: 'Attire', exact: true }).click();
  await tray.getByRole('button', { name: 'Remove reference.png from Attire references', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.imagine.currentProject()))!
    .boards[0].references?.attire).toEqual([]);
  await tray.getByRole('tab', { name: 'Character', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Preview reference.png', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/reference-tray.png' });
  await tray.getByRole('button', { name: 'References', exact: true }).click();
  await page.reload();
  await expect(tray.getByRole('tablist')).toBeHidden();
  await expect(tray.getByRole('button', { name: 'References', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await tray.getByRole('button', { name: 'References', exact: true }).click();
  await expect(tray.getByRole('tab', { name: 'Character', exact: true })).toBeVisible();
});
