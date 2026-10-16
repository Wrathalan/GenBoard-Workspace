import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
const root = path.resolve('.test-data', `release-showcase-${Date.now()}`, 'Weave release showcase');
await fs.mkdir(root, { recursive: true });
const source = 'docs/screenshots/character-group-inspector.png';
const portraits = [];
for (const [i, left] of [323, 627, 931].entries()) {
  const bytes = await sharp(source)
    .extract({ left, top: 225, width: 275, height: 489 })
    .png()
    .toBuffer();
  portraits.push({
    name: ['Astrid — travel cloak.png', 'Astrid — linen attire.png', 'Astrid — field gear.png'][i],
    bytes: [...bytes],
  });
}
const env = { ...process.env, IMAGINE_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: path.resolve('release/win-unpacked/Weave.exe'),
  env,
});
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1680, 1050));
  await app.evaluate(async (_, folder) => globalThis.imagineTest.openProject(folder, true), root);
  await page.evaluate(() => {
    localStorage.setItem('imagine.chatOpen', 'false');
    localStorage.setItem('imagine.referenceTrayCollapsed', 'false');
    localStorage.setItem('imagine.codexPanelWidth', '360');
  });
  await page.reload();
  await page.evaluate(async (portraits) => {
    const assets = await window.imagine.importImages(
      portraits.map((p) => ({ ...p, bytes: new Uint8Array(p.bytes) })),
    );
    const p = await window.imagine.currentProject();
    const board = p.boards[0];
    board.name = 'Character studies';
    board.viewport = { x: 0, y: 0, zoom: 1 };
    board.items = [
      {
        id: 'title',
        type: 'text',
        position: { x: 100, y: 260 },
        width: 940,
        height: 95,
        data: { text: `ASTRID / CHARACTER STUDIES\nExample artwork · Weave ${version}` },
      },
      ...assets.map((a, i) => ({
        id: 'portrait-' + i,
        type: 'image',
        position: { x: 100 + i * 320, y: 380 },
        width: 280,
        height: 498,
        data: { assetId: a.id },
      })),
    ];
    await window.imagine.saveBoard(board);
    await window.imagine.saveReferences(
      assets.map((a, i) => ({
        id: 'ref-' + i,
        assetId: a.id,
        category: i === 0 ? 'character' : 'attire',
        name: i === 0 ? 'Astrid' : i === 1 ? 'Linen layers' : 'Field gear',
        details:
          i === 0
            ? 'Red hair · blue cloak · character continuity'
            : 'Costume reference for the same character.',
      })),
    );
    await window.imagine.createBoard('Environment');
    await window.imagine.createBoard('Story notes');
  }, portraits);
  await page.reload();
  await page.getByRole('tab', { name: 'Character studies', exact: true }).click();
  await expect(page.locator('.image-node')).toHaveCount(3);
  await page.screenshot({ path: 'docs/screenshots/release-workspace.png' });
  await page.getByRole('button', { name: 'Codex workspace agent', exact: true }).click();
  await app.evaluate(() => {
    const h = globalThis.imagineTest.getCodex();
    h.status = async () => ({ signedIn: true, label: 'Demo account' });
    h.run = async () => {};
  });
  await page.getByRole('button', { name: 'Connect / refresh', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Codex request' })
    .fill('Summarize the costume differences in these reference studies.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    wc.send('codex:event', { type: 'status', text: 'Codex is thinking...' });
  });
  await expect(page.getByLabel('Codex agent panel', { exact: true })).toHaveClass(
    /waiting-response/,
  );
  await page.screenshot({ path: 'docs/screenshots/release-codex-working.png' });
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    wc.send('codex:event', {
      type: 'text',
      itemId: 'demo',
      text: 'Example response: the travel cloak, linen layers, and field gear give Astrid three distinct silhouettes while keeping her character reference consistent.',
    });
    wc.send('codex:event', { type: 'done', text: 'Completed' });
  });
  await expect(page.getByLabel('Codex agent panel', { exact: true })).toHaveClass(/reply-ready/);
  await page.screenshot({ path: 'docs/screenshots/release-codex-ready.png' });
  await page.getByRole('button', { name: 'Close Codex', exact: true }).click();
  await page.getByRole('button', { name: 'Workspace browser', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Import Chrome', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/release-browser.png' });
  console.log('Captured four fresh Weave 0.4.5 screenshots. Codex states are a controlled demo.');
} finally {
  await app.close();
}
