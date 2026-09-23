import { absolutePosition } from './board';
import { motionLocks, motionRoots, motionComponents, edgeLinkedRoots } from './group-motion';
import type { CanvasItem, Point } from './types';

/** Drop rigid roots into the innermost unlocked group, preserving world positions. */
export function dropIntoGroup(items: CanvasItem[], ids: string[], point: Point): CanvasItem[] {
  const roots = motionRoots(items),
    locked = motionLocks(items, roots);
  const moving = new Set(ids.map((id) => roots.get(id)).filter((id) => id && !locked.has(id)));
  const components = motionComponents(items, roots);
  const edgeLinked = edgeLinkedRoots(items);
  for (const root of moving) for (const peer of components.get(root!) || []) moving.add(peer);
  if (!moving.size) return items;
  const target = items
    .filter((i) => {
      if (
        i.type !== 'group' ||
        moving.has(roots.get(i.id)) ||
        locked.has(roots.get(i.id)!) ||
        edgeLinked.has(roots.get(i.id)!)
      )
        return false;
      const p = absolutePosition(i, items);
      return (
        point.x >= p.x && point.x <= p.x + i.width && point.y >= p.y && point.y <= p.y + i.height
      );
    })
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  if (!target) return items;
  const at = absolutePosition(target, items);
  let result = items.map((i) => {
    if (!moving.has(i.id)) return i;
    const p = absolutePosition(i, items);
    return { ...i, parentId: target.id, position: { x: p.x - at.x, y: p.y - at.y } };
  });
  // Grow the destination and its ancestors without shifting any contents.
  let parent: string | undefined = target.id;
  while (parent) {
    const group = result.find((i) => i.id === parent)!;
    const children = result.filter((i) => i.parentId === parent);
    const dx = Math.min(0, ...children.map((i) => i.position.x - 24));
    const dy = Math.min(0, ...children.map((i) => i.position.y - 40));
    const width = Math.max(group.width, ...children.map((i) => i.position.x + i.width + 24)) - dx;
    const height =
      Math.max(group.height, ...children.map((i) => i.position.y + i.height + 24)) - dy;
    result = result.map((i) =>
      i.id === parent
        ? { ...i, position: { x: i.position.x + dx, y: i.position.y + dy }, width, height }
        : i.parentId === parent
          ? { ...i, position: { x: i.position.x - dx, y: i.position.y - dy } }
          : i,
    );
    parent = group.parentId;
  }
  const ordered: CanvasItem[] = [],
    visited = new Set<string>();
  function add(i: CanvasItem) {
    if (visited.has(i.id)) return;
    visited.add(i.id);
    if (i.parentId) add(result.find((p) => p.id === i.parentId)!);
    ordered.push(i);
  }
  result.forEach(add);
  return ordered;
}
