import { describe, expect, it } from 'vitest';
import {
  contextEntries,
  contextSelection,
  isRightDrag,
  selectionPermissions,
} from '../shared/context-menu';
import type { CanvasItem, Job } from '../shared/types';
const item = (id: string, type: CanvasItem['type'] = 'image', locked = false): CanvasItem => ({
  id,
  type,
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  data: { locked, jobId: type === 'job' ? id : undefined },
});
describe('context selection and gesture rules', () => {
  it('preserves selected targets and replaces selection only for an unselected item', () => {
    expect(contextSelection(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(contextSelection(['a', 'b'], 'c')).toEqual(['c']);
    expect(contextSelection(['a', 'b'])).toEqual(['a', 'b']);
  });
  it('suppresses a menu only beyond four CSS pixels, including diagonals', () => {
    expect(isRightDrag({ x: 20, y: 20 }, { x: 24, y: 20 })).toBe(false);
    expect(isRightDrag({ x: 20, y: 20 }, { x: 23, y: 23 })).toBe(true);
  });
  it('enables actual history and empty-board actions correctly', () => {
    const menu = contextEntries([], [], [], false, true);
    expect(menu.find((i) => i.action === 'undo')!.enabled).toBe(false);
    expect(menu.find((i) => i.action === 'redo')!.enabled).toBe(true);
    expect(menu.find((i) => i.action === 'fitBoard')!.enabled).toBe(false);
  });
});
describe('context action availability', () => {
  it('keeps single-image exports out of multi-selection and compares only two images', () => {
    const a = item('a'),
      b = item('b');
    expect(contextEntries([a], [a], [], false, false).some((i) => i.action === 'exportImage')).toBe(
      true,
    );
    const menu = contextEntries([a, b], [a, b], [], false, false);
    expect(menu.some((i) => i.action === 'copyImage')).toBe(false);
    expect(menu.some((i) => i.action === 'compare')).toBe(true);
    expect(
      contextEntries([a, item('t', 'text')], [], [], false, false).some(
        (i) => i.action === 'compare',
      ),
    ).toBe(false);
  });
  it('allows non-mutating image operations while preventing partial edits on mixed locks', () => {
    const a = item('a'),
      b = item('b', 'image', true);
    const p = selectionPermissions([a, b], [a, b], []);
    expect(p.group).toBe(false);
    expect(p.remove).toBe(false);
    expect(p.align).toBe(false);
    const menu = contextEntries([b], [b], [], false, false);
    expect(menu.find((i) => i.action === 'copyImage')!.enabled).toBe(true);
    expect(menu.find((i) => i.action === 'lock')!.label).toBe('Unlock');
  });
  it('checks locked descendants and incompatible nested group selections', () => {
    const g = item('g', 'group'),
      child = { ...item('c', 'image', true), parentId: 'g' };
    expect(selectionPermissions([g], [g, child], []).duplicate).toBe(false);
    expect(selectionPermissions([child], [g, child], []).group).toBe(false);
  });
  it.each(['queued', 'running', 'failed', 'cancelled', 'connection-unknown'] as const)(
    'shows state-appropriate actions for %s jobs',
    (state) => {
      const j = item('j', 'job');
      const actions = contextEntries([j], [j], [{ id: 'j', state } as Job], false, false).map(
        (e) => e.action,
      );
      expect(actions.includes('cancel')).toBe(['queued', 'running'].includes(state));
      expect(actions.includes('retry')).toBe(['failed', 'cancelled'].includes(state));
      expect(actions.includes('remove')).toBe(['failed', 'cancelled'].includes(state));
      expect(actions.includes('reconcile')).toBe(state === 'connection-unknown');
    },
  );
});
