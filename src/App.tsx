import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  AlignStartVertical,
  ArrowUpRight,
  Check,
  Copy,
  FolderOpen,
  Frame,
  Grid2X2,
  Group,
  Hand,
  ImagePlus,
  Keyboard,
  Lock,
  Maximize2,
  Minus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  X,
} from 'lucide-react';
import { Canvas, assetUrl } from './Canvas';
import { Generation } from './Generation';
import { fail, flush, useWorkspace } from './store';
import { ContextMenu } from './ContextMenu';
import {
  contextEntries,
  selectionPermissions,
  type ContextTarget,
  type MenuAction,
  type SelectionAction,
} from '../shared/context-menu';
import type { Point } from '../shared/types';

export function App() {
  const project = useWorkspace((s) => s.project);
  const board = useWorkspace((s) => s.board);
  const selected = useWorkspace((s) => s.selected);
  const error = useWorkspace((s) => s.error);
  const saveStatus = useWorkspace((s) => s.saveStatus);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState<'generate' | 'inspect' | null>(null);
  const [hand, setHand] = useState(false);
  const [viewer, setViewer] = useState<string[]>([]);
  const [help, setHelp] = useState(false);
  const [referenceRequest, setReferenceRequest] = useState<{ id: string; at: number }>();
  const [jobRequest, setJobRequest] = useState<{ id: string; at: number }>();
  const [renameRequest, setRenameRequest] = useState<{ id: string; at: number }>();
  const [context, setContext] = useState<ContextTarget | null>(null);
  const canUndo = useWorkspace((s) => s.canUndo);
  const canRedo = useWorkspace((s) => s.canRedo);
  const returnFocus = useRef<HTMLElement | null>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const closeContext = useCallback(() => {
    setContext(null);
  }, []);
  const dismissContext = useCallback(() => {
    setContext(null);
    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
  }, []);
  const openContext = (target: ContextTarget) => {
    returnFocus.current = target.ids.length
      ? document.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${CSS.escape(target.ids[0])}"]`,
        )
      : document.querySelector<HTMLElement>('.canvas-wrap');
    setContext(target);
  };
  const flow = useReactFlow();
  const center = () =>
    flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const chooseProject = async (create: boolean) => {
    try {
      await flush();
      const p = await window.imagine.chooseProject(create);
      if (p) {
        useWorkspace.getState().load(p);
        setLeft(false);
        setRight(null);
        setReferenceRequest(undefined);
      }
    } catch (e) {
      fail(e);
    }
  };
  const importImages = async (point: Point = center()) => {
    const targetBoard = useWorkspace.getState().board?.id;
    try {
      const assets = await window.imagine.importImages();
      if (useWorkspace.getState().board?.id === targetBoard && assets.length)
        useWorkspace.getState().addAssets(assets, point);
    } catch (e) {
      fail(e);
    }
  };
  const pasteImage = async (point: Point = center()) => {
    const targetBoard = useWorkspace.getState().board?.id;
    try {
      const asset = await window.imagine.clipboardImage();
      if (!asset) throw new Error('No image on clipboard');
      if (useWorkspace.getState().board?.id === targetBoard)
        useWorkspace.getState().addAssets([asset], point);
    } catch (e) {
      fail(e);
    }
  };
  const addText = (point: Point = center()) => {
    const s = useWorkspace.getState();
    if (!s.board) return;
    const id = crypto.randomUUID();
    s.change([
      ...s.board.items,
      { id, type: 'text', position: point, width: 320, height: 180, data: { text: '' } },
    ]);
    s.select([id]);
  };
  const fitSelection = () => {
    const ids = useWorkspace.getState().selected;
    void flow.fitView({
      nodes: ids.length ? ids.map((id) => ({ id })) : undefined,
      padding: 0.2,
      duration: 200,
    });
  };
  const useReference = (id: string) => {
    setReferenceRequest({ id, at: Date.now() });
    setRight('generate');
  };
  const runSelectionAction = (name: SelectionAction) => {
    const s = useWorkspace.getState();
    if (!s.board || !s.project) return;
    const items = s.board.items.filter((i) => s.selected.includes(i.id));
    if (selectionPermissions(items, s.board.items, s.project.jobs)[name]) s[name]();
  };
  const executeMenu = async (name: MenuAction) => {
    const s = useWorkspace.getState();
    if (!context || !s.board || s.board.id !== context.boardId || !s.project)
      return dismissContext();
    const items = context.ids.map((id) => s.board!.items.find((i) => i.id === id));
    if (items.some((i) => !i)) return dismissContext();
    const targets = items as NonNullable<(typeof items)[number]>[];
    if (
      !contextEntries(targets, s.board.items, s.project.jobs, s.canUndo, s.canRedo).some(
        (e) => e.action === name && e.enabled,
      )
    )
      return dismissContext();
    if (context.ids.length) s.select(context.ids);
    const point = context.world;
    const item = targets[0];
    dismissContext();
    try {
      if (['duplicate', 'group', 'ungroup', 'align', 'lock', 'remove'].includes(name))
        return runSelectionAction(name as SelectionAction);
      switch (name) {
        case 'import':
          return await importImages(point);
        case 'paste':
          return await pasteImage(point);
        case 'text':
          return addText(point);
        case 'selectAll':
          return s.select(s.board.items.map((i) => i.id));
        case 'fitBoard':
          await flow.fitView({ padding: 0.2, duration: 200 });
          return;
        case 'resetZoom':
          await flow.zoomTo(1);
          return;
        case 'undo':
          return s.undo();
        case 'redo':
          return s.redo();
        case 'view':
          return setViewer([item.data.assetId!]);
        case 'reference':
          return useReference(item.data.assetId!);
        case 'copyImage':
          return await window.imagine.copyAssetImage(item.data.assetId!);
        case 'exportImage':
          await window.imagine.exportAsset(item.data.assetId!);
          return;
        case 'revealImage':
          return await window.imagine.revealAsset(item.data.assetId!);
        case 'editText':
          useWorkspace.setState({ editRequest: { id: item.id, at: Date.now() } });
          return;
        case 'rename':
          setRight('inspect');
          setRenameRequest({ id: item.id, at: Date.now() });
          return;
        case 'fitSelection':
          return fitSelection();
        case 'compare':
          return setViewer(targets.map((i) => i.data.assetId!));
        case 'jobDetails':
          setRight('generate');
          setJobRequest({ id: item.data.jobId!, at: Date.now() });
          return;
        case 'cancel':
          return await window.imagine.cancelJob(item.data.jobId!);
        case 'retry':
          await window.imagine.retryJob(item.data.jobId!);
          return;
        case 'reconcile':
          return await window.imagine.reconcile();
      }
    } catch (e) {
      fail(e);
    }
  };
  useEffect(() => {
    closeContext();
  }, [
    board?.id,
    project?.folder,
    board?.viewport.x,
    board?.viewport.y,
    board?.viewport.zoom,
    closeContext,
  ]);
  useEffect(() => {
    if (context && context.ids.some((id) => !board?.items.some((i) => i.id === id))) closeContext();
  }, [context, board?.items, closeContext]);
  useEffect(() => {
    if (renameRequest && right === 'inspect') {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [renameRequest, right]);
  useEffect(() => {
    window.imagine
      .currentProject()
      .then((p) => p && useWorkspace.getState().load(p))
      .catch(fail);
    const update = window.imagine.onUpdate((p) => useWorkspace.getState().update(p));
    const close = window.imagine.onClosing(() => {
      void flush()
        .then(async () => {
          const p = useWorkspace.getState().project;
          if (p) await window.imagine.saveStyle(p.style);
          window.imagine.finishClose();
        })
        .catch(fail);
    });
    return () => {
      update();
      close();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('[role="menu"]')) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]'))
        return;
      const s = useWorkspace.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        setViewer([]);
        setHelp(false);
        s.select([]);
      }
      if (viewer.length || help) return;
      if (!s.board) return;
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        const rect = document.querySelector('.canvas-wrap')!.getBoundingClientRect();
        const screen = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        openContext({
          boardId: s.board.id,
          ids: [...s.selected],
          screen,
          world: flow.screenToFlowPosition(screen),
        });
        return;
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flush().catch(fail);
      } else if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        s.select(s.board.items.map((i) => i.id));
      } else if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        runSelectionAction('duplicate');
      } else if (ctrl && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        runSelectionAction(e.shiftKey ? 'ungroup' : 'group');
      } else if (ctrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        void pasteImage();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        runSelectionAction('remove');
      } else if (e.key.toLowerCase() === 'v' && !ctrl) setHand(false);
      else if (e.key.toLowerCase() === 'h' && !ctrl) setHand(true);
      else if (e.key.toLowerCase() === 't' && !ctrl) addText();
      else if (e.key.toLowerCase() === 'f' && !ctrl) fitSelection();
      else if (e.key === '?') setHelp(true);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [flow, viewer.length, help]);
  const selectedItems = board?.items.filter((i) => selected.includes(i.id)) || [];
  const images = selectedItems.filter((i) => i.type === 'image');
  const action =
    (name: 'undo' | 'redo' | 'group' | 'ungroup' | 'duplicate' | 'align' | 'lock' | 'remove') =>
    () =>
      name === 'undo' || name === 'redo'
        ? useWorkspace.getState()[name]()
        : runSelectionAction(name);
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="top-left">
          <button
            title="Projects and boards"
            aria-label="Projects and boards"
            className={left ? 'active' : ''}
            onClick={() => setLeft(!left)}
          >
            <PanelLeft size={17} />
          </button>
          <div className="brand-mark">
            <Grid2X2 size={16} />
          </div>
          <span className="project-name">
            {project?.name || 'Local Imagine'}
            <span className="slash">/</span>
            <span>{board?.name || 'Workspace'}</span>
          </span>
        </div>
        <div className="top-right">
          <span className="save-status">
            <span className="status-dot online" />
            {saveStatus}
          </span>
          <button
            title="Fit board"
            onClick={() => void flow.fitView({ padding: 0.2, duration: 200 })}
          >
            <Maximize2 size={16} />
          </button>
          <button
            title="Inspector"
            className={right === 'inspect' ? 'active' : ''}
            onClick={() => setRight(right === 'inspect' ? null : 'inspect')}
          >
            <PanelRight size={17} />
          </button>
        </div>
      </header>
      <Canvas
        key={board?.id || 'empty'}
        hand={hand}
        inspect={setViewer}
        openContext={openContext}
        closeContext={closeContext}
      />
      {context && board && (
        <ContextMenu
          screen={context.screen}
          entries={contextEntries(
            context.ids.map((id) => board.items.find((i) => i.id === id)).filter((i) => !!i),
            board.items,
            project?.jobs || [],
            canUndo,
            canRedo,
          )}
          dismiss={dismissContext}
          execute={(name) => void executeMenu(name)}
        />
      )}
      {!project && (
        <div className="welcome">
          <div className="eyebrow">A LOCAL SPACE FOR VISUAL THINKING</div>
          <h1>
            Your ideas.
            <br />
            <span>Room to unfold.</span>
          </h1>
          <p>
            Collect references, explore directions, and create with your own models. Everything
            stays on this computer.
          </p>
          <div className="row">
            <button className="primary" onClick={() => void chooseProject(true)}>
              <Plus size={16} /> Create project
            </button>
            <button className="secondary" onClick={() => void chooseProject(false)}>
              <FolderOpen size={16} /> Open project
            </button>
          </div>
          <div className="welcome-foot">
            <span className="status-dot online" /> Offline by design <span>·</span> No account
            required
          </div>
        </div>
      )}
      {left && (
        <aside className="panel left-panel">
          <div className="panel-title">
            <span>Your workspace</span>
            <button title="Close projects" onClick={() => setLeft(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="panel-scroll">
            <button className="wide secondary" onClick={() => void chooseProject(true)}>
              <Plus size={15} /> New project
            </button>
            <button className="wide text-button" onClick={() => void chooseProject(false)}>
              <FolderOpen size={15} /> Open project folder
            </button>
            {project && (
              <>
                <div className="section-title">
                  Boards
                  <button
                    title="Add board"
                    onClick={async () => {
                      try {
                        await flush();
                        const b = await window.imagine.createBoard(
                          `Board ${project.boards.length + 1}`,
                        );
                        await window.imagine.activateBoard(b.id);
                        const p = await window.imagine.currentProject();
                        if (p) useWorkspace.getState().load(p);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                {project.boards.map((b) => (
                  <button
                    className={`board-link ${b.id === board?.id ? 'active' : ''}`}
                    key={b.id}
                    onClick={async () => {
                      try {
                        await flush();
                        await window.imagine.activateBoard(b.id);
                        const p = await window.imagine.currentProject();
                        if (p) useWorkspace.getState().load(p);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    <Frame size={14} />
                    {b.name}
                  </button>
                ))}
                <div className="section-title">
                  Project library <small>{project.assets.length}</small>
                </div>
                <div className="asset-grid">
                  {project.assets.map((a) => (
                    <button
                      key={a.id}
                      title={`Add ${a.name} to board`}
                      onClick={() => useWorkspace.getState().addAssets([a], center())}
                    >
                      <img src={assetUrl(a.id)} alt={a.name} />
                    </button>
                  ))}
                </div>
                <p className="micro path-label">{project.folder}</p>
              </>
            )}
          </div>
        </aside>
      )}
      {project && (
        <div key={project.folder} style={{ display: right === 'generate' ? 'contents' : 'none' }}>
          <Generation
            referenceRequest={referenceRequest}
            jobRequest={jobRequest}
            close={() => setRight(null)}
          />
        </div>
      )}
      {project && right === 'inspect' && (
        <aside className="panel right-panel inspector">
          <div className="panel-title">
            <span>Inspector</span>
            <button title="Close inspector" onClick={() => setRight(null)}>
              <X size={16} />
            </button>
          </div>
          <div className="panel-scroll">
            <label>
              Board name
              <input
                aria-label="Board name"
                value={board?.name || ''}
                onChange={(e) => {
                  useWorkspace.setState({ board: { ...board!, name: e.target.value } });
                  useWorkspace.getState().change(board!.items, false);
                }}
              />
            </label>
            <div className="section-title">{selected.length} selected</div>
            {!selected.length && (
              <p className="micro">Select an image, note, or group to inspect it.</p>
            )}
            {selectedItems.length === 1 && (
              <>
                {selectedItems[0].type === 'group' && (
                  <label>
                    Group name
                    <input
                      ref={renameInput}
                      aria-label="Group name"
                      disabled={selectedItems[0].data.locked}
                      value={selectedItems[0].data.label || ''}
                      onChange={(e) =>
                        useWorkspace
                          .getState()
                          .change(
                            board!.items.map((i) =>
                              i.id === selectedItems[0].id
                                ? { ...i, data: { ...i.data, label: e.target.value } }
                                : i,
                            ),
                          )
                      }
                    />
                  </label>
                )}
                <p className="micro">
                  {Math.round(selectedItems[0].width)} × {Math.round(selectedItems[0].height)}{' '}
                  canvas units
                </p>
                {images[0] && (
                  <>
                    <img
                      className="inspector-image"
                      src={assetUrl(images[0].data.assetId!)}
                      alt="Selected image"
                    />
                    <p className="micro">
                      {project.assets.find((a) => a.id === images[0].data.assetId)?.name}
                    </p>
                    <button
                      className="wide secondary"
                      onClick={() => {
                        useReference(images[0].data.assetId!);
                      }}
                    >
                      <Sparkles size={14} /> Use as reference
                    </button>
                  </>
                )}
              </>
            )}
            <div className="action-grid">
              <button onClick={action('duplicate')}>
                <Copy size={15} /> Duplicate
              </button>
              <button onClick={action('align')}>
                <AlignStartVertical size={15} /> Align top
              </button>
              <button onClick={action('group')}>
                <Group size={15} /> Group
              </button>
              <button onClick={action('ungroup')}>
                <Ungroup size={15} /> Ungroup
              </button>
              <button onClick={action('lock')}>
                <Lock size={15} /> Lock / unlock
              </button>
              <button onClick={action('remove')}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
            {images.length === 2 && (
              <button
                className="wide secondary"
                onClick={() => setViewer(images.map((i) => i.data.assetId!))}
              >
                Compare selected images
              </button>
            )}
          </div>
        </aside>
      )}
      {project && (
        <>
          <div className="zoom-control">
            <button title="Zoom out" onClick={() => void flow.zoomOut()}>
              <Minus size={15} />
            </button>
            <button
              className="zoom-value"
              title="Reset to 100%"
              onClick={() => void flow.zoomTo(1)}
            >
              {Math.round((board?.viewport.zoom || 1) * 100)}%
            </button>
            <button title="Zoom in" onClick={() => void flow.zoomIn()}>
              <Plus size={15} />
            </button>
          </div>
          <nav className="toolbar" aria-label="Canvas tools">
            <button
              title="Select (V)"
              aria-label="Select"
              className={!hand ? 'active' : ''}
              onClick={() => setHand(false)}
            >
              <MousePointer2 size={18} />
            </button>
            <button
              title="Hand (H / hold Space)"
              aria-label="Hand"
              className={hand ? 'active' : ''}
              onClick={() => setHand(true)}
            >
              <Hand size={18} />
            </button>
            <i />
            <button
              title="Import images"
              aria-label="Import images"
              onClick={() => void importImages()}
            >
              <ImagePlus size={18} />
            </button>
            <button title="Text card (T)" aria-label="Text card" onClick={() => addText()}>
              <Type size={18} />
            </button>
            <button
              title="Group selection (Ctrl+G)"
              aria-label="Group selection"
              onClick={action('group')}
            >
              <Group size={18} />
            </button>
            <i />
            <button title="Undo (Ctrl+Z)" onClick={action('undo')}>
              <Undo2 size={17} />
            </button>
            <button title="Redo (Ctrl+Y)" onClick={action('redo')}>
              <Redo2 size={17} />
            </button>
            <i />
            <button
              title="Generate with ComfyUI"
              aria-label="Generate with ComfyUI"
              className={`generate-tool ${right === 'generate' ? 'active' : ''}`}
              onClick={() => setRight(right === 'generate' ? null : 'generate')}
            >
              <Sparkles size={18} />
              <span>Generate</span>
            </button>
          </nav>
        </>
      )}
      <button className="help-button" title="Keyboard shortcuts" onClick={() => setHelp(true)}>
        <Keyboard size={16} />
      </button>
      {error && (
        <div className="error-toast" role="alert">
          <div>
            <strong>Something needs attention</strong>
            <p>{error.replace(/^Error invoking remote method '[^']+': Error: /, '')}</p>
          </div>
          <button title="Dismiss error" onClick={() => useWorkspace.setState({ error: '' })}>
            <X size={16} />
          </button>
        </div>
      )}
      {viewer.length > 0 && (
        <div className="modal-backdrop" onClick={() => setViewer([])}>
          <div
            className={`image-viewer ${viewer.length === 2 ? 'comparison' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="viewer-header">
              <span>{viewer.length === 2 ? 'Compare images' : 'Full-resolution image'}</span>
              <button title="Close viewer" onClick={() => setViewer([])}>
                <X size={20} />
              </button>
            </div>
            <div className="viewer-images">
              {viewer.map((id, index) => (
                <figure key={`${id}-${index}`}>
                  <div className="image-scroll">
                    <img
                      src={assetUrl(id, true)}
                      alt={project?.assets.find((a) => a.id === id)?.name || 'Full resolution'}
                      onClick={(e) => e.currentTarget.classList.toggle('actual-size')}
                    />
                  </div>
                  <figcaption>
                    {project?.assets.find((a) => a.id === id)?.name}{' '}
                    <small>Click image to toggle actual pixels</small>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">
              Make yourself at home
              <button title="Close shortcuts" onClick={() => setHelp(false)}>
                <X size={18} />
              </button>
            </div>
            {[
              ['Pan', 'Space + drag / H'],
              ['Select', 'V / Shift + drag'],
              ['Zoom', 'Mouse wheel'],
              ['Fit selection or board', 'F'],
              ['Add a text card', 'T'],
              ['Paste image', 'Ctrl + V'],
              ['Select all', 'Ctrl + A'],
              ['Duplicate', 'Ctrl + D'],
              ['Group / ungroup', 'Ctrl + G / Ctrl + Shift + G'],
              ['Undo / redo', 'Ctrl + Z / Ctrl + Y'],
              ['Delete selection', 'Delete'],
              ['Save', 'Ctrl + S'],
              ['Context menu', 'Right-click / Shift + F10'],
              ['Pan with right mouse', 'Right-drag'],
            ].map(([label, key]) => (
              <div className="shortcut" key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
