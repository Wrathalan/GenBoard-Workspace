import { absolutePosition } from './board';
import { motionComponents, motionLocks, motionRoots } from './group-motion';
import type { CanvasItem } from './types';

export type EdgeContact = {
  a: string;
  b: string;
  axis: 'x' | 'y';
  value: number;
  start: number;
  end: number;
};
export function edgeContacts(
  a: CanvasItem,
  b: CanvasItem,
  items: CanvasItem[],
  tolerance = 0.01,
): EdgeContact[] {
  const p = absolutePosition(a, items),
    q = absolutePosition(b, items);
  const result: EdgeContact[] = [];
  for (const axis of ['x', 'y'] as const) {
    const start = axis === 'x' ? Math.max(p.y, q.y) : Math.max(p.x, q.x);
    const end =
      axis === 'x'
        ? Math.min(p.y + a.height, q.y + b.height)
        : Math.min(p.x + a.width, q.x + b.width);
    if (end - start <= 0.01) continue;
    const sizeA = axis === 'x' ? a.width : a.height,
      sizeB = axis === 'x' ? b.width : b.height;
    if (Math.abs(p[axis] + sizeA - q[axis]) <= tolerance)
      result.push({ a: a.id, b: b.id, axis, value: q[axis], start, end });
    else if (Math.abs(p[axis] - q[axis] - sizeB) <= tolerance)
      result.push({ a: a.id, b: b.id, axis, value: q[axis] + sizeB, start, end });
  }
  return result;
}
export function availableEdgeContacts(items: CanvasItem[], selected: string[]): EdgeContact[] {
  if (!selected.length) return [];
  const roots = motionRoots(items),
    components = motionComponents(items, roots),
    blocked = motionLocks(items, roots);
  const active = new Set(selected.flatMap((id) => [...(components.get(roots.get(id)!) || [])]));
  const candidates = items.filter((i) => i.type !== 'job' && !blocked.has(roots.get(i.id)!));
  const result: EdgeContact[] = [],
    seen = new Set<string>();
  for (const a of candidates.filter((i) => active.has(roots.get(i.id)!)))
    for (const b of candidates) {
      if (components.get(roots.get(a.id)!)?.has(roots.get(b.id)!)) continue;
      const key = [a.id, b.id].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(...edgeContacts(a, b, items));
    }
  return result;
}
export function lockEdges(items: CanvasItem[], contact: EdgeContact): CanvasItem[] {
  if (
    !availableEdgeContacts(items, [contact.a]).some(
      (c) => c.a === contact.a && c.b === contact.b && c.axis === contact.axis,
    )
  )
    return items;
  return items.map((i) =>
    i.id === contact.a || i.id === contact.b
      ? {
          ...i,
          data: {
            ...i.data,
            edgeLinks: [
              ...new Set([...(i.data.edgeLinks || []), i.id === contact.a ? contact.b : contact.a]),
            ],
          },
        }
      : i,
  );
}
export function edgePairs(items: CanvasItem[], selected: string[]): [string, string][] {
  const roots = motionRoots(items),
    components = motionComponents(items, roots);
  const active = new Set(selected.flatMap((id) => [...(components.get(roots.get(id)!) || [])]));
  const pairs = new Map<string, [string, string]>();
  for (const item of items)
    for (const other of item.data.edgeLinks || []) {
      if (!roots.has(other) || (!active.has(roots.get(item.id)!) && !active.has(roots.get(other)!)))
        continue;
      const pair = [item.id, other].sort() as [string, string];
      pairs.set(pair.join(':'), pair);
    }
  return [...pairs.values()];
}
export function unlockEdges(items: CanvasItem[], a: string, b: string): CanvasItem[] {
  return items.map((i) =>
    i.id === a || i.id === b
      ? {
          ...i,
          data: {
            ...i.data,
            edgeLinks: i.data.edgeLinks?.filter((id) => id !== (i.id === a ? b : a)),
          },
        }
      : i,
  );
}
