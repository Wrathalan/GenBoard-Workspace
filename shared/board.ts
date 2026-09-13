import type { CanvasItem, Point, Viewport } from './types';
export const screenToWorld = (p: Point, v: Viewport): Point => ({
  x: (p.x - v.x) / v.zoom,
  y: (p.y - v.y) / v.zoom,
});
export function absolutePosition(item: CanvasItem, items: CanvasItem[]): Point {
  let p = { ...item.position };
  let parent = item.parentId;
  const seen = new Set([item.id]);
  while (parent) {
    if (seen.has(parent)) throw new Error('Cyclic group');
    seen.add(parent);
    const found = items.find((i) => i.id === parent);
    if (!found) break;
    p = { x: p.x + found.position.x, y: p.y + found.position.y };
    parent = found.parentId;
  }
  return p;
}
export function duplicateItems(items: CanvasItem[], ids: string[]): CanvasItem[] {
  const included = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of items)
      if (i.parentId && included.has(i.parentId) && !included.has(i.id)) {
        included.add(i.id);
        changed = true;
      }
  }
  const map = new Map([...included].map((id) => [id, crypto.randomUUID()]));
  return items
    .filter((i) => included.has(i.id) && i.type !== 'job')
    .map((i) => ({
      ...structuredClone(i),
      id: map.get(i.id)!,
      parentId: i.parentId ? map.get(i.parentId) || i.parentId : undefined,
      position: {
        x: i.position.x + (i.parentId && included.has(i.parentId) ? 0 : 32),
        y: i.position.y + (i.parentId && included.has(i.parentId) ? 0 : 32),
      },
    }));
}
export class History<T> {
  past: T[] = [];
  future: T[] = [];
  push(value: T) {
    this.past.push(structuredClone(value));
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  }
  undo(current: T) {
    const v = this.past.pop();
    if (v === undefined) return current;
    this.future.push(structuredClone(current));
    return v;
  }
  redo(current: T) {
    const v = this.future.pop();
    if (v === undefined) return current;
    this.past.push(structuredClone(current));
    return v;
  }
}
