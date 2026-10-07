import { expect, it } from 'vitest';
import { copyCanvasSelection, pasteCanvasSelection } from '../shared/canvas-clipboard';
import type { CanvasItem } from '../shared/types';

const fixture = (): CanvasItem[] => [
  {
    id: 'group',
    type: 'group',
    position: { x: 100, y: 200 },
    width: 300,
    height: 200,
    data: { label: 'Cast', sensitive: true },
  },
  {
    id: 'image',
    type: 'image',
    parentId: 'group',
    position: { x: 10, y: 20 },
    width: 100.25,
    height: 80.5,
    data: { assetId: 'asset', edgeLinks: ['note', 'outside'] },
  },
  {
    id: 'note',
    type: 'text',
    parentId: 'group',
    position: { x: 110.25, y: 20 },
    width: 100,
    height: 80.5,
    data: { text: 'Original', edgeLinks: ['image'] },
  },
];
it('copies entire groups without shared mutable data and remaps hierarchy and internal links on paste', () => {
  const source = fixture();
  const copied = copyCanvasSelection(source, ['group', 'image']);
  source[2].data.text = 'Changed';
  expect(copied).toHaveLength(3);
  expect(copied[2].data.text).toBe('Original');
  const pasted = pasteCanvasSelection(copied, { x: 600, y: 400 });
  expect(pasted[0].position).toEqual({ x: 450, y: 300 });
  expect(pasted[1].position).toEqual({ x: 10, y: 20 });
  expect(pasted[1].width).toBe(100.25);
  expect(pasted[1].data.assetId).toBe('asset');
  expect(pasted[1].parentId).toBe(pasted[0].id);
  expect(pasted[1].data.edgeLinks).toEqual([pasted[2].id]);
  expect(pasted[2].data.edgeLinks).toEqual([pasted[1].id]);
  expect(pasted.every((i) => !source.some((s) => s.id === i.id))).toBe(true);
  expect(pasteCanvasSelection(copied, { x: 600, y: 400 })[0].id).not.toBe(pasted[0].id);
});
it('detaches selected children in world coordinates and keeps inherited sensitive marking', () => {
  const copied = copyCanvasSelection(fixture(), ['image', 'note']);
  expect(copied.every((i) => !i.parentId && i.data.sensitive)).toBe(true);
  expect(copied[0].position).toEqual({ x: 110, y: 220 });
  const pasted = pasteCanvasSelection(copied, { x: 0, y: 0 });
  expect(pasted[1].position.x - pasted[0].position.x).toBe(100.25);
});
it('rejects jobs inside copied groups instead of pasting invalid generation placeholders', () => {
  const source = fixture();
  source[2].type = 'job';
  expect(() => copyCanvasSelection(source, ['group'])).toThrow('generation jobs');
  expect(copyCanvasSelection(source, [])).toEqual([]);
});
