import { expect, test } from 'vitest';
import { sensitiveIds } from '../shared/spoilers';
import { contextEntries } from '../shared/context-menu';
import type { CanvasItem } from '../shared/types';
const item = (id: string, sensitive = false, parentId?: string): CanvasItem => ({
  id,
  type: 'image',
  data: { sensitive },
  parentId,
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
});
test('sensitive groups cover nested descendants regardless of order and tolerate cycles', () => {
  expect(
    [
      ...sensitiveIds([
        item('child', false, 'nested'),
        item('nested', false, 'group'),
        item('group', true),
        item('public'),
        item('cycle', false, 'cycle'),
      ]),
    ].sort(),
  ).toEqual(['child', 'group', 'nested']);
});
test('mixed and locked selections can be marked, fully marked selections can be unmarked', () => {
  const a = item('a', true),
    b = item('b');
  b.data.locked = true;
  const entry = (items: CanvasItem[]) =>
    contextEntries(items, items, [], false, false).find((e) => e.action === 'spoiler');
  expect(entry([a, b])).toMatchObject({ label: 'Mark as sensitive', enabled: true });
  expect(entry([a])).toMatchObject({ label: 'Unmark sensitive', enabled: true });
});
