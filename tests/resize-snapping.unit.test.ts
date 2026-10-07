import { expect, it } from 'vitest';
import { snapResize } from '../shared/resize-snapping';
import type { CanvasItem } from '../shared/types';

const image: CanvasItem = {
  id: 'a',
  type: 'image',
  position: { x: 100.25, y: 80.5 },
  width: 150,
  height: 100,
  data: {},
};
it('keeps the opposite fractional corner fixed when resizing from the top left with grid enabled', () => {
  const { box } = snapResize(
    [image],
    image,
    { x: 71.75, y: 61.5, width: 178.5, height: 119 },
    0.65,
    true,
    true,
  );
  expect(box.x + box.width).toBeCloseTo(250.25, 10);
  expect(box.y + box.height).toBeCloseTo(180.5, 10);
  expect(box.width / box.height).toBeCloseTo(1.5, 10);
});
it('snaps a growing image exactly to its neighbor without moving its origin or losing ratio', () => {
  const neighbor = { ...image, id: 'b', position: { x: 401.125, y: 70 }, height: 300 };
  const { box, guides } = snapResize(
    [image, neighbor],
    image,
    { x: 100.25, y: 80.5, width: 298, height: 298 / 1.5 },
    0.65,
    true,
    true,
  );
  expect(box.x).toBe(image.position.x);
  expect(box.y).toBe(image.position.y);
  expect(box.x + box.width).toBe(401.125);
  expect(box.width / box.height).toBeCloseTo(1.5, 10);
  expect(guides).toContainEqual({ axis: 'x', value: 401.125 });
});
it('keeps free resize exact and does not snap to distant targets at high zoom', () => {
  const raw = { x: 100.25, y: 80.5, width: 197, height: 197 / 1.5 };
  const neighbor = { ...image, id: 'b', position: { x: 300.25, y: 0 }, height: 300 };
  for (const result of [
    snapResize([image, neighbor], image, raw, 4, false, true),
    snapResize([image, neighbor], image, raw, 1, false, false),
  ])
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(result.box[key]).toBeCloseTo(raw[key], 10);
});
it('uses the selected handle and stored ratio even when measured dimensions have rounded', () => {
  const { box } = snapResize(
    [image],
    image,
    { x: 71.25, y: 60.5, width: 179, height: 121 },
    0.65,
    false,
    false,
    { x: 1, y: 1 },
  );
  expect(box.x + box.width).toBeCloseTo(250.25, 10);
  expect(box.y + box.height).toBeCloseTo(180.5, 10);
  expect(box.width / box.height).toBeCloseTo(1.5, 10);
});
it('preserves a side-handle center anchor and excludes descendants from resize targets', () => {
  const raw = { x: 100.25, y: 65.5, width: 195, height: 130 };
  const { box } = snapResize([image], image, raw, 1, true, true);
  expect(box.x).toBe(image.position.x);
  expect(box.y + box.height / 2).toBeCloseTo(130.5, 10);
  const group = { ...image, type: 'group' as const };
  const child = { ...image, id: 'child', parentId: 'a', position: { x: 196, y: 0 } };
  expect(snapResize([group, child], group, raw, 1, false, true).guides).toEqual([]);
});
