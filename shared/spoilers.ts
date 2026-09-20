import type { CanvasItem } from './types';
/** A marked group protects descendants, including nested groups. */
export function sensitiveIds(items: CanvasItem[]): Set<string> {
  const hidden = new Set(items.filter((i) => i.data.sensitive).map((i) => i.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && hidden.has(item.parentId) && !hidden.has(item.id)) {
        hidden.add(item.id);
        changed = true;
      }
    }
  }
  return hidden;
}
