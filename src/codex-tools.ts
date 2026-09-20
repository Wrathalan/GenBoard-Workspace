import { motionRoots, motionLocks } from '../shared/group-motion';
import { useWorkspace, flush } from './store';
import { selectionPermissions } from '../shared/context-menu';
import type { WorkspaceToolCall } from '../shared/codex';
import type { GenerateRequest } from '../shared/types';
function number(v: unknown) {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1000000)
    throw new Error('Invalid coordinate.');
  return v;
}
function text(v: unknown) {
  if (typeof v !== 'string' || v.length > 30000) throw new Error('Invalid text.');
  return v;
}
export async function executeCanvasTool(call: WorkspaceToolCall, fit: (ids: string[]) => void) {
  const s = useWorkspace.getState(),
    b = s.board,
    p = s.project;
  if (!b || !p || b.id !== call.boardId) throw new Error('The active board changed.');
  const a = call.args;
  if (call.action === 'place_codex_image') {
    const latest = await window.imagine.currentProject();
    const asset = latest?.assets.find((a) => a.id === call.args.assetId);
    if (!asset || useWorkspace.getState().board?.id !== call.boardId)
      throw new Error('Generated image is in the asset library; target board changed.');
    useWorkspace.getState().addAssets([asset], call.args.position as { x: number; y: number });
    await flush();
    return { placed: asset.id };
  }
  if (call.action === 'snapshot')
    return {
      board: { id: b.id, name: b.name, viewport: b.viewport, items: b.items },
      selected: s.selected,
      assets: p.assets.map(({ id, name, width, height }) => ({ id, name, width, height })),
      workflows: p.templates,
      style: p.style,
      jobs: p.jobs.filter((j) => j.boardId === b.id),
      capabilities: (call as any).caps,
    };
  if (call.action === 'add_text') {
    const id = crypto.randomUUID();
    s.change([
      ...b.items,
      {
        id,
        type: 'text',
        position: { x: number(a.x), y: number(a.y) },
        width: 320,
        height: 180,
        data: { text: text(a.text) },
      },
    ]);
    await flush();
    return { id };
  }
  if (call.action === 'edit_text') {
    const item = b.items.find((i) => i.id === a.id);
    if (!item || item.type !== 'text' || item.data.locked)
      throw new Error('Choose an unlocked text card.');
    s.change(
      b.items.map((i) =>
        i.id === item.id ? { ...i, data: { ...i.data, text: text(a.text) } } : i,
      ),
    );
    await flush();
    return { edited: item.id };
  }
  if (call.action === 'generate') {
    const template = p.templates.find((t) => t.id === a.templateId);
    if (!template) throw new Error('Unknown workflow.');
    if (!template.builtin && !template.offlineVerified)
      throw new Error('Verify the imported workflow offline using the generation panel first.');
    const sourceIds = Array.isArray(a.sourceIds) ? a.sourceIds : [];
    if (
      sourceIds.some((id) => typeof id !== 'string' || !p.assets.some((asset) => asset.id === id))
    )
      throw new Error('Unknown source asset.');
    if (typeof a.checkpoint !== 'string' || !a.checkpoint)
      throw new Error('Choose a compatible installed checkpoint.');
    const prompt = text(a.prompt);
    const combined =
      a.styleEnabled === false
        ? prompt
        : `${p.style}\n\nCurrent request (overrides conflicting preset defaults): ${prompt}`;
    const request: GenerateRequest = {
      templateId: template.id,
      boardId: b.id,
      prompt: combined,
      negative: typeof a.negative === 'string' ? a.negative : '',
      checkpoint: a.checkpoint,
      seed: a.seed == null ? null : number(a.seed),
      width: number(a.width ?? 1024),
      height: number(a.height ?? 1024),
      count: number(a.count ?? 4),
      referenceAssetId: typeof a.referenceAssetId === 'string' ? a.referenceAssetId : undefined,
      sourceIds: sourceIds as string[],
      position: { x: number(a.x ?? 0), y: number(a.y ?? 0) },
    };
    await flush();
    const jobs = await window.imagine.generate(request);
    return {
      jobs: jobs.map((j) => ({ id: j.id, state: j.state, seed: j.seed })),
      finalPrompt: combined,
    };
  }
  if (call.action === 'undo' || call.action === 'redo') {
    s[call.action]();
    await flush();
    return { done: true };
  }
  const ids = Array.isArray(a.ids) ? a.ids : [];
  if (!ids.length || ids.some((id) => typeof id !== 'string' || !b.items.some((i) => i.id === id)))
    throw new Error('Provide valid card IDs.');
  const chosen = b.items.filter((i) => ids.includes(i.id));
  if (call.action === 'select') {
    s.select(ids as string[]);
    return { selected: ids };
  }
  if (call.action === 'fit') {
    fit(ids as string[]);
    return { done: true };
  }
  if (call.action === 'move') {
    const roots = motionRoots(b.items);
    const moving = new Set(ids.map((id) => roots.get(id as string)));
    if ([...motionLocks(b.items, roots)].some((id) => moving.has(id)))
      throw new Error('A selected group contains a locked card or job.');
    const dx = number(a.dx),
      dy = number(a.dy);
    s.change(
      b.items.map((i) =>
        moving.has(i.id) ? { ...i, position: { x: i.position.x + dx, y: i.position.y + dy } } : i,
      ),
    );
  } else {
    const permissions = selectionPermissions(chosen, b.items, p.jobs);
    if (
      !Object.hasOwn(permissions, call.action) ||
      !permissions[call.action as keyof typeof permissions]
    )
      throw new Error('Action is unavailable for this selection.');
    s.select(ids as string[]);
    s[call.action as keyof typeof permissions]();
  }
  await flush();
  return { done: true };
}
