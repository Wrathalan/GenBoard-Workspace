import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  NodeResizer,
  SelectionMode,
  useReactFlow,
  type NodeProps,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { Grid3X3, ScanLine, ImageIcon, LoaderCircle, Lock } from 'lucide-react';
import { useWorkspace, fail, flush } from './store';
import type { CanvasItem, ItemData, Point, Viewport } from '../shared/types';
import { contextSelection, isRightDrag, type ContextTarget } from '../shared/context-menu';
import { motionRoots, motionLocks, rigidPositions, edgeLinkedRoots } from '../shared/group-motion';
import {
  availableEdgeContacts,
  edgeContacts,
  edgePairs,
  lockEdges,
  unlockEdges,
} from '../shared/sticky-edges';
import { itemColorVariables } from '../shared/appearance';
import { sensitiveIds } from '../shared/spoilers';
import { GRID_SIZE, snapPositions, type SnapGuide } from '../shared/snapping';
import { dropIntoGroup } from '../shared/group-drop';
import { ATTACH_REFERENCES, readReferences, referenceIds, writeReferences } from './references';
import { BrowserDrag } from './BrowserDrag';
type CanvasNode = Node<ItemData, 'image' | 'text' | 'group' | 'job' | 'spoiler'>;
export const assetUrl = (id: string, original = false) =>
  window.location.protocol === 'file:'
    ? `imagine://${id}/${original ? 'original' : 'thumbnail'}`
    : `/media/${encodeURIComponent(id)}/${original ? 'original' : 'thumbnail'}`;
const Resize = ({
  id,
  selected,
  locked,
  ratio = false,
}: {
  id: string;
  selected?: boolean;
  locked?: boolean;
  ratio?: boolean;
}) => {
  const grouped = useWorkspace((s) => !!s.board?.items.find((i) => i.id === id)?.parentId);
  const edgeLinked = useWorkspace((s) =>
    edgeLinkedRoots(s.board?.items || []).has(motionRoots(s.board?.items || []).get(id)!),
  );
  return (
    <NodeResizer
      isVisible={!!selected && !locked && !grouped && !edgeLinked}
      keepAspectRatio={ratio}
      minWidth={64}
      minHeight={48}
      onResizeStart={() => useWorkspace.getState().checkpoint()}
      onResizeEnd={() => {
        const s = useWorkspace.getState();
        if (s.board) s.change(s.board.items, false);
      }}
    />
  );
};
const ImageNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  const name = useWorkspace((s) => s.project?.assets.find((a) => a.id === data.assetId)?.name);
  return (
    <div className="image-node">
      <Resize id={id} selected={selected} locked={data.locked} ratio />
      <img src={assetUrl(data.assetId!)} alt={name || 'Image'} draggable={false} />
      <BrowserDrag ids={[data.assetId!]} />
      <button
        className="reference-drag nodrag"
        title="Drag reference to Codex"
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          writeReferences(e.dataTransfer, [data.assetId!]);
        }}
      >
        ↗
      </button>
      {data.locked && <Lock className="lock-badge" size={13} />}
    </div>
  );
});
const TextNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  const [editing, setEditing] = useState(false);
  const editRequest = useWorkspace((s) => s.editRequest);
  useEffect(() => {
    if (editRequest?.id === id && !data.locked) {
      useWorkspace.getState().checkpoint();
      setEditing(true);
    }
  }, [editRequest, id, data.locked]);
  return (
    <div
      className="text-node"
      onDoubleClick={() => {
        if (!data.locked) {
          useWorkspace.getState().checkpoint();
          setEditing(true);
        }
      }}
    >
      <Resize id={id} selected={selected} locked={data.locked} />
      {editing ? (
        <textarea
          autoFocus
          className="nodrag nowheel"
          aria-label="Edit text card"
          value={data.text || ''}
          onBlur={() => {
            setEditing(false);
            void flush().catch(fail);
          }}
          onChange={(e) => {
            const s = useWorkspace.getState();
            s.change(
              s.board!.items.map((i) =>
                i.id === id ? { ...i, data: { ...i.data, text: e.target.value } } : i,
              ),
              false,
            );
          }}
        />
      ) : (
        <div className="text-content">{data.text || 'Double-click to write…'}</div>
      )}
    </div>
  );
});
const GroupNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => (
  <div className="group-node">
    <Resize id={id} selected={selected} locked={data.locked} />
    <span>{data.label || 'Reference group'}</span>
  </div>
));
const JobNode = memo(({ data }: NodeProps<CanvasNode>) => {
  const j = useWorkspace((s) => s.project?.jobs.find((j) => j.id === data.jobId));
  return (
    <div className={`job-node ${j?.state}`}>
      <LoaderCircle size={22} className={j?.state === 'running' ? 'spin' : ''} />
      <span>{j?.state.replace('-', ' ') || 'Queued'}</span>
      <small>{j?.progress || `Seed ${j?.seed ?? ''}`}</small>
    </div>
  );
});
const SpoilerNode = memo(({ id, selected }: NodeProps<CanvasNode>) => (
  <div className="spoiler-node" aria-label="Sensitive item hidden">
    <span>Sensitive</span>
  </div>
));
const nodeTypes = {
  image: ImageNode,
  text: TextNode,
  group: GroupNode,
  job: JobNode,
  spoiler: SpoilerNode,
};
export function Canvas({
  hand,
  inspect,
  openContext,
  closeContext,
}: {
  hand: boolean;
  inspect: (ids: string[]) => void;
  openContext: (target: ContextTarget) => void;
  closeContext: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState('');
  const board = useWorkspace((s) => s.board);
  useEffect(() => {
    setRevealed(false);
    setCaptureMessage('');
  }, [board?.id]);
  const hidden = useMemo(() => sensitiveIds(board?.items || []), [board?.items]);
  const selected = useWorkspace((s) => s.selected);
  const flow = useReactFlow();
  const dragging = useRef(false);
  const beforeDrag = useRef<CanvasItem[]>([]);
  const finishDrag = (event: MouseEvent | TouchEvent | React.MouseEvent, ids: string[]) => {
    const e = 'changedTouches' in event ? event.changedTouches[0] : event;
    dragging.current = false;
    setGuides([]);
    if (!e) return;
    const s = useWorkspace.getState();
    if (!s.board) return;
    const panel = document.querySelector('.codex-panel')?.getBoundingClientRect();
    if (
      panel &&
      panel.width > 0 &&
      e.clientX >= panel.left &&
      e.clientX <= panel.right &&
      e.clientY >= panel.top &&
      e.clientY <= panel.bottom
    ) {
      const assets = referenceIds(ids);
      // A reference drop copies the image; restore only positions changed by this gesture.
      const originals = new Map(beforeDrag.current.map((i) => [i.id, i]));
      s.change(
        s.board.items.map((i) =>
          originals.has(i.id) ? { ...i, position: originals.get(i.id)!.position } : i,
        ),
        false,
      );
      window.dispatchEvent(new CustomEvent(ATTACH_REFERENCES, { detail: assets }));
    } else {
      const items = dropIntoGroup(
        s.board.items,
        ids,
        flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      );
      if (items !== s.board.items) s.change(items, false);
    }
  };
  const blockedMotion = useMemo(() => {
    const roots = motionRoots(board?.items || []);
    const locks = motionLocks(board?.items || [], roots);
    return new Set([...roots].filter(([, root]) => locks.has(root)).map(([id]) => id));
  }, [board?.items]);
  const [grid, setGrid] = useState(() => localStorage.getItem('imagine.snapGrid') !== 'false');
  const [alignment, setAlignment] = useState(
    () => localStorage.getItem('imagine.snapAlignment') !== 'false',
  );
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const contacts = useMemo(
    () => (alignment ? availableEdgeContacts(board?.items || [], selected) : []),
    [board?.items, selected, alignment],
  );
  const linkedPairs = useMemo(
    () => edgePairs(board?.items || [], selected),
    [board?.items, selected],
  );
  const links = linkedPairs.map(([a, b]) => {
    const items = board!.items;
    const first = items.find((i) => i.id === a)!,
      second = items.find((i) => i.id === b)!;
    return { a, b, contact: edgeContacts(first, second, items)[0] };
  });
  useEffect(() => {
    localStorage.setItem('imagine.snapGrid', String(grid));
  }, [grid]);
  useEffect(() => {
    localStorage.setItem('imagine.snapAlignment', String(alignment));
  }, [alignment]);
  useEffect(() => {
    setGuides([]);
  }, [board?.id, grid, alignment]);
  const gesture = useRef<{
    start: Point;
    viewport: Viewport;
    id?: string;
    selection: boolean;
    moved: boolean;
    handled: boolean;
  } | null>(null);
  const requestContext = (point: Point, id?: string, selection = false) => {
    const s = useWorkspace.getState();
    if (!s.board) return;
    const ids = id ? contextSelection(s.selected, id) : selection ? s.selected : [];
    if (id) s.select(ids);
    openContext({
      boardId: s.board.id,
      ids: [...ids],
      screen: point,
      world: flow.screenToFlowPosition(point),
    });
  };
  const contextEvent = (e: React.MouseEvent | MouseEvent, id?: string, selection = false) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]'))
      return;
    e.preventDefault();
    e.stopPropagation();
    if (!gesture.current) requestContext({ x: e.clientX, y: e.clientY }, id, selection);
  };
  const nodes = useMemo<CanvasNode[]>(
    () =>
      (board?.items || []).map((i) => ({
        ...i,
        type: hidden.has(i.id) && (!revealed || capturing) ? 'spoiler' : i.type,
        style: { width: i.width, height: i.height, ...itemColorVariables(i.data.colors) },
        selected: selected.includes(i.id),
        draggable: !blockedMotion.has(i.id),
        selectable: true,
        deletable: false,
        zIndex: i.type === 'group' ? -1 : 0,
      })),
    [board?.items, selected, hidden, revealed, capturing, blockedMotion],
  );
  const changes = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const s = useWorkspace.getState();
      if (!s.board) return;
      const proposed = new Map<string, Point>();
      for (const c of changes) {
        if (c.type !== 'position' || !c.position) continue;
        // Pointer release repeats cached child-relative coordinates from the last drag tick.
        if (dragging.current && c.dragging === false) continue;
        if (c.dragging === undefined && s.board.items.find((i) => i.id === c.id)?.parentId)
          continue;
        proposed.set(c.id, c.position);
      }
      const rigid = rigidPositions(s.board.items, proposed);
      const snapped = snapPositions(s.board.items, rigid, s.board.viewport.zoom, grid, alignment);
      const motion = [...snapped.positions].filter(([id, p]) => {
        const old = s.board!.items.find((i) => i.id === id)!;
        return old.position.x !== p.x || old.position.y !== p.y;
      });
      if (
        motion.length &&
        !dragging.current &&
        changes.some((c) => c.type === 'position' && c.dragging === false)
      )
        s.checkpoint();
      changes = changes.filter((c) => c.type !== 'position');
      changes.push(
        ...motion.map(([id, position]) => ({ type: 'position' as const, id, position })),
      );
      if (dragging.current && proposed.size) setGuides(snapped.guides);
      const selection = new Set(s.selected);
      let items = s.board.items;
      let mutated = false;
      for (const c of changes) {
        if (c.type === 'select') {
          c.selected ? selection.add(c.id) : selection.delete(c.id);
        }
        if (c.type === 'position' && c.position) {
          items = items.map((i) => (i.id === c.id ? { ...i, position: c.position! } : i));
          mutated = true;
        }
        if (
          c.type === 'dimensions' &&
          c.dimensions &&
          c.resizing &&
          !s.board.items.find((i) => i.id === c.id)?.parentId &&
          !edgeLinkedRoots(s.board.items).has(motionRoots(s.board.items).get(c.id)!)
        ) {
          items = items.map((i) => (i.id === c.id ? { ...i, ...c.dimensions } : i));
          mutated = true;
        }
      }
      if (changes.some((c) => c.type === 'select')) s.select([...selection]);
      if (mutated) s.change(items, false);
    },
    [grid, alignment],
  );
  const drop = async (e: React.DragEvent) => {
    e.preventDefault();
    const boardId = useWorkspace.getState().board?.id;
    if (!boardId) return;
    const point = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    try {
      const assets = await readReferences(e.dataTransfer);
      if (useWorkspace.getState().board?.id !== boardId || !assets.length) return;
      useWorkspace.getState().addAssets(assets, point);
      const s = useWorkspace.getState();
      s.change(dropIntoGroup(s.board!.items, s.selected, point), false);
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div
      className={`canvas-wrap${capturing ? ' capturing' : ''}`}
      tabIndex={-1}
      onPointerDownCapture={(e) => {
        if (
          e.button !== 2 ||
          (e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]')
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        closeContext();
        const id = (e.target as HTMLElement).closest<HTMLElement>('.react-flow__node')?.dataset.id;
        gesture.current = {
          start: { x: e.clientX, y: e.clientY },
          viewport: flow.getViewport(),
          id,
          selection: !!(e.target as HTMLElement).closest(
            '.react-flow__nodesselection, .react-flow__nodesselection-rect',
          ),
          moved: false,
          handled: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMoveCapture={(e) => {
        const g = gesture.current;
        if (!g || g.handled || !(e.buttons & 2)) return;
        e.preventDefault();
        e.stopPropagation();
        g.moved ||= isRightDrag(g.start, { x: e.clientX, y: e.clientY });
        if (g.moved) {
          closeContext();
          void flow.setViewport({
            ...g.viewport,
            x: g.viewport.x + e.clientX - g.start.x,
            y: g.viewport.y + e.clientY - g.start.y,
          });
        }
      }}
      onPointerUpCapture={(e) => {
        const g = gesture.current;
        if (e.button !== 2 || !g) return;
        e.preventDefault();
        e.stopPropagation();
        g.moved ||= isRightDrag(g.start, { x: e.clientX, y: e.clientY });
        g.handled = true;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        if (!g.moved) requestContext(g.start, g.id, g.selection);
      }}
      onPointerCancel={() => {
        gesture.current = null;
        closeContext();
      }}
      onContextMenu={(e) => contextEvent(e)}
      onKeyDownCapture={(e) => {
        if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]'))
          return;
        if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
        e.preventDefault();
        e.stopPropagation();
        gesture.current = null;
        const focused = (e.target as HTMLElement).closest<HTMLElement>('.react-flow__node');
        const b = (focused || e.currentTarget).getBoundingClientRect();
        requestContext(
          { x: b.left + b.width / 2, y: b.top + b.height / 2 },
          focused?.dataset.id,
          !focused,
        );
      }}
      onDrop={drop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={changes}
        onPaneContextMenu={(e) => contextEvent(e)}
        onNodeContextMenu={(e, n) => contextEvent(e, n.id)}
        onSelectionContextMenu={(e) => contextEvent(e, undefined, true)}
        onMoveStart={closeContext}
        onlyRenderVisibleElements
        minZoom={0.08}
        maxZoom={4}
        defaultViewport={board?.viewport}
        viewport={board?.viewport}
        onViewportChange={(v) => useWorkspace.getState().viewport(v)}
        onNodeDragStart={() => {
          dragging.current = true;
          beforeDrag.current = structuredClone(useWorkspace.getState().board?.items || []);
          useWorkspace.getState().checkpoint();
        }}
        onSelectionDragStart={() => {
          dragging.current = true;
          beforeDrag.current = structuredClone(useWorkspace.getState().board?.items || []);
          useWorkspace.getState().checkpoint();
        }}
        onNodeDragStop={(e, node, nodes) =>
          finishDrag(e, nodes?.length ? nodes.map((n) => n.id) : [node.id])
        }
        onSelectionDragStop={(e, nodes) =>
          finishDrag(
            e,
            nodes.map((n) => n.id),
          )
        }
        onNodeDoubleClick={(_, n) => {
          if (n.type === 'image') inspect([n.data.assetId!]);
        }}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={!hand}
        panOnDrag={hand ? [0, 1] : [1]}
        panActivationKeyCode="Space"
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Control"
        deleteKeyCode={null}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_SIZE}
          size={1}
          color="var(--color-grid, #535448)"
          bgColor="var(--color-canvas, #111110)"
        />
      </ReactFlow>
      {board && (
        <>
          <div className="spoiler-controls">
            <button
              aria-pressed={revealed}
              disabled={capturing}
              onClick={() => setRevealed(!revealed)}
              title="Sensitive items are covered by default. Revealing affects this session only."
            >
              {revealed ? 'Hide sensitive items' : 'Reveal sensitive items'}
            </button>
            {window.location.protocol === 'file:' && (
              <button
                disabled={capturing}
                onClick={async () => {
                  setCapturing(true);
                  setCaptureMessage('');
                  closeContext();
                  try {
                    await new Promise<void>((resolve) =>
                      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
                    );
                    const r = document.querySelector('.canvas-wrap')!.getBoundingClientRect();
                    await window.imagine.captureCanvas({
                      x: Math.ceil(r.x),
                      y: Math.ceil(r.y),
                      width: Math.floor(r.width),
                      height: Math.floor(r.height),
                    });
                    setCaptureMessage('Safe canvas screenshot copied');
                  } catch (e) {
                    fail(e);
                  } finally {
                    setCapturing(false);
                  }
                }}
              >
                Copy safe screenshot
              </button>
            )}
            <span role="status">{captureMessage}</span>
          </div>
          <div className="snap-controls" role="toolbar" aria-label="Snapping controls">
            <button
              title="Snap to 24 px grid"
              aria-label="Snap to grid"
              aria-pressed={grid}
              className={grid ? 'active' : ''}
              onClick={() => setGrid(!grid)}
            >
              <Grid3X3 size={16} /> Grid
            </button>
            <button
              title="Snap to edges before centers and grid; lock touching edges to move together"
              aria-label="Alignment guides"
              aria-pressed={alignment}
              className={alignment ? 'active' : ''}
              onClick={() => setAlignment(!alignment)}
            >
              <ScanLine size={16} /> Guides
            </button>
          </div>
          <div className="snap-guides" aria-hidden="true">
            {guides.map((g) => (
              <div
                key={g.axis}
                className={`snap-guide ${g.axis}${g.edge ? ' sticky-aligned' : ''}`}
                style={
                  g.axis === 'x'
                    ? { left: g.value * board.viewport.zoom + board.viewport.x }
                    : { top: g.value * board.viewport.zoom + board.viewport.y }
                }
              />
            ))}
          </div>
          <div className="sticky-edge-controls" aria-label="Sticky edges">
            {contacts.map((contact) => {
              const x = contact.axis === 'x' ? contact.value : (contact.start + contact.end) / 2;
              const y = contact.axis === 'y' ? contact.value : (contact.start + contact.end) / 2;
              return (
                <div
                  key={`${contact.a}:${contact.b}:${contact.axis}`}
                  className="edge-join aligned"
                  style={{
                    left: x * board.viewport.zoom + board.viewport.x,
                    top: y * board.viewport.zoom + board.viewport.y,
                  }}
                >
                  <span className="edge-crosshair" aria-label="Edges aligned" />
                  {!dragging.current && (
                    <button
                      title="Lock edges"
                      onClick={() => {
                        const s = useWorkspace.getState();
                        if (s.board) {
                          const next = lockEdges(s.board.items, contact);
                          if (next !== s.board.items) s.change(next);
                        }
                      }}
                    >
                      <Lock size={12} /> Lock edges
                    </button>
                  )}
                </div>
              );
            })}
            {links
              .filter((link) => link.contact)
              .map(({ a, b, contact }) => {
                const c = contact!;
                const x = c.axis === 'x' ? c.value : (c.start + c.end) / 2;
                const y = c.axis === 'y' ? c.value : (c.start + c.end) / 2;
                return (
                  <div
                    key={`${a}:${b}`}
                    className="edge-join locked"
                    style={{
                      left: x * board.viewport.zoom + board.viewport.x,
                      top: y * board.viewport.zoom + board.viewport.y,
                    }}
                  >
                    <span className="edge-crosshair" aria-label="Edges locked" />
                    {!dragging.current && (
                      <button
                        title="Unlock edges"
                        onClick={() => {
                          const s = useWorkspace.getState();
                          if (s.board) s.change(unlockEdges(s.board.items, a, b));
                        }}
                      >
                        <Lock size={12} /> Unlock edges
                      </button>
                    )}
                  </div>
                );
              })}
            {links.length > 0 && !dragging.current && (
              <button
                className="unlock-all-edges"
                onClick={() => {
                  const s = useWorkspace.getState();
                  if (!s.board) return;
                  s.change(
                    links.reduce((items, { a, b }) => unlockEdges(items, a, b), s.board.items),
                  );
                }}
              >
                Unlock connected edges ({links.length})
              </button>
            )}
          </div>
        </>
      )}
      {board && !board.items.length && (
        <div className="empty-board">
          <div className="empty-icon">
            <ImageIcon size={26} />
          </div>
          <h2>A little space for your next idea.</h2>
          <p>Drop images anywhere. Add a note. Make it yours.</p>
          <span>
            Space to pan <b>·</b> Scroll to zoom <b>·</b> Ctrl + V to paste
          </span>
        </div>
      )}
    </div>
  );
}
