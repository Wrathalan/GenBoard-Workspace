import { motionRoots, motionLocks } from './group-motion';
import type { CanvasItem, Job, Point } from './types';

export type SelectionAction = 'duplicate' | 'group' | 'ungroup' | 'align' | 'lock' | 'remove';
export type MenuAction =
  | SelectionAction
  | 'spoiler'
  | 'colors'
  | 'import'
  | 'paste'
  | 'text'
  | 'selectAll'
  | 'fitBoard'
  | 'resetZoom'
  | 'undo'
  | 'redo'
  | 'view'
  | 'reference'
  | 'copyImage'
  | 'exportImage'
  | 'revealImage'
  | 'editText'
  | 'rename'
  | 'fitSelection'
  | 'compare'
  | 'jobDetails'
  | 'cancel'
  | 'retry'
  | 'reconcile';
export type MenuEntry = {
  action: MenuAction;
  label: string;
  enabled: boolean;
  shortcut?: string;
  section: number;
  danger?: boolean;
};
export type ContextTarget = { boardId: string; ids: string[]; screen: Point; world: Point };
export const isRightDrag = (start: Point, point: Point) =>
  Math.hypot(point.x - start.x, point.y - start.y) > 4;
export function contextSelection(selected: string[], clicked?: string): string[] {
  return clicked ? (selected.includes(clicked) ? selected : [clicked]) : selected;
}
export function selectionPermissions(
  items: CanvasItem[],
  all: CanvasItem[],
  jobs: Job[],
): Record<SelectionAction, boolean> {
  const ids = new Set(items.map((i) => i.id));
  const descendants = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of all)
      if (i.parentId && descendants.has(i.parentId) && !descendants.has(i.id)) {
        descendants.add(i.id);
        changed = true;
      }
  }
  const locked = all.some((i) => descendants.has(i.id) && i.data.locked);
  const noJobs = all.filter((i) => descendants.has(i.id)).every((i) => i.type !== 'job');
  const editable = items.length > 0 && !locked;
  const roots = motionRoots(all);
  const units = new Set(items.map((i) => roots.get(i.id)));
  const movementLocked = [...motionLocks(all, roots)].some((id) => units.has(id));
  return {
    duplicate: editable && noJobs,
    group: editable && noJobs && items.every((i) => !i.parentId),
    ungroup: editable && items.every((i) => i.type === 'group'),
    align: units.size > 1 && !movementLocked,
    lock: items.length > 0 && noJobs,
    remove:
      editable &&
      items.every(
        (i) =>
          i.type !== 'job' ||
          jobs.some((j) => j.id === i.data.jobId && ['failed', 'cancelled'].includes(j.state)),
      ),
  };
}
export function contextEntries(
  items: CanvasItem[],
  all: CanvasItem[],
  jobs: Job[],
  undo: boolean,
  redo: boolean,
): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const add = (
    action: MenuAction,
    label: string,
    section: number,
    enabled = true,
    shortcut?: string,
    danger = false,
  ) => entries.push({ action, label, section, enabled, shortcut, danger });
  if (!items.length) {
    add('import', 'Import images here…', 0);
    add('paste', 'Paste image here', 0, true, 'Ctrl+V');
    add('text', 'Add text here', 0, true, 'T');
    add('selectAll', 'Select all', 1, all.length > 0, 'Ctrl+A');
    add('fitBoard', 'Fit board', 1, all.length > 0);
    add('resetZoom', 'Reset zoom', 1);
    add('undo', 'Undo', 2, undo, 'Ctrl+Z');
    add('redo', 'Redo', 2, redo, 'Ctrl+Y');
    return entries;
  }
  add(
    'spoiler',
    items.every((i) => i.data.sensitive) ? 'Unmark sensitive' : 'Mark as sensitive',
    0,
  );
  add('colors', 'Customize item colors', 0);
  const one = items.length === 1 ? items[0] : undefined;
  if (one?.type === 'job') {
    const j = jobs.find((j) => j.id === one.data.jobId);
    add('jobDetails', 'View job details', 0, !!j);
    if (j && ['queued', 'running'].includes(j.state)) add('cancel', 'Cancel job', 1);
    if (j && ['failed', 'cancelled'].includes(j.state)) {
      add('retry', 'Retry as new attempt', 1);
      add('remove', 'Remove placeholder', 2, !one.data.locked, undefined, true);
    }
    if (j?.state === 'connection-unknown') add('reconcile', 'Reconcile job', 1);
    return entries;
  }
  if (one?.type === 'image') {
    add('view', 'View full resolution', 0);
    add('reference', 'Use as reference', 0);
    add('copyImage', 'Copy image', 1);
    add('exportImage', 'Save original as…', 1);
    add('revealImage', 'Show in Explorer', 1);
  }
  if (one?.type === 'text') add('editText', 'Edit text', 0, !one.data.locked);
  if (one?.type === 'group') add('rename', 'Rename group', 0, !one.data.locked);
  if (items.length === 2 && items.every((i) => i.type === 'image'))
    add('compare', 'Compare images', 0);
  const permissions = selectionPermissions(items, all, jobs);
  add('duplicate', 'Duplicate', 2, permissions.duplicate, 'Ctrl+D');
  if (one?.type !== 'group') add('group', 'Group', 2, permissions.group, 'Ctrl+G');
  if (items.some((i) => i.type === 'group'))
    add('ungroup', 'Ungroup', 2, permissions.ungroup, 'Ctrl+Shift+G');
  if (items.length > 1) add('align', 'Align top', 2, permissions.align);
  add('lock', items.some((i) => !i.data.locked) ? 'Lock' : 'Unlock', 3, permissions.lock);
  add('fitSelection', 'Fit selection', 3, true, 'F');
  if (one?.type !== 'group')
    add(
      'remove',
      items.length > 1 ? 'Delete selected cards' : 'Delete',
      4,
      permissions.remove,
      'Delete',
      true,
    );
  return entries;
}
