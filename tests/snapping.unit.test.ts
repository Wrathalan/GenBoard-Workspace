import { expect, it } from 'vitest';
import { snapPositions } from '../shared/snapping';
import type { CanvasItem } from '../shared/types';
const card = (id: string, x: number, y: number, parentId?: string): CanvasItem => ({
  id,
  type: 'text',
  position: { x, y },
  width: 100,
  height: 80,
  data: {},
  parentId,
});
it('snaps negative world coordinates to the grid', () => {
  const result = snapPositions(
    [card('a', 0, 0)],
    new Map([['a', { x: -29, y: 37 }]]),
    1,
    true,
    false,
  );
  expect(result.positions.get('a')).toEqual({ x: -24, y: 48 });
});
it('aligns edges and centers ahead of grid snapping with a screen-space threshold', () => {
  const items = [card('a', 0, 0), card('b', 103, 200)];
  const result = snapPositions(items, new Map([['a', { x: 100, y: 100 }]]), 1, true, true);
  expect(result.positions.get('a')?.x).toBe(103);
  expect(result.guides).toContainEqual({ axis: 'x', value: 103 });
  expect(snapPositions(items, new Map([['a', { x: 100, y: 100 }]]), 4, false, true).guides).toEqual(
    [],
  );
});
it('keeps multi-selection spacing and snaps children in world coordinates', () => {
  const items = [card('a', 0, 0), card('b', 130, 0)];
  const r = snapPositions(
    items,
    new Map([
      ['a', { x: 29, y: 29 }],
      ['b', { x: 159, y: 29 }],
    ]),
    1,
    true,
    false,
  );
  expect(r.positions.get('b')!.x - r.positions.get('a')!.x).toBe(130);
  const group = { ...card('g', 13, 13), type: 'group' as const };
  expect(
    snapPositions(
      [group, card('c', 10, 10, 'g')],
      new Map([['c', { x: 17, y: 17 }]]),
      1,
      true,
      false,
    ).positions.get('c'),
  ).toEqual({ x: 11, y: 11 });
});
it('excludes moving descendants as guide targets and allows free movement when disabled', () => {
  const items = [{ ...card('g', 0, 0), type: 'group' as const }, card('c', 20, 20, 'g')];
  expect(snapPositions(items, new Map([['g', { x: 19, y: 19 }]]), 1, false, true).guides).toEqual(
    [],
  );
  expect(
    snapPositions(items, new Map([['g', { x: 19, y: 19 }]]), 1, false, false).positions.get('g'),
  ).toEqual({ x: 19, y: 19 });
});
