import { expect, test } from 'vitest';
import { folderDestinations, canSendItems, sendToFolder } from '../shared/send-to';
import { absolutePosition } from '../shared/board';
import { folderContents } from '../shared/board-folders';
import type { CanvasItem } from '../shared/types';

const node = (id: string, parentId?: string, folder = false): CanvasItem => ({
  id, parentId, type: folder ? 'group' : 'text', position: { x: 100, y: 100 },
  width: 240, height: 96, data: folder ? { folder: true, collapsed: true, expandedSize: { width: 480, height: 320 } } : {},
});
test('folder destinations reject cycles, locked ancestors and current parent', () => {
  const items = [node('a', undefined, true), node('nested', 'a', true), node('locked', undefined, true), node('child', 'a'), node('other', undefined, true)];
  items[2].data.locked = true;
  expect(folderDestinations(items, ['a']).map((i) => i.id)).toEqual(['other']);
  expect(folderDestinations(items, ['child']).map((i) => i.id)).toEqual(['nested', 'other']);
  expect(() => sendToFolder(items, ['a'], 'nested')).toThrow('available destination');
  items[0].data.locked = true;
  expect(canSendItems(items, ['child'])).toBe(false);
});
test('send into a collapsed folder preserves IDs, subtrees, internal links, and layout', () => {
  const items = [node('target', undefined, true), node('group', undefined, true), node('child', 'group'), node('outside')];
  items[1].data.edgeLinks = ['outside'];
  items[3].data.edgeLinks = ['group'];
  const next = sendToFolder(items, ['group'], 'target');
  expect(next.find((i) => i.id === 'group')!.parentId).toBe('target');
  expect(next.find((i) => i.id === 'child')!.parentId).toBe('group');
  expect(next.find((i) => i.id === 'child')!.position).toEqual(items[2].position);
  expect(next.find((i) => i.id === 'outside')!.data.edgeLinks).toEqual([]);
  expect(folderContents(next).hidden).toEqual(new Set(['group', 'child']));
  expect(next.find((i) => i.id === 'target')!.width).toBe(240);
  expect(items[1].parentId).toBeUndefined();
});
test('release a member onto canvas preserves world position and inherited sensitivity', () => {
  const items = [node('folder', undefined, true), node('child', 'folder')];
  items[0].data.sensitive = true;
  const next = sendToFolder(items, ['child'], null);
  const child = next.find((i) => i.id === 'child')!;
  expect(child.parentId).toBeUndefined();
  expect(child.position).toEqual(absolutePosition(items[1], items));
  expect(child.data.sensitive).toBe(true);
});
test('jobs cannot be sent individually or inside a folder', () => {
  const items = [node('folder', undefined, true), { ...node('job', 'folder'), type: 'job' as const }];
  expect(canSendItems(items, ['job'])).toBe(false);
  expect(canSendItems(items, ['folder'])).toBe(false);
});
