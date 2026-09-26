import { motionRoots, motionLocks, motionComponents, rigidPositions } from '../shared/group-motion';
import { create } from 'zustand';
import { sensitiveIds } from '../shared/spoilers';
import { boardName } from '../shared/board-navigation';
import type { Asset, Board, CanvasItem, Project, Viewport, WorkspaceAPI } from '../shared/types';
import { absolutePosition, duplicateItems, History } from '../shared/board';
declare global {
  interface Window {
    imagine: WorkspaceAPI;
  }
}
const history = new History<CanvasItem[]>();
let timer: ReturnType<typeof setTimeout> | undefined;
let saves = Promise.resolve();
let dirty = false;
let pendingSaves = 0;
export const hasUnsavedChanges = () => dirty || pendingSaves > 0;
type State = {
  project: Project | null;
  board: Board | null;
  selected: string[];
  error: string;
  saveStatus: string;
  canUndo: boolean;
  canRedo: boolean;
  editRequest: { id: string; at: number } | null;
  codexBusy: boolean;
  navigationPending: boolean;
  renameBoard: (name: string) => void;
  load: (p: Project) => void;
  update: (p: Project) => void;
  select: (ids: string[]) => void;
  change: (items: CanvasItem[], checkpoint?: boolean) => void;
  checkpoint: () => void;
  viewport: (v: Viewport) => void;
  addAssets: (assets: Asset[], position: { x: number; y: number }) => void;
  undo: () => void;
  redo: () => void;
  remove: () => void;
  duplicate: () => void;
  group: () => void;
  ungroup: () => void;
  align: () => void;
  lock: () => void;
};
export const useWorkspace = create<State>((set, get) => ({
  project: null,
  board: null,
  selected: [],
  error: '',
  saveStatus: 'Local only',
  canUndo: false,
  canRedo: false,
  editRequest: null,
  codexBusy: false,
  navigationPending: false,
  renameBoard: (value) => {
    const { board, project } = get();
    if (!board || !project) return;
    const name = boardName(value);
    set({
      board: { ...board, name },
      project: {
        ...project,
        boards: project.boards.map((b) => b.id === board.id ? { ...b, name } : b),
      },
    });
    scheduleSave();
  },
  load: (p) => {
    history.past = [];
    history.future = [];
    dirty = false;
    set({
      project: p,
      board: p.boards.find((b) => b.id === p.activeBoardId) || p.boards[0],
      selected: [],
      error: '',
      saveStatus: 'Saved locally',
      canUndo: false,
      canRedo: false,
      editRequest: null,
    });
  },
  update: (p) => {
    const old = get().project;
    const board = get().board;
    if (!old || old.folder !== p.folder || !board) {
      get().load(p);
      return;
    }
    const server = p.boards.find((b) => b.id === board.id);
    if (!server) return;
    // Job ingestion is additive. Preserve edits while reconciling generated placeholders.
    const previous = new Set(old.boards.find((b) => b.id === board.id)?.items.map((i) => i.id));
    const serverIds = new Set(server.items.map((i) => i.id));
    const items = board.items.filter((i) => !(i.type === 'job' && !serverIds.has(i.id)));
    for (const item of server.items)
      if (!items.some((i) => i.id === item.id) && !previous.has(item.id)) items.push(item);
    set({ project: { ...p, style: old.style }, board: { ...board, items } });
  },
  select: (selected) => set({ selected }),
  checkpoint: () => {
    if (get().board) history.push(get().board!.items);
    set({ canUndo: history.past.length > 0, canRedo: history.future.length > 0 });
  },
  change: (items, checkpoint = true) => {
    const b = get().board;
    if (!b) return;
    if (checkpoint) history.push(b.items);
    const existing = new Set(items.map((i) => i.id));
    items = items.map((i) =>
      i.data.edgeLinks?.some((id) => !existing.has(id))
        ? {
            ...i,
            data: { ...i.data, edgeLinks: i.data.edgeLinks.filter((id) => existing.has(id)) },
          }
        : i,
    );
    set({
      board: { ...b, items },
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    });
    scheduleSave();
  },
  viewport: (viewport) => {
    const b = get().board;
    if (b) {
      set({ board: { ...b, viewport } });
      scheduleSave();
    }
  },
  addAssets: (assets, position) => {
    const s = get();
    if (!s.board || !s.project) return;
    const all = [...s.project.assets];
    for (const a of assets) if (!all.some((x) => x.id === a.id)) all.push(a);
    const added: CanvasItem[] = assets.map((a, i) => ({
      id: crypto.randomUUID(),
      type: 'image',
      position: { x: position.x + (i % 8) * 270, y: position.y + Math.floor(i / 8) * 330 },
      width: 240,
      height: (240 * a.height) / a.width,
      data: { assetId: a.id },
    }));
    set({ project: { ...s.project, assets: all }, selected: added.map((i) => i.id) });
    get().change([...s.board.items, ...added]);
  },
  undo: () => {
    const b = get().board;
    if (b) get().change(history.undo(b.items), false);
  },
  redo: () => {
    const b = get().board;
    if (b) get().change(history.redo(b.items), false);
  },
  remove: () => {
    const s = get();
    if (!s.board) return;
    const ids = new Set(
      s.selected.filter((id) => {
        const i = s.board!.items.find((i) => i.id === id);
        return (
          i &&
          !i.data.locked &&
          (i.type !== 'job' ||
            s.project?.jobs.some(
              (j) => j.id === i.data.jobId && ['failed', 'cancelled'].includes(j.state),
            ))
        );
      }),
    );
    const remaining = s.board.items
      .filter((i) => !ids.has(i.id))
      .map((i) =>
        i.parentId && ids.has(i.parentId)
          ? {
              ...i,
              data: { ...i.data, sensitive: sensitiveIds(s.board!.items).has(i.id) },
              parentId: undefined,
              position: absolutePosition(i, s.board!.items),
            }
          : i,
      );
    get().change(remaining);
    set({ selected: [] });
  },
  duplicate: () => {
    const s = get();
    if (s.board) {
      const added = duplicateItems(s.board.items, s.selected);
      get().change([...s.board.items, ...added]);
      set({ selected: added.map((i) => i.id) });
    }
  },
  group: () => {
    const s = get();
    if (!s.board) return;
    const selected = s.board.items.filter(
      (i) => s.selected.includes(i.id) && !i.data.locked && i.type !== 'job',
    );
    if (!selected.length || selected.some((i) => i.parentId)) return;
    const x = Math.min(...selected.map((i) => i.position.x)) - 24;
    const y = Math.min(...selected.map((i) => i.position.y)) - 40;
    const group: CanvasItem = {
      id: crypto.randomUUID(),
      type: 'group',
      position: { x, y },
      width: Math.max(...selected.map((i) => i.position.x + i.width)) - x + 24,
      height: Math.max(...selected.map((i) => i.position.y + i.height)) - y + 24,
      data: { label: 'Reference group' },
    };
    get().change([
      group,
      ...s.board.items.map((i) =>
        s.selected.includes(i.id) && selected.includes(i)
          ? { ...i, parentId: group.id, position: { x: i.position.x - x, y: i.position.y - y } }
          : i,
      ),
    ]);
    set({ selected: [group.id] });
  },
  ungroup: () => {
    const s = get();
    if (!s.board) return;
    const ids = new Set(
      s.board.items
        .filter((i) => i.type === 'group' && s.selected.includes(i.id) && !i.data.locked)
        .map((i) => i.id),
    );
    get().change(
      s.board.items
        .filter((i) => !ids.has(i.id))
        .map((i) =>
          i.parentId && ids.has(i.parentId)
            ? {
                ...i,
                data: { ...i.data, sensitive: sensitiveIds(s.board!.items).has(i.id) },
                parentId: undefined,
                position: absolutePosition(i, s.board!.items),
              }
            : i,
        ),
    );
  },
  align: () => {
    const s = get();
    if (!s.board) return;
    const roots = motionRoots(s.board.items);
    const ids = new Set(s.selected.map((id) => roots.get(id)));
    const components = motionComponents(s.board.items, roots);
    for (const id of ids) for (const peer of components.get(id!) || []) ids.add(peer);
    if ([...motionLocks(s.board.items, roots)].some((id) => ids.has(id))) return;
    const items = s.board.items.filter((i) => ids.has(i.id));
    if (!items.length) return;
    const y = Math.min(...items.map((i) => absolutePosition(i, s.board!.items).y));
    const proposed = new Map(
      items.map((i) => {
        const top = Math.min(
          ...items.filter((p) => components.get(i.id)!.has(p.id)).map((p) => p.position.y),
        );
        return [i.id, { x: i.position.x, y: i.position.y + y - top }];
      }),
    );
    const positions = rigidPositions(s.board.items, proposed);
    get().change(
      s.board.items.map((i) =>
        positions.has(i.id) ? { ...i, position: positions.get(i.id)! } : i,
      ),
    );
  },
  lock: () => {
    const s = get();
    if (!s.board) return;
    const locking = s.board.items.some((i) => s.selected.includes(i.id) && !i.data.locked);
    const ids = new Set(s.selected);
    let added = true;
    while (added) {
      added = false;
      for (const i of s.board.items)
        if (i.parentId && ids.has(i.parentId) && !ids.has(i.id)) {
          ids.add(i.id);
          added = true;
        }
    }
    get().change(
      s.board.items.map((i) =>
        ids.has(i.id) ? { ...i, data: { ...i.data, locked: locking } } : i,
      ),
    );
  },
}));
export const fail = (e: unknown) =>
  useWorkspace.setState({
    error: (e as Error).message || String(e),
    saveStatus: 'Needs attention',
  });
function scheduleSave() {
  dirty = true;
  useWorkspace.setState({ saveStatus: 'Saving…' });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush().catch(fail), 350);
}
export async function flush() {
  if (timer) clearTimeout(timer);
  const board = useWorkspace.getState().board;
  if (board && dirty) {
    const snapshot = structuredClone(board);
    const known =
      useWorkspace
        .getState()
        .project?.boards.find((b) => b.id === board.id)
        ?.items.filter((i) => i.data.jobId)
        .map((i) => i.id) || [];
    dirty = false;
    pendingSaves++;
    saves = saves
      .catch(() => {})
      .then(() => window.imagine.saveBoard(snapshot, known))
      .catch((e) => {
        dirty = true;
        fail(e);
        throw e;
      })
      .finally(() => {
        pendingSaves--;
        if (!dirty && pendingSaves === 0) useWorkspace.setState({ saveStatus: 'Saved locally' });
      });
  }
  await saves;
}
