import { clipboard, ClipboardItem, dialog, nativeImage, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { contained, ProjectStore } from './project';
import type { Asset } from '../shared/types';

function resolveAsset(store: ProjectStore, assetId: string) {
  if (typeof assetId !== 'string') throw new Error('Invalid asset ID.');
  const asset = store.list<Asset>('assets').find((a) => a.id === assetId);
  if (!asset) throw new Error('Image is no longer available in this project.');
  const file = contained(store.folder, asset.path);
  if (!fs.statSync(file).isFile()) throw new Error('Original image is missing.');
  return { asset, file };
}
export function assetDragItem(store: ProjectStore, ids: string[]): Electron.Item {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500)
    throw new Error('Select between 1 and 500 images to attach.');
  const assets = [...new Set(ids)].map((id) => resolveAsset(store, id));
  const icon = nativeImage.createFromPath(contained(store.folder, assets[0].asset.thumbnail));
  return {
    file: assets[0].file,
    files: assets.map(({ file }) => file),
    icon: icon.isEmpty()
      ? nativeImage.createFromPath(assets[0].file).resize({ width: 64 })
      : icon.resize({ width: 64 }),
  };
}
export function validateExportDestination(destination: string, store: ProjectStore) {
  let existing = path.resolve(destination);
  const suffix: string[] = [];
  while (!fs.existsSync(existing)) {
    suffix.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error('Export location is unavailable.');
    existing = parent;
  }
  const resolved = path.join(fs.realpathSync(existing), ...suffix);
  const root = fs.realpathSync(store.folder).toLowerCase();
  if (resolved.toLowerCase() === root || resolved.toLowerCase().startsWith(root + path.sep))
    throw new Error('Choose an export location outside the project folder.');
  for (let dir = path.dirname(resolved); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'workspace.sqlite')))
      throw new Error('Export cannot overwrite files inside a Weave project.');
    if (dir === path.dirname(dir)) break;
  }
  if (fs.existsSync(resolved)) {
    const target = fs.statSync(resolved);
    if (!target.isFile()) throw new Error('Choose a file destination.');
    const managed = [
      'workspace.sqlite',
      'workspace.sqlite-wal',
      'workspace.sqlite-shm',
      '.imagine.lock',
      ...fs.readdirSync(contained(store.folder, 'workflows')).map((name) => `workflows/${name}`),
      ...store.list<Asset>('assets').flatMap((a) => [a.path, a.thumbnail]),
    ];
    for (const relative of managed) {
      const file = contained(store.folder, relative);
      if (!fs.existsSync(file)) continue;
      const stat = fs.statSync(file);
      if (target.dev === stat.dev && target.ino === stat.ino)
        throw new Error('Export cannot overwrite a project-managed file.');
    }
  }
  return resolved;
}
export async function copyAssetImage(store: ProjectStore, assetId: string) {
  const { file } = resolveAsset(store, assetId);
  const png = await sharp(file).rotate().png().toBuffer();
  await clipboard.write([
    new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) }),
  ]);
}
export async function exportAsset(
  store: ProjectStore,
  win: BrowserWindow,
  assetId: string,
): Promise<boolean> {
  const { asset, file } = resolveAsset(store, assetId);
  const ext = path.extname(file).slice(1);
  const basename =
    path
      .basename(asset.name, path.extname(asset.name))
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/[. ]+$/, '') || 'image';
  const result = await dialog.showSaveDialog(win, {
    title: 'Save original image',
    defaultPath: `${basename}.${ext}`,
    filters: [{ name: `${ext.toUpperCase()} image`, extensions: [ext] }],
    properties: ['showOverwriteConfirmation'],
  });
  if (result.canceled || !result.filePath) return false;
  const destination = validateExportDestination(result.filePath, store);
  if (
    path.extname(destination).toLowerCase() !== `.${ext}` &&
    !(ext === 'jpg' && path.extname(destination).toLowerCase() === '.jpeg')
  )
    throw new Error(`Keep the original .${ext} extension when exporting.`);
  await fs.promises.copyFile(file, destination);
  return true;
}
export function revealAsset(store: ProjectStore, assetId: string) {
  shell.showItemInFolder(resolveAsset(store, assetId).file);
}
