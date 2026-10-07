import { copyCanvasSelection } from './canvas-clipboard';
import { motionLocks, motionRoots } from './group-motion';
import type { CanvasItem } from './types';

export function canSendItems(items: CanvasItem[], ids: string[]) {
  const roots = motionRoots(items), locks = motionLocks(items, roots);
  return ids.length > 0 && ids.every((id) => roots.has(id) && !locks.has(roots.get(id)!));
}

export function folderDestinations(items: CanvasItem[], ids: string[]) {
  if (!canSendItems(items, ids)) return [];
  const chosen = copyCanvasSelection(items, ids);
  const included = new Set(chosen.map((i) => i.id));
  const roots = motionRoots(items), locks = motionLocks(items, roots);
  const top = chosen.filter((i) => !i.parentId);
  const byId = new Map(items.map((i) => [i.id, i]));
  const currentParents = new Set(top.map((i) => byId.get(i.id)?.parentId));
  return items.filter((i) => i.type === 'group' && i.data.folder && !included.has(i.id) &&
    !locks.has(roots.get(i.id)!) && !(currentParents.size === 1 && currentParents.has(i.id)));
}

/** Move selected subtrees with their IDs; detach external links and keep internal layout. */
export function sendToFolder(items: CanvasItem[], ids: string[], folderId: string | null) {
  if (!canSendItems(items, ids)) throw new Error('Locked items and generation jobs cannot be sent.');
  const chosen = copyCanvasSelection(items, ids);
  const included = new Set(chosen.map((i) => i.id));
  const target = folderId ? folderDestinations(items, ids).find((i) => i.id === folderId) : undefined;
  if (folderId && !target) throw new Error('This folder is no longer an available destination.');
  const top = chosen.filter((i) => !i.parentId);
  const remaining = items.filter((i) => !included.has(i.id)).map((i) => ({ ...i,
    data: { ...i.data, edgeLinks: i.data.edgeLinks?.filter((id) => !included.has(id)) } }));
  if (!target) return [...remaining, ...chosen];
  const left = Math.min(...top.map((i) => i.position.x));
  const above = Math.min(...top.map((i) => i.position.y));
  const bottom = Math.max(40, ...remaining.filter((i) => i.parentId === target.id)
    .map((i) => i.position.y + i.height + 24));
  const moved = chosen.map((i) => i.parentId ? i : { ...i, parentId: target.id,
    position: { x: i.position.x - left + 24, y: i.position.y - above + bottom } });
  let next = [...remaining, ...moved];
  for (let parent: string | undefined = target.id; parent;) {
    const group = next.find((i) => i.id === parent)!;
    const children = next.filter((i) => i.parentId === parent);
    const size = group.data.collapsed ? group.data.expandedSize || group : group;
    const width = Math.max(size.width, ...children.map((i) => i.position.x + i.width + 24));
    const height = Math.max(size.height, ...children.map((i) => i.position.y + i.height + 24));
    next = next.map((i) => i.id !== parent ? i : { ...i,
      ...(i.data.collapsed ? { data: { ...i.data, expandedSize: { width, height } } } : { width, height }) });
    parent = group.parentId;
  }
  return next;
}
