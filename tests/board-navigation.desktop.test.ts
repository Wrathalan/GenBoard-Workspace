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
const trigger = () => page.getByRole('button', { name: /^Switch board:/ });
const previous = () => page.getByRole('button', { name: 'Previous board', exact: true });
async function nameDialog(mode: 'create' | 'rename') {
  await trigger().click();
  await page
    .getByRole('button', {
      name: mode === 'create' ? 'New board' : 'Rename current board',
      exact: true,
    })
    .click();
  return page.getByRole('dialog', {
    name: mode === 'create' ? 'New board' : 'Rename board',
    exact: true,
  });
}
async function create(name: string) {
  const dialog = await nameDialog('create');
  await dialog.getByRole('textbox', { name: 'Board name' }).fill(name);
  await dialog.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger()).toContainText(name.trim());
}
test.beforeEach(async () => {
  folder = path.resolve('.test-data', `navigation-${Date.now()}`);
  await fs.mkdir(folder, { recursive: true });
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    IMAGINE_TEST: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  page.on('pageerror', (error) => console.log('Renderer error:', error.message));
  await app.evaluate(
    async (_, folder) => (globalThis as any).imagineTest.openProject(folder, true),
    folder,
  );
  await page.evaluate(() => localStorage.setItem('imagine.chatOpen', 'false'));
  await page.reload();
  await expect(trigger()).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
});

test('search, naming, focus, shortcuts, undo history, and narrow layouts', async () => {
  await expect(previous()).toBeDisabled();
  await page.getByRole('button', { name: 'Text card', exact: true }).click();
  let dialog = await nameDialog('rename');
  await dialog.getByRole('textbox').fill('  Reference studies  ');
  await dialog.getByRole('textbox').press('Enter');
  await expect(trigger()).toContainText('Reference studies');
  await expect(dialog).toHaveCount(0);
  await expect(trigger()).toContainText('Reference studies');
  await expect(trigger()).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.text-node')).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.text-node')).toHaveCount(1);
  await page.getByTitle('Inspector', { exact: true }).click();
  await expect(page.getByLabel('Board name', { exact: true })).toHaveValue('Reference studies');
  await page.getByTitle('Close inspector').click();
  dialog = await nameDialog('create');
  expect(
    await dialog
      .getByRole('textbox')
      .evaluate((e: HTMLInputElement) => e.value.slice(e.selectionStart!, e.selectionEnd!)),
  ).toBe('Board 2');
  await dialog.getByRole('textbox').fill('   ');
  await expect(dialog.getByRole('button', { name: 'Create board', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await page.evaluate(() => window.imagine.currentProject()))!.boards).toHaveLength(1);
  await create('Color studies');
  await trigger().focus();
  await page.keyboard.press('Control+Shift+b');
  const search = page.getByRole('combobox', { name: 'Search boards' });
  await expect(search).toBeFocused();
  await search.fill('REFerence');
  await expect(page.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(trigger()).toContainText('Reference studies');
  await trigger().click();
  await expect(search).toHaveValue('');
  await search.fill('no matches');
  await expect(page.getByText('No matching boards', { exact: true })).toBeVisible();
  await search.press('Tab');
  await expect(page.getByRole('button', { name: 'New board', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Rename current board' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(search).toHaveCount(0);
  await trigger().click();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(trigger()).toContainText('Color studies');
  await previous().click();
  await expect(trigger()).toContainText('Reference studies');
  await previous().click();
  await expect(trigger()).toContainText('Color studies');
  dialog = await nameDialog('rename');
  await dialog.getByRole('textbox').fill('Long board '.repeat(9));
  await dialog.getByRole('textbox').press('Enter');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 900, height: 620 });
  await trigger().click();
  const box = await page.getByRole('dialog', { name: 'Switch board', exact: true }).boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(900);
  expect(box!.y).toBeGreaterThanOrEqual(40);
  expect(box!.y + box!.height).toBeLessThanOrEqual(620);
  expect((await trigger().boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: 'test-results/board-navigation.png' });
  await page.mouse.click(650, 500);
  await expect(search).toHaveCount(0);
  await page.reload();
  await expect(trigger()).toContainText('Long board');
  await expect(previous()).toBeDisabled();
});

test('save failures retain names and edits; switching restores saved viewport and project history resets', async () => {
  await create('Second');
  await page.getByRole('button', { name: 'Text card', exact: true }).click();
  await page.getByTitle('Zoom in', { exact: true }).click();
  await expect(page.locator('.zoom-value')).not.toHaveText('100%');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  const before = await page.evaluate(() => window.imagine.currentProject());
  const saved = before!.boards.find((b) => b.id === before!.activeBoardId)!;
  await app.evaluate(() => {
    const store = (globalThis as any).imagineTest.getStore();
    store.originalSave = store.saveBoard;
    store.saveBoard = () => {
      throw new Error('Synthetic disk failure');
    };
  });
  const dialog = await nameDialog('rename');
  await dialog.getByRole('textbox').fill('Renamed second');
  await dialog.getByRole('button', { name: 'Save name' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Synthetic disk failure');
  await expect(dialog.getByRole('textbox')).toHaveValue('Renamed second');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await previous().click();
  await expect(page.locator('.board-navigation-error')).toContainText('Synthetic disk failure');
  await expect(trigger()).toContainText('Renamed second');
  await expect(previous()).toHaveAttribute('title', 'Return to Untitled board');
  await expect(page.locator('.text-node')).toHaveCount(1);
  await app.evaluate(() => {
    const store = (globalThis as any).imagineTest.getStore();
    store.saveBoard = store.originalSave;
  });
  await previous().click();
  await expect(trigger()).toContainText('Untitled board');
  await previous().click();
  await expect(trigger()).toContainText('Renamed second');
  await expect(page.locator('.text-node')).toHaveCount(1);
  await expect(page.locator('.zoom-value')).toHaveText(`${Math.round(saved.viewport.zoom * 100)}%`);
  const after = await page.evaluate(() => window.imagine.currentProject());
  expect(after!.boards.find((b) => b.id === saved.id)!.viewport).toEqual(saved.viewport);
  await page.getByRole('button', { name: 'Projects and boards' }).click();
  await expect(page.locator('.board-link').filter({ hasText: 'Renamed second' })).toBeVisible();
  await fs.mkdir(folder + '-other', { recursive: true });
  await app.evaluate(async (_, folder) => {
    await (globalThis as any).imagineTest.openProject(folder + '-other', true);
  }, folder);
  // A real project open through the shared API updates the mounted App without a reload.
  const other = await page.evaluate(() => window.imagine.currentProject());
  const recent = await page.evaluate(
    async (id) => (await window.imagine.recentProjects()).find((p) => p.folder === id),
    other!.folder,
  );
  await page.getByRole('button', { name: 'Close projects' }).click();
  await page.getByRole('button', { name: 'Projects and boards' }).click();
  await page.locator('.recent-projects').getByText(recent!.name, { exact: true }).first().click();
  await expect(previous()).toBeDisabled();
});

test('Codex busy state blocks navigation before writes; transaction failure leaves no board', async () => {
  await create('Second');
  await app.evaluate(() => {
    const codex = (globalThis as any).imagineTest.getCodex();
    codex.setRunning(true);
  });
  await trigger().click();
  await expect(
    page.getByText('Finish or stop the current Codex turn to switch boards.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox').fill('Untitled');
  await expect(page.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'New board', exact: true })).toBeDisabled();
  await expect(previous()).toBeDisabled();
  await expect(
    page.evaluate(() => window.imagine.createAndActivateBoard('Blocked')),
  ).rejects.toThrow('Finish or stop');
  expect((await page.evaluate(() => window.imagine.currentProject()))!.boards).toHaveLength(2);
  await page.reload();
  await trigger().click();
  await expect(page.getByRole('button', { name: 'New board', exact: true })).toBeDisabled();
  await app.evaluate(() => {
    const codex = (globalThis as any).imagineTest.getCodex();
    codex.setRunning(false);
    codex.emit('done', 'Completed');
  });
  await expect(page.getByRole('button', { name: 'New board', exact: true })).toBeEnabled();
  await page.getByRole('option', { name: 'Untitled board', exact: true }).click();
  await expect(trigger()).toContainText('Untitled board');
  await app.evaluate(() => {
    const store = (globalThis as any).imagineTest.getStore();
    store.originalSetting = store.setting;
    store.setting = function (key: string, value: string) {
      if (key === 'activeBoardId') throw new Error('Synthetic activation failure');
      return this.originalSetting(key, value);
    };
  });
  const dialog = await nameDialog('create');
  await dialog.getByRole('textbox').fill('Try again');
  await dialog.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Synthetic activation failure');
  expect((await page.evaluate(() => window.imagine.currentProject()))!.boards).toHaveLength(2);
  await expect(dialog.getByRole('textbox')).toHaveValue('Try again');
  await app.evaluate(() => {
    const store = (globalThis as any).imagineTest.getStore();
    store.setting = store.originalSetting;
  });
  await dialog.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger()).toContainText('Try again');
});

test('rapid submissions create once and long board lists scroll without moving the header', async () => {
  const dialog = await nameDialog('create');
  await dialog.getByRole('textbox').fill('Only once');
  await dialog.locator('form').evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(dialog).toHaveCount(0);
  expect((await page.evaluate(() => window.imagine.currentProject()))!.boards).toHaveLength(2);
  await page.evaluate(async () => {
    for (let i = 1; i <= 24; i++) await window.imagine.createBoard(`Study ${i}`);
  });
  await page.reload();
  await page.setViewportSize({ width: 900, height: 620 });
  await trigger().click();
  const search = page.getByRole('combobox');
  for (let i = 0; i < 25; i++) await search.press('ArrowDown');
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    (await page
      .getByRole('option', { name: 'Study 24', exact: true })
      .getAttribute('id')) as string,
  );
  expect((await trigger().boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await page.locator('.board-switcher-list').evaluate((e) => e.scrollTop)).toBeGreaterThan(
    0,
  );
  await search.press('Enter');
  await expect(trigger()).toContainText('Study 24');
});
