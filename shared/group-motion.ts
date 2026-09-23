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
  const blocked = new Set(
    items.filter((i) => i.data.locked || i.type === 'job').map((i) => roots.get(i.id)!),
  );
  const components = motionComponents(items, roots);
  return new Set([...blocked].flatMap((id) => [...(components.get(id) || [id])]));
}
/** Edge links join whole group roots without changing the canvas hierarchy. */
export function motionComponents(
  items: CanvasItem[],
  roots = motionRoots(items),
): Map<string, Set<string>> {
  const graph = new Map([...new Set(roots.values())].map((id) => [id, new Set<string>()]));
  for (const item of items)
    for (const other of item.data.edgeLinks || []) {
      const a = roots.get(item.id),
        b = roots.get(other);
      if (!a || !b || a === b) continue;
      graph.get(a)!.add(b);
      graph.get(b)!.add(a);
    }
  const result = new Map<string, Set<string>>();
  for (const id of graph.keys()) {
    if (result.has(id)) continue;
    const connected = new Set([id]);
    for (const next of connected) for (const peer of graph.get(next)!) connected.add(peer);
    for (const peer of connected) result.set(peer, connected);
  }
  return result;
}
export function edgeLinkedRoots(items: CanvasItem[]): Set<string> {
  const roots = motionRoots(items),
    linked = new Set<string>();
  for (const item of items)
    for (const other of item.data.edgeLinks || []) {
      if (!roots.has(other)) continue;
      linked.add(roots.get(item.id)!);
      linked.add(roots.get(other)!);
    }
  return linked;
}
export function rigidPositions(
  items: CanvasItem[],
  proposed: Map<string, Point>,
): Map<string, Point> {
  const roots = motionRoots(items),
    blocked = motionLocks(items, roots);
  const byId = new Map(items.map((i) => [i.id, i]));
  const components = motionComponents(items, roots);
  const result = new Map<string, Point>();
  for (const [id, point] of proposed) {
    const item = byId.get(id),
      rootId = roots.get(id);
    if (!item || !rootId || blocked.has(rootId) || result.has(rootId)) continue;
    const root = byId.get(rootId)!;
    const target = proposed.get(rootId) || {
      x: root.position.x + point.x - item.position.x,
      y: root.position.y + point.y - item.position.y,
    };
    for (const peer of components.get(rootId)!) {
      const member = byId.get(peer)!;
      result.set(peer, {
        x: member.position.x + target.x - root.position.x,
        y: member.position.y + target.y - root.position.y,
      });
    }
  }
  return result;
}
