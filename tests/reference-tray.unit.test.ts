import { describe, expect, it } from 'vitest';
import { migrateReferences, validateReferences } from '../shared/reference-tray';
import type { Asset, Board } from '../shared/types';

const asset = { id: 'hero', name: 'Hero.png' } as Asset;
const board = (references: Board['references']): Board => ({
  id: 'board', name: 'Board', items: [], viewport: { x: 0, y: 0, zoom: 1 }, references,
});

describe('shared project reference objects', () => {
  it('combines legacy board references, deduplicates per category, and drops missing images', () => {
    const references = migrateReferences([
      board({ character: ['hero', 'missing'] }),
      board({ character: ['hero'], attire: ['hero'] }),
    ], [asset]);
    expect(references).toEqual([
      { id: 'character:hero', category: 'character', assetId: 'hero', name: 'Hero.png', details: '' },
      { id: 'attire:hero', category: 'attire', assetId: 'hero', name: 'Hero.png', details: '' },
    ]);
  });

  it('preserves object details and rejects invalid or duplicate references', () => {
    const references = migrateReferences([board({ character: ['hero'] })], [asset]);
    references[0].details = 'White hair and amber eyes';
    expect(validateReferences(references, [asset])).toEqual(references);
    expect(() => validateReferences([...references, ...references], [asset])).toThrow();
    expect(() => validateReferences([{ ...references[0], assetId: 'missing' }], [asset])).toThrow();
    expect(() => validateReferences([{ ...references[0], name: ' ' }], [asset])).toThrow();
  });
});
