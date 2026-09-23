import { expect, it } from 'vitest';
import { emptyLibrary, validateLibrary } from '../shared/library';
import { dropIntoGroup } from '../shared/group-drop';
import { absolutePosition } from '../shared/board';
import type { CanvasItem } from '../shared/types';

it('accepts legacy empty libraries and validates persistent character references', () => {
  expect(validateLibrary(emptyLibrary(), [])).toEqual(emptyLibrary());
  const library = {
    folders: [{ id: 'f', name: 'Cast' }],
    assetFolders: { a: 'f' },
    characters: [{ id: 'c', name: 'Hero', description: 'Blue coat', assetIds: ['a'] }],
  };
  expect(validateLibrary(library, ['a'])).toEqual(library);
  expect(() => validateLibrary(library, [])).toThrow('Unknown asset');
  expect(() =>
    validateLibrary({ ...library, folders: [{ id: 'f', name: 'Cast', parentId: 'f' }] }, ['a']),
  ).toThrow('hierarchy');
  expect(() =>
    validateLibrary({ ...library, characters: [{ ...library.characters[0], assetIds: [] }] }, [
      'a',
    ]),
  ).toThrow('1–5');
});
const item = (
  id: string,
  type: CanvasItem['type'],
  x: number,
  y: number,
  width = 100,
  height = 100,
  parentId?: string,
): CanvasItem => ({ id, type, position: { x, y }, width, height, parentId, data: {} });

it('reparents before rendering and grows groups without moving existing or dropped contents', () => {
  const items = [
    item('a', 'image', 80, 90),
    item('g', 'group', 100, 100, 200, 200),
    item('child', 'image', 50, 50, 50, 50, 'g'),
  ];
  const result = dropIntoGroup(items, ['a'], { x: 110, y: 110 });
  expect(result.find((i) => i.id === 'a')!.parentId).toBe('g');
  expect(result[0].id).toBe('g');
  for (const id of ['a', 'child'])
    expect(
      absolutePosition(
        result.find((i) => i.id === id)!,
        result,
      ),
    ).toEqual(
      absolutePosition(
        items.find((i) => i.id === id)!,
        items,
      ),
    );
  expect(items[0].parentId).toBeUndefined();
});
it('moves rigid roots, prevents cycles, and rejects locked destinations and sources', () => {
  const items = [
    item('g', 'group', 0, 0, 300, 300),
    item('child', 'image', 30, 40, 100, 100, 'g'),
    item('target', 'group', 400, 0, 300, 300),
  ];
  expect(dropIntoGroup(items, ['g'], { x: 60, y: 60 })).toBe(items);
  const result = dropIntoGroup(items, ['child'], { x: 450, y: 50 });
  expect(result.find((i) => i.id === 'g')!.parentId).toBe('target');
  expect(result.find((i) => i.id === 'child')!.parentId).toBe('g');
  items[2].data.locked = true;
  expect(dropIntoGroup(items, ['child'], { x: 450, y: 50 })).toBe(items);
  items[2].data.locked = false;
  items[1].data.locked = true;
  expect(dropIntoGroup(items, ['g'], { x: 450, y: 50 })).toBe(items);
});
it('chooses the inner destination and expands its ancestors preserving world positions', () => {
  const items = [
    item('outer', 'group', 100, 100, 300, 300),
    item('inner', 'group', 30, 40, 100, 100, 'outer'),
    item('a', 'image', 135, 145, 500, 500),
  ];
  const result = dropIntoGroup(items, ['a'], { x: 140, y: 150 });
  expect(result.find((i) => i.id === 'a')!.parentId).toBe('inner');
  expect(
    absolutePosition(
      result.find((i) => i.id === 'a')!,
      result,
    ),
  ).toEqual({ x: 135, y: 145 });
  expect(result.find((i) => i.id === 'outer')!.width).toBeGreaterThan(500);
});
