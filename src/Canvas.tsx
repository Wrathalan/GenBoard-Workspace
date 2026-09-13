import { memo, useCallback, useMemo, useState } from 'react';
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
import { ImageIcon, LoaderCircle, Lock } from 'lucide-react';
import { useWorkspace, fail, flush } from './store';
import type { CanvasItem, ItemData } from '../shared/types';
type CanvasNode = Node<ItemData, 'image' | 'text' | 'group' | 'job'>;
export const assetUrl = (id: string, original = false) =>
  `imagine://${id}/${original ? 'original' : 'thumbnail'}`;
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
}) => (
  <NodeResizer
    isVisible={!!selected && !locked}
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
const ImageNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  const name = useWorkspace((s) => s.project?.assets.find((a) => a.id === data.assetId)?.name);
  return (
    <div className="image-node">
      <Resize id={id} selected={selected} locked={data.locked} ratio />
      <img src={assetUrl(data.assetId!)} alt={name || 'Image'} draggable={false} />
      {data.locked && <Lock className="lock-badge" size={13} />}
    </div>
  );
});
const TextNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  const [editing, setEditing] = useState(false);
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
const nodeTypes = { image: ImageNode, text: TextNode, group: GroupNode, job: JobNode };
export function Canvas({ hand, inspect }: { hand: boolean; inspect: (ids: string[]) => void }) {
  const board = useWorkspace((s) => s.board);
  const selected = useWorkspace((s) => s.selected);
  const flow = useReactFlow();
  const nodes = useMemo<CanvasNode[]>(
    () =>
      (board?.items || []).map((i) => ({
        ...i,
        style: { width: i.width, height: i.height },
        selected: selected.includes(i.id),
        draggable: !i.data.locked && i.type !== 'job',
        selectable: true,
        deletable: false,
        zIndex: i.type === 'group' ? -1 : 0,
      })),
    [board?.items, selected],
  );
  const changes = useCallback((changes: NodeChange<CanvasNode>[]) => {
    const s = useWorkspace.getState();
    if (!s.board) return;
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
      if (c.type === 'dimensions' && c.dimensions && c.resizing) {
        items = items.map((i) => (i.id === c.id ? { ...i, ...c.dimensions } : i));
        mutated = true;
      }
    }
    if (changes.some((c) => c.type === 'select')) s.select([...selection]);
    if (mutated) s.change(items, false);
  }, []);
  const drop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!useWorkspace.getState().board) return;
    try {
      const files = await Promise.all(
        [...e.dataTransfer.files].map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      const assets = await window.imagine.importImages(files);
      useWorkspace
        .getState()
        .addAssets(assets, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div
      className="canvas-wrap"
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
        onlyRenderVisibleElements
        minZoom={0.08}
        maxZoom={4}
        defaultViewport={board?.viewport}
        viewport={board?.viewport}
        onViewportChange={(v) => useWorkspace.getState().viewport(v)}
        onNodeDragStart={() => useWorkspace.getState().checkpoint()}
        onNodeDoubleClick={(_, n) => {
          if (n.type === 'image') inspect([n.data.assetId!]);
        }}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={!hand}
        panOnDrag={hand ? true : [1, 2]}
        panActivationKeyCode="Space"
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Control"
        deleteKeyCode={null}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#393934"
          bgColor="#111110"
        />
      </ReactFlow>
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
