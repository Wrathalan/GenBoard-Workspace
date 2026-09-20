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
  await page.getByTitle('Close generation').click();
  await page.locator('.text-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit text', exact: true }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/context-menu.png' });
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await page.keyboard.press('Control+s');
  if ((await page.evaluate(() => window.imagine.currentProject())).boards[0].items.length !== 2)
    throw new Error('Packaged context action failed');
  if (!(await page.getByRole('complementary', { name: 'Codex agent panel' }).isVisible()))
    await page.getByRole('button', { name: 'Codex workspace agent', exact: true }).click();
  await page.getByRole('button', { name: 'Sign into Codex', exact: true }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/codex.png' });
  if (
    !(await page.evaluate(() => window.imagine.recentProjects())).some((r) => r.folder === folder)
  )
    throw new Error('Packaged recent-project cache failed');
  if (await page.getByRole('complementary', { name: 'Codex agent panel' }).isVisible())
    await page.getByRole('button', { name: 'Close Codex', exact: true }).click();
  await page.locator('.react-flow__node.selected .text-node').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Mark as sensitive', exact: true }).click();
  await page.locator('.spoiler-node').first().waitFor();
  await page.getByRole('button', { name: 'Copy safe screenshot', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Safe canvas screenshot copied' }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/spoilers.png' });
  await page.getByRole('button', { name: 'Customize colors', exact: true }).click();
  const colors = page.getByRole('dialog', { name: 'Customize colors' });
  await colors.getByLabel('Color theme', { exact: true }).selectOption('Paper light');
  if ((await page.evaluate(() => document.documentElement.style.colorScheme)) !== 'light')
    throw new Error('Light theme color scheme failed');
  await page.screenshot({ path: 'docs/screenshots/theme-light.png' });
  await colors.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.spoiler-node').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Customize item colors', exact: true }).click();
  await page.getByLabel('Item sensitive cover', { exact: true }).fill('#203040');
  if (
    (await page
      .locator('.spoiler-node')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)) !== 'rgb(32, 48, 64)'
  )
    throw new Error('Packaged item color override failed');
  await page.getByTitle('Close inspector', { exact: true }).click();
  await page.getByRole('button', { name: 'Customize colors', exact: true }).click();
  await colors.getByRole('button', { name: 'Reset colors', exact: true }).click();
  await colors.getByRole('button', { name: 'Done', exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+g');
  await page.keyboard.press('Control+s');
  const groupedBefore = (await page.evaluate(() => window.imagine.currentProject())).boards[0]
    .items;
  const group = groupedBefore.find((i) => i.type === 'group');
  if (!group) throw new Error('Packaged grouping failed');
  const member = await page.locator('.spoiler-node').first().boundingBox();
  await page.mouse.move(member.x + 40, member.y + 40);
  await page.mouse.down();
  await page.mouse.move(member.x + 112, member.y + 88, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('Control+s');
  const groupedAfter = (await page.evaluate(() => window.imagine.currentProject())).boards[0].items;
  if (
    JSON.stringify(groupedAfter.find((i) => i.id === group.id).position) ===
    JSON.stringify(group.position)
  )
    throw new Error('Dragging a member did not move the group');
  for (const original of groupedBefore.filter((i) => i.parentId))
    if (
      JSON.stringify(groupedAfter.find((i) => i.id === original.id).position) !==
      JSON.stringify(original.position)
    )
      throw new Error('Grouped member offsets changed');
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
          'Recent project cache',
          'Native Sharp thumbnail import',
          'Text editing and autosave',
          'Generation panel',
          'Codex panel and sign-in entry point',
          'Right-click context menu and duplicate action',
          'Sensitive marking and safe screenshot clipboard capture',
          'Light theme and per-item sensitive cover override',
          'Rigid movement from a grouped member',
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
