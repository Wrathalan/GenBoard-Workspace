import type { Library } from './types';

export const emptyLibrary = (): Library => ({ folders: [], assetFolders: {}, characters: [] });

export function validateLibrary(value: Library, assetIds: string[]): Library {
  if (
    !value ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.characters) ||
    !value.assetFolders ||
    typeof value.assetFolders !== 'object' ||
    Array.isArray(value.assetFolders) ||
    value.folders.length > 1000 ||
    value.characters.length > 1000
  )
    throw new Error('Invalid library.');
  const assets = new Set(assetIds),
    ids = new Set<string>();
  for (const entry of [...value.folders, ...value.characters]) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      entry.name.length > 100
    )
      throw new Error('Use unique IDs and names of 1–100 characters.');
    ids.add(entry.id);
  }
  const folders = new Map(value.folders.map((f) => [f.id, f]));
  for (const folder of value.folders) {
    const seen = new Set([folder.id]);
    let parent = folder.parentId;
    while (parent) {
      if (!folders.has(parent) || seen.has(parent)) throw new Error('Invalid folder hierarchy.');
      seen.add(parent);
      parent = folders.get(parent)!.parentId;
    }
  }
  for (const [asset, folder] of Object.entries(value.assetFolders))
    if (!assets.has(asset) || !folders.has(folder)) throw new Error('Unknown asset or folder.');
  for (const c of value.characters)
    if (
      typeof c.description !== 'string' ||
      c.description.length > 10000 ||
      !Array.isArray(c.assetIds) ||
      !c.assetIds.length ||
      c.assetIds.length > 5 ||
      new Set(c.assetIds).size !== c.assetIds.length ||
      c.assetIds.some((id) => !assets.has(id))
    )
      throw new Error(
        'A character needs 1–5 existing reference images and a description under 10,000 characters.',
      );
  return structuredClone(value);
}
