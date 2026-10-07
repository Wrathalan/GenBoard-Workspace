import type { CanvasItem } from './types';

export const FOLDER_WIDTH = 240;
export const FOLDER_HEIGHT = 96;

/** Resolve visibility once per hierarchy, including nested collapsed folders. */
export function folderContents(items: CanvasItem[]) {
  const children = new Map<string, string[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = children.get(item.parentId) || [];
    siblings.push(item.id);
    children.set(item.parentId, siblings);
  }
  const hidden = new Set<string>();
  const queue = items.filter((i) => i.type === 'group' && i.data.folder && i.data.collapsed)
    .flatMap((i) => children.get(i.id) || []);
  for (let n = 0; n < queue.length; n++) {
    const id = queue[n];
    if (hidden.has(id)) continue;
    hidden.add(id);
    queue.push(...(children.get(id) || []));
  }
  return { hidden, children };
}

export function toggleFolder(items: CanvasItem[], id: string): CanvasItem[] {
  return items.map((item) => {
    if (item.id !== id || item.type !== 'group' || !item.data.folder) return item;
    if (item.data.collapsed) {
      return { ...item, ...(item.data.expandedSize || { width: 480, height: 320 }),
        data: { ...item.data, collapsed: false, expandedSize: undefined } };
    }
    return { ...item, width: FOLDER_WIDTH, height: FOLDER_HEIGHT,
      data: { ...item.data, collapsed: true,
        expandedSize: { width: item.width, height: item.height } } };
  });
}
