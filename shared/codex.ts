export type CodexEvent = { type: 'status' | 'text' | 'tool' | 'error' | 'done'; text: string };
export type WorkspaceToolCall = {
  id: string;
  boardId: string;
  action: string;
  args: Record<string, unknown>;
};
export const workspaceActions = [
  'snapshot',
  'add_text',
  'edit_text',
  'move',
  'select',
  'duplicate',
  'group',
  'ungroup',
  'align',
  'lock',
  'remove',
  'undo',
  'redo',
  'fit',
  'connect',
  'generate',
  'cancel_job',
  'retry_job',
  'reconcile',
] as const;
export function parseToolArguments(raw: unknown) {
  const input = raw as { action?: unknown; parameters?: unknown };
  if (
    !input ||
    typeof input.action !== 'string' ||
    !(workspaceActions as readonly string[]).includes(input.action) ||
    typeof input.parameters !== 'string'
  )
    throw new Error('Invalid workspace command.');
  if (input.parameters.length > 100000) throw new Error('Command is too large.');
  const args = JSON.parse(input.parameters);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Parameters must be a JSON object.');
  return { action: input.action, args: args as Record<string, unknown> };
}
export const workspaceTool = {
  type: 'function',
  name: 'imagine_workspace',
  description: `Operate the open creative board. Call snapshot first; use returned IDs. parameters is a JSON object encoded as a string. Actions: snapshot {} returns board, selection, assets, workflows, jobs, style and ComfyUI capabilities; add_text {text,x,y}; edit_text {id,text}; move {ids,dx,dy}; select/duplicate/group/ungroup/align/lock/remove/fit {ids}; undo/redo {}; connect {port}; generate {templateId,prompt,negative,checkpoint,seed,width,height,count,referenceAssetId,sourceIds,x,y,styleEnabled}; cancel_job/retry_job {id}; reconcile {}. Positions are world coordinates. Generation requires a connected local server and an explicitly chosen compatible checkpoint. Never invent IDs or claim a queued job is completed.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: workspaceActions },
      parameters: { type: 'string' },
    },
    required: ['action', 'parameters'],
    additionalProperties: false,
  },
};
