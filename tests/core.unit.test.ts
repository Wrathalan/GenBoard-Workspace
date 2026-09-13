import { describe, expect, it } from 'vitest';
import { absolutePosition, duplicateItems, History, screenToWorld } from '../shared/board';
import {
  batchSeeds,
  builtinTemplates,
  compileWorkflow,
  parseWorkflow,
  validateWorkflow,
} from '../shared/workflow';
import { loopbackEndpoint } from '../electron/comfy';
import type { Capabilities, CanvasItem, GenerateRequest } from '../shared/types';
describe('canvas math and history', () => {
  it('preserves cursor position across translated and scaled viewports', () =>
    expect(screenToWorld({ x: 260, y: 140 }, { x: 100, y: -20, zoom: 0.5 })).toEqual({
      x: 320,
      y: 320,
    }));
  it('undoes and redoes independent snapshots', () => {
    const h = new History<number[]>();
    const original = [1];
    h.push(original);
    original.push(9);
    expect(h.undo([2])).toEqual([1]);
    expect(h.redo([1])).toEqual([2]);
    h.push([3]);
    expect(h.future).toEqual([]);
  });
  it('duplicates groups with remapped children and stable relative positions', () => {
    const items: CanvasItem[] = [
      { id: 'g', type: 'group', position: { x: 100, y: 150 }, width: 400, height: 400, data: {} },
      {
        id: 'a',
        type: 'image',
        parentId: 'g',
        position: { x: 20, y: 30 },
        width: 100,
        height: 100,
        data: { assetId: 'asset' },
      },
    ];
    const copies = duplicateItems(items, ['g']);
    expect(copies).toHaveLength(2);
    expect(copies[1].parentId).toBe(copies[0].id);
    expect(absolutePosition(copies[1], copies)).toEqual({ x: 152, y: 212 });
    expect(copies[1].data.assetId).toBe('asset');
  });
});
describe('workflow safety and compilation', () => {
  it('rejects editor JSON with export guidance', () =>
    expect(() => parseWorkflow({ nodes: [], links: [] })).toThrow('Save (API Format)'));
  it('compiles exact settings without mutating a reusable template', () => {
    const t = builtinTemplates()[0];
    const r = {
      prompt: 'A mountain',
      negative: 'grain',
      width: 768,
      height: 1024,
      checkpoint: 'sdxl.safetensors',
    } as GenerateRequest;
    const w = compileWorkflow(t, r, 142);
    expect(w['5'].inputs.seed).toBe(142);
    expect(w['2'].inputs.text).toBe('A mountain');
    expect(w['4'].inputs.width).toBe(768);
    expect(t.workflow['2'].inputs.text).toBe('');
  });
  it('records deterministic batch seeds and rejects malformed limits', () => {
    expect(batchSeeds(41, 4)).toEqual([41, 42, 43, 44]);
    expect(batchSeeds(null, 2, () => 0)).toEqual([0, 1]);
    expect(() => batchSeeds(1, 9)).toThrow();
    expect(() => batchSeeds(NaN, 2)).toThrow();
  });
  it('blocks remote nodes and reports missing dependencies', () => {
    const t = builtinTemplates()[0];
    t.workflow['9'] = { class_type: 'OpenAIImage', inputs: {} };
    const caps = {
      nodes: { OpenAIImage: { api_node: true, input: {} } },
    } as unknown as Capabilities;
    const issues = validateWorkflow(t, caps);
    expect(issues.some((i) => i.includes('Remote/API'))).toBe(true);
    expect(issues.some((i) => i.includes('Missing node'))).toBe(true);
  });
  it('restricts the endpoint to a loopback port', () => {
    expect(loopbackEndpoint(8188)).toBe('http://127.0.0.1:8188');
    expect(() => loopbackEndpoint(65536)).toThrow();
    expect(() => loopbackEndpoint(NaN)).toThrow();
  });
});
