import { absolutePosition } from './board';
import type { CanvasItem, Point } from './types';

export const GRID_SIZE = 24;
export type SnapGuide = { axis: 'x' | 'y'; value: number };
/** Snap the moving selection as a rigid body in world coordinates. */
export function snapPositions(
  items: CanvasItem[],
  positions: Map<string, Point>,
  zoom: number,
  grid: boolean,
  alignment: boolean,
) {
  const moving = new Set(positions.keys());
  const affected = (item: CanvasItem | undefined) => {
    if (!item) return false;
    const seen = new Set<string>();
    while (true) {
      if (moving.has(item.id)) return true;
      if (!item.parentId || seen.has(item.id)) return false;
      seen.add(item.id);
      const parentId: string = item.parentId;
      const parent: CanvasItem | undefined = items.find((i) => i.id === parentId);
      if (!parent) return false;
      item = parent;
    }
  };
  const roots = items.filter(
    (i) => moving.has(i.id) && !(i.parentId && affected(items.find((p) => p.id === i.parentId)!)),
  );
  if (!roots.length) return { positions, guides: [] as SnapGuide[] };
  const proposed = items.map((i) =>
    positions.has(i.id) ? { ...i, position: positions.get(i.id)! } : i,
  );
  const boxes = roots.map((i) => ({
    ...absolutePosition(
      proposed.find((p) => p.id === i.id)!,
      proposed,
    ),
    width: i.width,
    height: i.height,
  }));
  const left = Math.min(...boxes.map((b) => b.x)),
    top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width)),
    bottom = Math.max(...boxes.map((b) => b.y + b.height));
  const delta = {
    x: grid ? Math.round(left / GRID_SIZE) * GRID_SIZE - left : 0,
    y: grid ? Math.round(top / GRID_SIZE) * GRID_SIZE - top : 0,
  };
  const guides: SnapGuide[] = [];
  if (alignment) {
    const stationary = items.filter((i) => !affected(i) && i.type !== 'group' && i.type !== 'job');
    for (const axis of ['x', 'y'] as const) {
      let best = 6 / zoom + 0.00001;
      let guide: number | undefined;
      const anchors =
        axis === 'x' ? [left, (left + right) / 2, right] : [top, (top + bottom) / 2, bottom];
      for (const item of stationary) {
        const p = absolutePosition(item, items)[axis];
        const size = axis === 'x' ? item.width : item.height;
        for (const target of [p, p + size / 2, p + size])
          for (const anchor of anchors) {
            const distance = Math.abs(target - anchor);
            if (distance < best) {
              best = distance;
              delta[axis] = target - anchor;
              guide = target;
            }
          }
      }
      if (guide !== undefined) guides.push({ axis, value: guide });
    }
  }
  const result = new Map(positions);
  for (const root of roots) {
    const p = positions.get(root.id)!;
    result.set(root.id, { x: p.x + delta.x, y: p.y + delta.y });
  }
  return { positions: result, guides };
}
