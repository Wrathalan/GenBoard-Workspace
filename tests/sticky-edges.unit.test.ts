import { expect, it } from 'vitest';
import {
  availableEdgeContacts,
  edgeContacts,
  lockEdges,
  unlockEdges,
} from '../shared/sticky-edges';
import { motionLocks, rigidPositions } from '../shared/group-motion';
import { duplicateItems, History } from '../shared/board';
import { snapPositions } from '../shared/snapping';
import type { CanvasItem } from '../shared/types';
const card = (id: string, x: number, y = 0): CanvasItem => ({
  id,
  type: 'image',
  position: { x, y },
  width: 100,
  height: 80,
  data: {},
});
const linked = () => {
  const items = [card('a', 0), card('b', 100, 20), card('c', 200, 40)];
  const first = lockEdges(items, edgeContacts(items[0], items[1], items)[0]);
  return lockEdges(first, edgeContacts(first[1], first[2], first)[0]);
};
it('favors touching edges over a closer grid and center guide and scales threshold with zoom', () => {
  const a = card('a', 0),
    b = card('b', 199),
    centerTarget = card('center', 48, 400);
  const items = [a, b, centerTarget];
  const r = snapPositions(items, new Map([['a', { x: 96, y: 0 }]]), 1, true, true);
  expect(r.positions.get('a')!.x).toBe(99);
  expect(r.guides.find((g) => g.axis === 'x')?.edge).toMatchObject({ a: 'a', b: 'b', value: 199 });
  expect(
    snapPositions(items, new Map([['a', { x: 96, y: 0 }]]), 4, true, true).positions.get('a')!.x,
  ).toBe(96);
  expect(
    snapPositions(items, new Map([['a', { x: 96, y: 0 }]]), 1, true, false).positions.get('a')!.x,
  ).toBe(96);
});
it('requires shared span, and does not offer a lock for centers or overlapping cards', () => {
  const a = card('a', 0),
    b = card('b', 100, 80),
    c = card('c', 0);
  expect(edgeContacts(a, b, [a, b])).toEqual([]);
  expect(availableEdgeContacts([a, c], ['a'])).toEqual([]);
  b.position.y = 79;
  expect(availableEdgeContacts([a, b], ['a'])).toHaveLength(1);
  b.data.locked = true;
  expect(availableEdgeContacts([a, b], ['a'])).toEqual([]);
});
it('snaps both top-to-bottom and bottom-to-top joins ahead of the grid', () => {
  const items = [card('a', 0), card('b', 0, 199)];
  for (const [proposed, expected] of [[120, 119], [280, 279]]) {
    const result = snapPositions(items, new Map([['a', { x: 0, y: proposed }]]), 1, true, true);
    expect(result.positions.get('a')!.y).toBe(expected);
    expect(result.guides.find((g) => g.axis === 'y')?.edge).toMatchObject({ a: 'a', b: 'b' });
  }
});
it('moves a whole chain from either end, only once for multi-selection; locked peers block motion', () => {
  const items = linked();
  const positions = rigidPositions(
    items,
    new Map([
      ['c', { x: 212, y: 64 }],
      ['a', { x: 12, y: 24 }],
    ]),
  );
  expect(positions.get('a')).toEqual({ x: 12, y: 24 });
  expect(positions.get('b')).toEqual({ x: 112, y: 44 });
  expect(positions.get('c')).toEqual({ x: 212, y: 64 });
  items[1].data.locked = true;
  expect(motionLocks(items)).toEqual(new Set(['a', 'b', 'c']));
  expect(rigidPositions(items, new Map([['a', { x: 10, y: 10 }]])).size).toBe(0);
});
it('unlocks one join and remaps only copied joins, with independent undo snapshots', () => {
  const items = linked(),
    h = new History<CanvasItem[]>();
  h.push(items);
  const unlocked = unlockEdges(items, 'b', 'c');
  expect(rigidPositions(unlocked, new Map([['c', { x: 210, y: 40 }]])).size).toBe(1);
  expect(rigidPositions(h.undo(unlocked), new Map([['c', { x: 210, y: 40 }]])).size).toBe(3);
  const copy = duplicateItems(items, ['a', 'b']);
  expect(copy[0].data.edgeLinks).toEqual([copy[1].id]);
  expect(copy[1].data.edgeLinks).toEqual([copy[0].id]);
  expect(duplicateItems(items, ['a'])[0].data.edgeLinks).toEqual([]);
});
it('links a grouped member without changing its local coordinates or double-moving the group', () => {
  const group = { ...card('g', 50), type: 'group' as const },
    child = { ...card('child', 20), parentId: 'g' },
    other = card('other', 170);
  const items = [group, child, other];
  const locked = lockEdges(items, edgeContacts(child, other, items)[0]);
  const positions = rigidPositions(locked, new Map([['child', { x: 30, y: 10 }]]));
  expect(positions.get('g')).toEqual({ x: 60, y: 10 });
  expect(positions.get('other')).toEqual({ x: 180, y: 10 });
  expect(positions.has('child')).toBe(false);
});
