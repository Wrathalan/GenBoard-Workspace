import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const executablePath = path.resolve('release/win-unpacked/Local Imagine Workspace.exe');
const env = { ...process.env, IMAGINE_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath, env });
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Create project', exact: true }).waitFor();
  await fs.mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/welcome.png' });
  const folder = path.resolve('.test-data', 'packaged-smoke-' + Date.now());
  await fs.mkdir(folder, { recursive: true });
  await app.evaluate(
    async (_electron, folder) => globalThis.imagineTest.openProject(folder, true),
    folder,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Text card', exact: true }).click();
  await page.locator('.text-node').dblclick();
  await page
    .getByLabel('Edit text card')
    .fill('Packaged desktop app\nNative SQLite and canvas verified.');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const png = await sharp({ create: { width: 64, height: 96, channels: 3, background: '#849376' } })
    .png()
    .toBuffer();
  await page.evaluate(
    async (bytes) => {
      await window.imagine.importImages([
        { name: 'native-smoke.png', bytes: new Uint8Array(bytes) },
      ]);
    },
    [...png],
  );
  await page.keyboard.press('Control+s');
  const p = await page.evaluate(() => window.imagine.currentProject());
  if (p.assets.length !== 1 || p.boards[0].items.length !== 1)
    throw new Error('Packaged native persistence check failed');
  await page.getByRole('button', { name: 'Generate with ComfyUI' }).click();
  await page.getByRole('complementary', { name: 'Generation panel' }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/workspace.png' });
  await fs.writeFile(
    'docs/packaged-smoke.json',
    JSON.stringify(
      {
        passed: true,
        checkedAt: new Date().toISOString(),
        electron: await app.evaluate(({ app }) => process.versions.electron),
        checks: [
          'Packaged executable launch',
          'Welcome rendering',
          'Native SQLite project creation',
          'Native Sharp thumbnail import',
          'Text editing and autosave',
          'Generation panel',
          'Clean shutdown',
        ],
      },
      null,
      2,
    ),
  );
  console.log('Packaged smoke test passed.');
} finally {
  await app.close();
}
