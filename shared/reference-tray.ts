import type { Asset, Board, ReferenceObject } from './types';

export function migrateReferences(boards: Board[], assets: Asset[]): ReferenceObject[] {
  const references = new Map<string, ReferenceObject>();
  for (const board of boards) {
    for (const category of ['character', 'attire', 'environment'] as const) {
      for (const assetId of board.references?.[category] || []) {
        const asset = assets.find((a) => a.id === assetId);
        const id = `${category}:${assetId}`;
        if (asset && !references.has(id))
          references.set(id, { id, category, assetId, name: asset.name.slice(0, 200), details: '' });
      }
    }
  }
  return [...references.values()];
}

export function validateReferences(value: ReferenceObject[], assets: Asset[]): ReferenceObject[] {
  const known = new Set(assets.map((a) => a.id));
  const ids = new Set<string>();
  const pairs = new Set<string>();
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Invalid reference list.');
  for (const reference of value) {
    if (!reference || typeof reference.id !== 'string' || !reference.id || ids.has(reference.id) ||
      !['character', 'attire', 'environment'].includes(reference.category) ||
      !known.has(reference.assetId) || typeof reference.name !== 'string' ||
      !reference.name.trim() || reference.name.length > 200 ||
      typeof reference.details !== 'string' || reference.details.length > 10000 ||
      pairs.has(`${reference.category}:${reference.assetId}`))
      throw new Error('References need a unique image, name, and valid details.');
    ids.add(reference.id);
    pairs.add(`${reference.category}:${reference.assetId}`);
  }
  return structuredClone(value);
}
