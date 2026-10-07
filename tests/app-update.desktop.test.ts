import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';

let app: ElectronApplication, page: Page, folder: string;
let nextVersion: string;
test.beforeEach(async () => {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const parts = pkg.version.split('.').map(Number);
  nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  folder = await fs.mkdtemp(path.resolve('.test-data', 'updater-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)),
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
});
test.afterEach(async () => {
  await app?.close();
});

test('top-bar update downloads on click, protects active work, and flushes edits before restart', async () => {
  await expect(page.getByRole('button', { name: 'Update available', exact: true })).toHaveCount(0);
  await app.evaluate(async () => {
    const t = (globalThis as any).imagineTest;
    t.getUpdater().enabled = true;
    const driver = t.getUpdateDriver();
    driver.checkForUpdates = async () => ({
      isUpdateAvailable: true,
      updateInfo: { version: '0.4.1' },
    });
    driver.downloadUpdate = () =>
      new Promise((resolve) => {
        (globalThis as any).finishDownload = resolve;
        driver.emit('download-progress', { percent: 35 });
      });
    (globalThis as any).installs = 0;
    driver.quitAndInstall = () => {
      (globalThis as any).installs++;
      (globalThis as any).savedAtInstall = t.snapshot();
    };
    await t.getUpdater().check();
  });
  // Initial retrieval restores the notification even if its event preceded mounting.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Update available', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(folder, 'update-topbar.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 700));
  await page.screenshot({ path: path.join(folder, 'update-topbar-narrow.png') });
  const bounds = await page
    .getByRole('button', { name: 'Update available', exact: true })
    .boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(900);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1500, 950));
  await page.getByRole('button', { name: 'Update available', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Updating 35%', exact: true })).toBeDisabled();
  await app.evaluate(() => (globalThis as any).finishDownload(['synthetic-installer.exe']));
  const restart = page.getByRole('button', { name: 'Restart to update', exact: true });
  await expect(restart).toBeVisible();
  await app.evaluate(() => (globalThis as any).imagineTest.getCodex().setRunning(true));
  await restart.click();
  await expect(page.locator('.update-notice-message')).toContainText('Codex turn');
  // Main-process enforcement also rejects a direct IPC call.
  expect(
    await page.evaluate(() => window.imagine.installAppUpdate(0).then(() => '', String)),
  ).toContain('Codex turn');
  await app.evaluate(() => (globalThis as any).imagineTest.getCodex().setRunning(false));
  await app.evaluate(() => {
    const codex = (globalThis as any).imagineTest.getCodex();
    codex.status = async () => ({ signedIn: true, label: 'Synthetic provider' });
    codex.run = async () => {};
    codex.stop = async () => codex.emit('done', 'interrupted');
  });
  if (!(await page.getByLabel('Codex request').isVisible()))
    await page.getByRole('button', { name: 'Codex workspace agent', exact: true }).click();
  await page.getByRole('button', { name: 'Connect / refresh', exact: true }).click();
  await page.getByLabel('Codex request').fill('First');
  await page.getByLabel('Codex request').press('Enter');
  await page.getByLabel('Codex request').fill('Queued');
  await page.getByLabel('Codex request').press('Enter');
  await page.getByTitle('Stop response').click();
  await restart.click();
  await expect(page.locator('.update-notice-message')).toContainText('queued Codex tasks');
  await page.getByRole('button', { name: 'Clear queue' }).click();
  await app.evaluate(() => {
    const store = (globalThis as any).imagineTest.getStore();
    store.originalSave = store.saveBoard;
    store.saveBoard = () => {
      throw new Error('Synthetic disk failure');
    };
  });
  await page.getByRole('button', { name: 'Text card', exact: true }).click();
  await restart.click();
  await expect(page.locator('.update-notice-message')).toContainText('Synthetic disk failure');
  expect(await app.evaluate(() => (globalThis as any).installs)).toBe(0);
  await app.evaluate(() => {
    const store = (globalThis as any).imagineTest.getStore();
    store.saveBoard = store.originalSave;
    (globalThis as any).imagineTest.getJobs().busy = true;
  });
  await restart.click();
  await expect(page.locator('.update-notice-message')).toContainText('ComfyUI');
  await app.evaluate(() => {
    (globalThis as any).imagineTest.getJobs().busy = false;
  });
  await restart.click();
  await expect.poll(() => app.evaluate(() => (globalThis as any).installs)).toBe(1);
  expect(
    await app.evaluate(() =>
      (globalThis as any).savedAtInstall.boards[0].items.some((i: any) => i.type === 'text'),
    ),
  ).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Preparing update' })).toBeVisible();
  // The fake installer does not quit; restore state so teardown can close normally.
  await app.evaluate(() =>
    (globalThis as any).imagineTest
      .getUpdateDriver()
      .emit('error', new Error('Synthetic installer exit')),
  );
});

test('real updater transport rejects a corrupt download and retries a verified local fixture', async () => {
  // Deliberately inert bytes: only the real feed/downloader run, never an installer.
  const bytes = Buffer.alloc(16_384, 7);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  let corrupt = true,
    downloads = 0;
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/latest.yml')) {
      res.end(
        JSON.stringify({
        version: nextVersion,
          files: [{ url: 'fixture.exe', sha512, size: bytes.length }],
          path: 'fixture.exe',
          sha512,
          releaseDate: '2026-10-07T00:00:00.000Z',
        }),
      );
    } else if (req.url?.startsWith('/fixture.exe')) {
      downloads++;
      res.setHeader('Content-Length', bytes.length);
      res.end(corrupt ? Buffer.alloc(bytes.length, 8) : bytes);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const config = path.join(folder, 'app-update.yml');
    await fs.writeFile(
      config,
      JSON.stringify({
        provider: 'generic',
        url: `http://127.0.0.1:${address.port}`,
        updaterCacheDirName: 'cache',
      }),
    );
    await app.evaluate(
      async (_, { config, folder }) => {
        const t = (globalThis as any).imagineTest,
          driver = t.getUpdateDriver();
        t.getUpdater().enabled = true;
        driver.forceDevUpdateConfig = true;
        driver.updateConfigPath = config;
        driver.disableDifferentialDownload = true;
        Object.defineProperty(driver.app, 'baseCachePath', { value: folder });
        driver.quitAndInstall = () => {
          throw new Error('Never install test bytes');
        };
        await t.getUpdater().check();
      },
      { config, folder },
    );
    const available = page.getByRole('button', { name: 'Update available', exact: true });
    await expect(available).toBeVisible();
    expect(downloads).toBe(0);
    await available.click();
    await expect(page.locator('.update-notice-message')).toContainText('Download failed');
    corrupt = false;
    await available.click();
    await expect(
      page.getByRole('button', { name: 'Restart to update', exact: true }),
    ).toBeVisible();
    expect(downloads).toBe(2);
    expect(await fs.readFile(path.join(folder, 'cache', 'pending', 'fixture.exe'))).toEqual(bytes);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
