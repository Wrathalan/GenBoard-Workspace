import { absolutePosition, duplicateItems } from './board';
import { sensitiveIds } from './spoilers';
import type { CanvasItem, Point } from './types';

export function copyCanvasSelection(items: CanvasItem[], selected: string[]): CanvasItem[] {
  const ids = new Set(selected);
  for (let added = true; added;) {
    added = false;
    for (const item of items)
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        added = true;
      }
  }
  const chosen = items.filter((i) => ids.has(i.id));
  if (chosen.some((i) => i.type === 'job'))
    throw new Error('Copy completed images or cards, not generation jobs.');
  const hidden = sensitiveIds(items);
  return chosen.map((item) => {
    const copy = structuredClone(item);
    if (!item.parentId || !ids.has(item.parentId)) {
      copy.position = absolutePosition(item, items);
      delete copy.parentId;
    }
    copy.data.sensitive = hidden.has(item.id);
    copy.data.edgeLinks = copy.data.edgeLinks?.filter((id) => ids.has(id));
    return copy;
  });
}

export function pasteCanvasSelection(items: CanvasItem[], center: Point): CanvasItem[] {
  if (!items.length) return [];
  const copies = duplicateItems(
    items,
    items.map((i) => i.id),
  );
  const roots = copies.filter((i) => !i.parentId);
  const left = Math.min(...roots.map((i) => i.position.x));
  const top = Math.min(...roots.map((i) => i.position.y));
  const right = Math.max(...roots.map((i) => i.position.x + i.width));
  const bottom = Math.max(...roots.map((i) => i.position.y + i.height));
  const delta = { x: center.x - (left + right) / 2, y: center.y - (top + bottom) / 2 };
  return copies.map((i) =>
    i.parentId ? i : { ...i, position: { x: i.position.x + delta.x, y: i.position.y + delta.y } },
  );
}
