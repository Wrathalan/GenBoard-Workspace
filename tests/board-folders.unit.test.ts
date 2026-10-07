import { expect, test } from 'vitest';
import { absolutePosition, duplicateItems } from '../shared/board';
import { folderContents, toggleFolder } from '../shared/board-folders';
import { dropIntoGroup } from '../shared/group-drop';
import type { CanvasItem } from '../shared/types';

const item = (id: string, type: CanvasItem['type'], parentId?: string): CanvasItem => ({
  id, type, parentId, position: { x: 100, y: 100 }, width: 500, height: 400,
  data: type === 'group' ? { folder: true, label: id } : {},
});

test('collapse preserves layout, recursively hides descendants, and restores exact bounds', () => {
  const original = [item('outer', 'group'), item('inner', 'group', 'outer'), item('note', 'text', 'inner'), item('other', 'text')];
  const collapsed = toggleFolder(original, 'outer');
  expect(folderContents(collapsed).hidden).toEqual(new Set(['inner', 'note']));
  expect(collapsed[0].width).toBe(240);
  expect(absolutePosition(collapsed[2], collapsed)).toEqual(absolutePosition(original[2], original));
  expect(toggleFolder(collapsed, 'outer')[0]).toMatchObject({ width: 500, height: 400, data: { collapsed: false } });
  const nested = toggleFolder(collapsed, 'inner');
  expect(folderContents(toggleFolder(nested, 'outer')).hidden).toEqual(new Set(['note']));
});

test('dropping into a collapsed folder keeps its compact size and preserves world positions', () => {
  const original = toggleFolder([item('folder', 'group'), { ...item('note', 'text'), position: { x: 150, y: 150 } }], 'folder');
  const next = dropIntoGroup(original, ['note'], { x: 160, y: 160 });
  const note = next.find((i) => i.id === 'note')!;
  expect(note.parentId).toBe('folder');
  expect(absolutePosition(note, next)).toEqual({ x: 150, y: 150 });
  expect(next[0]).toMatchObject({ width: 240, height: 96 });
  expect(folderContents(next).hidden.has('note')).toBe(true);
  expect(dropIntoGroup(original, ['note'], { x: 450, y: 450 })).toBe(original);
});

test('hidden nested groups cannot receive drops; duplication retains folder contents and state', () => {
  const original = toggleFolder([item('outer', 'group'), item('inner', 'group', 'outer'), item('note', 'text')], 'outer');
  expect(dropIntoGroup(original, ['note'], { x: 400, y: 400 })).toBe(original);
  const copies = duplicateItems(original, ['outer']);
  expect(copies).toHaveLength(2);
  expect(copies[0].data.collapsed).toBe(true);
  expect(folderContents(copies).hidden.has(copies[1].id)).toBe(true);
});

test('a large collapsed folder exposes only its card while retaining every stored item', () => {
  const items = toggleFolder([item('folder', 'group'), ...Array.from({ length: 9000 }, (_, n) => item(String(n), 'text', 'folder'))], 'folder');
  const { hidden } = folderContents(items);
  expect(hidden.size).toBe(9000);
  expect(items.filter((i) => !hidden.has(i.id)).map((i) => i.id)).toEqual(['folder']);
  expect(toggleFolder(items, 'folder')).toHaveLength(9001);
});
