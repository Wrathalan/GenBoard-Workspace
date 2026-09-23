import type { Capabilities, GenerateRequest, Template, Workflow } from './types';
export function parseWorkflow(value: unknown): Workflow {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Choose an API-format workflow JSON object.');
  if ('nodes' in value || 'links' in value)
    throw new Error(
      'This is editor-format JSON. In ComfyUI, export the workflow using Save (API Format), then import that file.',
    );
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 2000)
    throw new Error('Workflow must contain 1–2000 nodes.');
  for (const [id, n] of entries)
    if (
      !/^[\w-]+$/.test(id) ||
      !n ||
      typeof n.class_type !== 'string' ||
      !n.inputs ||
      typeof n.inputs !== 'object' ||
      Array.isArray(n.inputs)
    )
      throw new Error(`Invalid API node ${id}.`);
  return value as Workflow;
}
export function validateWorkflow(t: Template, caps: Capabilities): string[] {
  const issues: string[] = [];
  parseWorkflow(t.workflow);
  for (const [id, node] of Object.entries(t.workflow)) {
    const info = caps.nodes[node.class_type];
    if (!info) {
      issues.push(
        `Missing node: ${node.class_type} (${id}). Install its dependency in ComfyUI separately.`,
      );
      continue;
    }
    if (
      info.api_node ||
      /api_nodes|partner|cloud/i.test(info.python_module || '') ||
      /^(OpenAI|Anthropic|Grok|Gemini|Runway|Kling|Luma|StabilityAPI|.*Cloud)/i.test(
        node.class_type,
      )
    )
      issues.push(`Remote/API node ${node.class_type} is unavailable in this offline workspace.`);
    const schema = { ...info.input.required, ...info.input.optional };
    for (const [key, spec] of Object.entries(schema)) {
      const v = node.inputs[key];
      if (
        Array.isArray(spec[0]) &&
        v !== undefined &&
        !Array.isArray(v) &&
        !(spec[0] as unknown[]).includes(v)
      )
        issues.push(`Node ${id}: ${key} “${v}” is unavailable. Select an installed value/model.`);
    }
  }
  for (const [key, binding] of Object.entries(t.mappings)) {
    if (!binding) continue;
    const n = t.workflow[binding.node];
    if (!n || !(binding.input in n.inputs)) issues.push(`Invalid ${key} mapping.`);
    else if (Array.isArray(n.inputs[binding.input]))
      issues.push(`${key} must map to a value, not a node connection.`);
    else {
      const info = caps.nodes[n.class_type];
      const spec = info && { ...info.input.required, ...info.input.optional }[binding.input];
      if (info && !spec) issues.push(`Unknown input for ${key}.`);
      else if (spec) {
        const kind = spec[0];
        if (['seed', 'width', 'height'].includes(key) && !['INT', 'FLOAT'].includes(String(kind)))
          issues.push(`${key} must map to a numeric input.`);
        if (['prompt', 'negative'].includes(key) && kind !== 'STRING')
          issues.push(`${key} must map to a text input.`);
      }
    }
  }
  if (!t.mappings.prompt) issues.push('Map a prompt input.');
  if (!t.mappings.seed) issues.push('Map a seed input so every attempt has a reproducible seed.');
  if (!t.outputs.length) issues.push('Select at least one image output node.');
  for (const id of t.outputs)
    if (!t.workflow[id] || !caps.nodes[t.workflow[id].class_type]?.output_node)
      issues.push(`Node ${id} is not an available output node.`);
  return issues;
}
export function compileWorkflow(template: Template, r: GenerateRequest, seed: number): Workflow {
  const w = structuredClone(template.workflow);
  const values = {
    prompt: r.prompt,
    negative: r.negative,
    seed,
    width: r.width,
    height: r.height,
    checkpoint: r.checkpoint,
  };
  for (const [key, value] of Object.entries(values)) {
    const b = template.mappings[key as keyof typeof values];
    if (b) w[b.node].inputs[b.input] = value;
  }
  return w;
}
export function batchSeeds(seed: number | null, count: number, random = Math.random): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 8)
    throw new Error('Batch count must be 1–8.');
  if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2 ** 48 - 9))
    throw new Error('Seed must be an integer between 0 and 281474976710647.');
  const first = seed ?? Math.floor(random() * (2 ** 48 - 9));
  return Array.from({ length: count }, (_, i) => first + i);
}
export function builtinTemplates(): Template[] {
  const base: Workflow = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed: 0,
        steps: 25,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'Weave' } },
  };
  const t: Template = {
    id: 'sdxl-text',
    name: 'SDXL · Text to image',
    workflow: base,
    mappings: {
      prompt: { node: '2', input: 'text' },
      negative: { node: '3', input: 'text' },
      seed: { node: '5', input: 'seed' },
      width: { node: '4', input: 'width' },
      height: { node: '4', input: 'height' },
      checkpoint: { node: '1', input: 'ckpt_name' },
    },
    outputs: ['7'],
    builtin: true,
    offlineVerified: true,
  };
  const img = structuredClone(t);
  img.id = 'sdxl-image';
  img.name = 'SDXL · Image to image';
  img.workflow['4'] = { class_type: 'LoadImage', inputs: { image: '' } };
  img.workflow['8'] = { class_type: 'VAEEncode', inputs: { pixels: ['4', 0], vae: ['1', 2] } };
  img.workflow['5'].inputs.latent_image = ['8', 0];
  img.workflow['5'].inputs.denoise = 0.65;
  delete img.mappings.width;
  delete img.mappings.height;
  img.mappings.image = { node: '4', input: 'image' };
  return [t, img];
}
