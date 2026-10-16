import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';

let app: ElectronApplication, page: Page, server: http.Server, url: string, folder: string;
test.beforeEach(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<title>Attachment fixture ${req.url}</title>
      <style>body{font:18px sans-serif;background:#f7f6f2;padding:30px}#drop{border:2px dashed #555;padding:70px;margin-top:30px}</style>
      <h1>Browser attachment test</h1><a href="/second">Second page</a> <a href="/popup" target="_blank">Open link</a>
      <div id="drop">Drop workspace images here</div><pre id="result"></pre>
      <script>document.addEventListener('dragover', e => e.preventDefault());
      document.addEventListener('drop', async e => {e.preventDefault();
        window.received = await Promise.all([...e.dataTransfer.files].map(async f => ({name:f.name, type:f.type, bytes:[...new Uint8Array(await f.arrayBuffer())]})));
        document.querySelector('#result').textContent = window.received.map(f => f.name + ' — ' + f.bytes.length + ' bytes').join('\\n');
      });</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`;
  folder = path.resolve('.test-data', `embedded-browser-${Date.now()}`);
  await fs.mkdir(folder, { recursive: true });
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
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
  await page.evaluate(() => localStorage.setItem('imagine.referenceTrayCollapsed', 'true'));
  await page.reload();
  await page.getByRole('button', { name: 'Workspace browser', exact: true }).click();
  await page.getByLabel('Website address').fill(url);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(
    page.getByLabel('Workspace browser', { exact: true }).filter({ hasText: 'Attachment fixture' }),
  ).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});
async function guest() {
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .find((p) => p.url().startsWith(url))
        ?.url(),
    )
    .toBeTruthy();
  return app
    .context()
    .pages()
    .find((p) => p.url().startsWith(url))!;
}

test('panel widths persist, browser bounds follow resizing, and replies show attention', async () => {
  if (!(await page.getByLabel('Codex agent panel', { exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Codex workspace agent', exact: true }).click();
  const handle = page.getByRole('separator', { name: 'Resize Codex panel' });
  await handle.focus();
  const before = Number(await handle.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', String(before + 20));
  const browserHandle = page.getByRole('separator', { name: 'Resize browser panel' });
  const drag = (await browserHandle.boundingBox())!;
  const browserBefore = Number(await browserHandle.getAttribute('aria-valuenow'));
  await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
  await page.mouse.down();
  await page.mouse.move(drag.x + drag.width / 2 + 30, drag.y + drag.height / 2, { steps: 6 });
  await page.mouse.up();
  expect(Number(await browserHandle.getAttribute('aria-valuenow'))).toBeLessThan(browserBefore);
  await browserHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => {
    const expected = await page.locator('.browser-surface').boundingBox();
    const actual = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds());
    return Math.abs(expected!.width - actual.width) + Math.abs(expected!.x - actual.x);
  }).toBeLessThan(3);
  const saved = await handle.getAttribute('aria-valuenow');
  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', saved!);
  await app.evaluate(() => {
    const harness = (globalThis as any).imagineTest.getCodex();
    harness.status = async () => ({ signedIn: true, label: 'Test account' });
    harness.run = async () => {};
  });
  await page.getByRole('button', { name: 'Connect / refresh', exact: true }).click();
  const panel = page.getByLabel('Codex agent panel', { exact: true });
  const normalColor = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByRole('textbox', { name: 'Codex request' }).fill('Test waiting state');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel).toHaveClass(/waiting-response/);
  expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(normalColor);
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    wc.send('codex:event', { type: 'status', text: 'Codex is thinking...' });
    wc.send('codex:event', { type: 'timing', text: '', setupMs: 120, firstActivityMs: 750 });
  });
  await expect(page.locator('.chat-thinking')).toContainText('Codex is thinking...');
  await expect(page.getByLabel('Response timing')).toContainText('Setup 0.1s · First activity 0.8s');
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    for (let i = 0; i < 150; i++) wc.send('codex:event', { type: 'text', itemId: 'stream-test', text: 'x' });
    wc.send('codex:event', { type: 'done', text: 'Completed' });
  });
  await expect(page.getByLabel('Codex message', { exact: true })).toContainText('x'.repeat(150));
  await expect(page.getByLabel('Codex agent panel', { exact: true })).toHaveClass(/reply-ready/);
  await expect(page.getByText('— Your turn', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.test-data/qol-panels.png' });
});

test('imports Chrome bookmarks and persists them without navigating automatically', async () => {
  const profile = path.join(folder, 'chrome-profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'Bookmarks'), JSON.stringify({ roots: { bookmark_bar: { children: [
    { type: 'url', name: 'Imported fixture', url: url + 'imported' },
    { type: 'url', name: 'Unsafe', url: 'file:///C:/private.txt' },
  ] } } }));
  const history = new DatabaseSync(path.join(profile, 'History'));
  history.exec('CREATE TABLE urls (url TEXT, title TEXT, last_visit_time INTEGER)');
  history.prepare('INSERT INTO urls VALUES (?, ?, ?)').run(url + 'history', 'Chrome history fixture', 1);
  history.close();
  await app.evaluate(({ dialog }, profile) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [profile] })) as any;
  }, profile);
  await page.getByRole('button', { name: 'Import Chrome', exact: true }).click();
  await expect(page.getByLabel('Imported bookmarks and history')).toContainText('Imported fixture');
  await expect(page.getByLabel('Imported bookmarks and history')).toContainText('Chrome history fixture');
  expect((await guest()).url()).toBe(url);
  await page.getByLabel('Imported bookmarks and history').selectOption(url + 'imported');
  await expect(page.getByLabel('Website address')).toHaveValue(url + 'imported');
  await page.getByLabel('Close browser', { exact: true }).click();
  await page.getByRole('button', { name: 'Workspace browser', exact: true }).click();
  await expect(page.getByLabel('Imported bookmarks and history')).toContainText('Imported fixture');
});

test('imports Firefox bookmarks and history from places.sqlite', async () => {
  const profile = path.join(folder, 'firefox-profile');
  await fs.mkdir(profile);
  const places = new DatabaseSync(path.join(profile, 'places.sqlite'));
  places.exec('CREATE TABLE moz_places (id INTEGER, url TEXT, title TEXT, last_visit_date INTEGER); CREATE TABLE moz_bookmarks (fk INTEGER, title TEXT, type INTEGER)');
  places.prepare('INSERT INTO moz_places VALUES (?, ?, ?, ?)').run(1, url + 'firefox', 'Firefox history fixture', 1);
  places.prepare('INSERT INTO moz_bookmarks VALUES (?, ?, ?)').run(1, 'Firefox bookmark fixture', 1);
  places.close();
  await app.evaluate(({ dialog }, profile) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [profile] })) as any;
  }, profile);
  await page.getByRole('button', { name: 'Import Firefox', exact: true }).click();
  await expect(page.getByLabel('Imported bookmarks and history')).toContainText('Firefox bookmark fixture');
  await expect(page.getByLabel('Imported bookmarks and history')).toContainText('Firefox history fixture');
});

test('browser navigation, session isolation, layout, modal visibility, and reopen', async () => {
  const browser = await guest();
  expect(
    await browser.evaluate(() => ({
      node: typeof (window as any).require,
      bridge: typeof window.imagine,
    })),
  ).toEqual({ node: 'undefined', bridge: 'undefined' });
  expect(
    await app.evaluate(({ webContents }) => {
      const main = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith('file:'))!;
      const child = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith('http:'))!;
      return child.session !== main.session;
    }),
  ).toBe(true);
  await browser.getByText('Second page').click();
  await expect(page.getByLabel('Website address')).toHaveValue(url + 'second');
  await page.getByLabel('Browser back').click();
  await expect(page.getByLabel('Website address')).toHaveValue(url);
  await page.getByLabel('Browser forward').click();
  await expect(page.getByLabel('Website address')).toHaveValue(url + 'second');
  await browser.getByText('Open link').click();
  await expect(page.getByLabel('Website address')).toHaveValue(url + 'popup');
  await page.getByLabel('Website address').fill('file:///C:/Windows/win.ini');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP or HTTPS');
  expect(browser.url()).toBe(url + 'popup');
  const visible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].contentView.children[0]?.getVisible(),
    );
  await expect.poll(visible).toBe(true);
  await page.getByRole('button', { name: /^Switch board:/ }).click();
  await expect.poll(visible).toBe(false);
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New board', exact: true })).toBeVisible();
  await expect.poll(visible).toBe(false);
  await page.keyboard.press('Escape');
  await expect.poll(visible).toBe(true);
  await page.getByRole('button', { name: 'Customize colors', exact: true }).click();
  await expect.poll(visible).toBe(false);
  await page.keyboard.press('Escape');
  await expect.poll(visible).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 750));
  await expect
    .poll(async () => {
      const expected = await page.locator('.browser-surface').boundingBox();
      const actual = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds(),
      );
      return Math.abs(actual.width - expected!.width) + Math.abs(actual.x - expected!.x);
    })
    .toBeLessThan(3);
  await page.getByLabel('Close browser', { exact: true }).click();
  await expect.poll(visible).toBe(false);
  await page.getByRole('button', { name: 'Workspace browser', exact: true }).click();
  await expect(page.getByLabel('Website address')).toHaveValue(url + 'popup');
  await expect.poll(visible).toBe(true);
});

test('canvas and library expose original file drags that a website receives intact', async () => {
  const originals = await Promise.all(
    ['#347abc', '#dc8123'].map(async (background) => [
      ...(await sharp({ create: { width: 80, height: 60, channels: 4, background } })
        .png()
        .toBuffer()),
    ]),
  );
  const assets = await page.evaluate(async (originals) => {
    const assets = await window.imagine.importImages(
      originals.map((bytes, i) => ({ name: `reference-${i}.png`, bytes: new Uint8Array(bytes) })),
    );
    const project = (await window.imagine.currentProject())!;
    const board = project.boards[0];
    board.viewport = { x: 0, y: 0, zoom: 1 };
    board.items = assets.map((asset, i) => ({
      id: `image-${i}`,
      type: 'image',
      position: { x: 100 + i * 200, y: 200 },
      width: 160,
      height: 120,
      data: { assetId: asset.id },
    }));
    await window.imagine.saveBoard(board);
    return assets;
  }, originals);
  await page.reload();
  await page.getByRole('button', { name: 'Workspace browser', exact: true }).click();
  const browser = await guest();
  // Capture the real native drag payload without entering Windows' blocking OLE drag loop.
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    wc.startDrag = (item) => {
      (globalThis as any).capturedDrag = {
        files: item.files,
        iconEmpty: typeof item.icon === 'string' || item.icon.isEmpty(),
      };
    };
  });
  await page
    .getByLabel('Drag image to browser', { exact: true })
    .first()
    .dispatchEvent('dragstart');
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).capturedDrag?.files?.length))
    .toBe(1);
  await page.getByLabel('Projects and boards').click();
  for (let i = 0; i < 2; i++) await page.getByLabel(`Select reference reference-${i}.png`).check();
  await page.getByLabel('Drag 2 images to browser').first().dispatchEvent('dragstart');
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).capturedDrag?.files?.length))
    .toBe(2);
  const drag = await app.evaluate(
    () => (globalThis as any).capturedDrag as { files: string[]; iconEmpty: boolean },
  );
  expect(drag.iconEmpty).toBe(false);
  expect(drag.files).toEqual(assets.map((a) => path.join(folder, a.path)));
  // Deliver the captured native files through Chromium's drag protocol to a real page.
  const cdp = await app.context().newCDPSession(browser);
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const)
    await cdp.send('Input.dispatchDragEvent', {
      type,
      x: 100,
      y: 210,
      data: { items: [], files: drag.files, dragOperationsMask: 1 },
    });
  await expect.poll(() => browser.evaluate(() => (window as any).received?.length)).toBe(2);
  const received = await browser.evaluate(
    () => (window as any).received as { bytes: number[]; type: string }[],
  );
  expect(received.map((file) => file.bytes)).toEqual(originals);
  expect(received.map((file) => file.type)).toEqual(['image/png', 'image/png']);
  await page.evaluate(() => window.imagine.startAssetDrag!(['missing-id']));
  await expect(page.getByText('Image is no longer available in this project.')).toBeVisible();
  expect(
    (await page.evaluate(() => window.imagine.currentProject()))!.boards[0].items,
  ).toHaveLength(2);
  await page.screenshot({ path: path.join(folder, 'embedded-browser.png') });
});
