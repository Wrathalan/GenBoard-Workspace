import { absolutePosition } from './board';
import { edgeContacts, type EdgeContact } from './sticky-edges';
import type { CanvasItem, Point } from './types';

export const GRID_SIZE = 24;
export type SnapGuide = { axis: 'x' | 'y'; value: number; edge?: EdgeContact };
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
  const joins: { axis: 'x' | 'y'; a: string; b: string }[] = [];
  if (alignment) {
    const stationary = items.filter((i) => !affected(i) && i.type !== 'group' && i.type !== 'job');
    for (const axis of ['x', 'y'] as const) {
      // Opposing edges with overlapping spans take priority over grid and center anchors.
      let sticky: { delta: number; value: number; a: string; b: string } | undefined;
      for (const a of proposed.filter((i) => affected(i) && i.type !== 'job')) {
        const p = absolutePosition(a, proposed);
        for (const b of items.filter((i) => !affected(i) && i.type !== 'job')) {
          const q = absolutePosition(b, items);
          const overlap =
            axis === 'x'
              ? Math.min(p.y + a.height, q.y + b.height) - Math.max(p.y, q.y)
              : Math.min(p.x + a.width, q.x + b.width) - Math.max(p.x, q.x);
          if (overlap <= 0.01) continue;
          const sizeA = axis === 'x' ? a.width : a.height,
            sizeB = axis === 'x' ? b.width : b.height;
          for (const [anchor, target] of [
            [p[axis] + sizeA, q[axis]],
            [p[axis], q[axis] + sizeB],
          ]) {
            const correction = target - anchor;
            if (
              Math.abs(correction) <= 8 / zoom &&
              (!sticky || Math.abs(correction) < Math.abs(sticky.delta))
            )
              sticky = { delta: correction, value: target, a: a.id, b: b.id };
          }
        }
      }
      if (sticky) {
        joins.push({ axis, a: sticky.a, b: sticky.b });
        delta[axis] = sticky.delta;
        guides.push({ axis, value: sticky.value });
        continue;
      }
      let best = 6 / zoom + 0.00001;
      let guide: number | undefined;
      const anchors =
        axis === 'x' ? [left, (left + right) / 2, right] : [top, (top + bottom) / 2, bottom];
      for (const item of stationary) {
        const p = absolutePosition(item, items)[axis];
        const size = axis === 'x' ? item.width : item.height;
        for (const [targetIndex, target] of [p, p + size / 2, p + size].entries())
          for (const [anchorIndex, anchor] of anchors.entries()) {
            // A center guide must not pull an edge onto another card's center.
            if ((targetIndex === 1) !== (anchorIndex === 1)) continue;
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
    // Once two cards touch, prefer matching their endpoints over unrelated guides.
    if (joins.length === 1) {
      const join = joins[0],
        axis = join.axis === 'x' ? 'y' : 'x';
      const a = proposed.find((i) => i.id === join.a)!,
        b = items.find((i) => i.id === join.b)!;
      const p = absolutePosition(a, proposed),
        q = absolutePosition(b, items);
      const size = axis === 'x' ? 'width' : 'height';
      let correction: number | undefined,
        value = 0;
      for (const fraction of [0, 1, 0.5]) {
        const target = q[axis] + fraction * b[size];
        const offset = target - (p[axis] + fraction * a[size]);
        if (
          Math.abs(offset) <= 8 / zoom &&
          (correction === undefined || Math.abs(offset) < Math.abs(correction))
        ) {
          correction = offset;
          value = target;
        }
      }
      if (correction !== undefined) {
        delta[axis] = correction;
        const index = guides.findIndex((g) => g.axis === axis);
        if (index !== -1) guides.splice(index, 1);
        guides.push({ axis, value });
      }
    }
  }
  const result = new Map(positions);
  for (const root of roots) {
    const p = positions.get(root.id)!;
    result.set(root.id, { x: p.x + delta.x, y: p.y + delta.y });
  }
  if (alignment) {
    const final = items.map((i) => (result.has(i.id) ? { ...i, position: result.get(i.id)! } : i));
    const stationary = final.filter((i) => !affected(i) && i.type !== 'job');
    for (const a of final.filter((i) => affected(i) && i.type !== 'job'))
      for (const b of stationary) {
        for (const contact of edgeContacts(a, b, final)) {
          const guide = guides.find(
            (g) => g.axis === contact.axis && Math.abs(g.value - contact.value) < 0.01,
          );
          if (guide && !guide.edge) guide.edge = contact;
        }
      }
  }
  return { positions: result, guides };
}
