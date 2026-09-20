import { test, expect } from 'vitest';
import { motionRoots, rigidPositions } from '../shared/group-motion';
import { snapPositions } from '../shared/snapping';
import type { CanvasItem } from '../shared/types';
const node = (
  id: string,
  x: number,
  y: number,
  parentId?: string,
  type: CanvasItem['type'] = 'image',
): CanvasItem => ({ id, type, parentId, position: { x, y }, width: 100, height: 100, data: {} });
const fixture = () => [
  node('g', 100, 100, undefined, 'group'),
  node('nested', 20, 30, 'g', 'group'),
  node('a', 10, 10, 'nested'),
  node('b', 80, 30, 'g'),
  node('c', 400, 400),
];
test('nested members resolve to one outermost motion unit', () => {
  const items = fixture();
  expect(motionRoots(items).get('a')).toBe('g');
  const moved = rigidPositions(
    items,
    new Map([
      ['a', { x: 34, y: 58 }],
      ['b', { x: 104, y: 78 }],
      ['c', { x: 424, y: 448 }],
    ]),
  );
  expect([...moved]).toEqual([
    ['g', { x: 124, y: 148 }],
    ['c', { x: 424, y: 448 }],
  ]);
  expect(items[2].position).toEqual({ x: 10, y: 10 });
  expect(snapPositions(items, moved, 1, true, false).positions.get('g')).toEqual({
    x: 120,
    y: 144,
  });
});
test('parent and member proposals never apply the same delta twice; locked siblings block motion', () => {
  const items = fixture();
  expect([
    ...rigidPositions(
      items,
      new Map([
        ['a', { x: 44, y: 44 }],
        ['g', { x: 124, y: 148 }],
      ]),
    ),
  ]).toEqual([['g', { x: 124, y: 148 }]]);
  items[3].data.locked = true;
  expect(rigidPositions(items, new Map([['a', { x: 44, y: 44 }]])).size).toBe(0);
});
