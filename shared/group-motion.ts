import type { CanvasItem, Point } from './types';
/** Top-level groups are the unit of movement; members keep local coordinates. */
export function motionRoots(items: CanvasItem[]): Map<string, string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const roots = new Map<string, string>();
  for (const item of items) {
    let current = item;
    const seen = new Set<string>();
    while (current.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentId);
      if (!parent || parent.type !== 'group') break;
      current = parent;
    }
    roots.set(item.id, current.id);
  }
  return roots;
}
export function motionLocks(items: CanvasItem[], roots = motionRoots(items)): Set<string> {
  return new Set(
    items.filter((i) => i.data.locked || i.type === 'job').map((i) => roots.get(i.id)!),
  );
}
export function rigidPositions(
  items: CanvasItem[],
  proposed: Map<string, Point>,
): Map<string, Point> {
  const roots = motionRoots(items),
    blocked = motionLocks(items, roots);
  const byId = new Map(items.map((i) => [i.id, i]));
  const result = new Map<string, Point>();
  for (const [id, point] of proposed) {
    const item = byId.get(id),
      rootId = roots.get(id);
    if (!item || !rootId || blocked.has(rootId) || result.has(rootId)) continue;
    const root = byId.get(rootId)!;
    result.set(
      rootId,
      proposed.get(rootId) || {
        x: root.position.x + point.x - item.position.x,
        y: root.position.y + point.y - item.position.y,
      },
    );
  }
  return result;
}
