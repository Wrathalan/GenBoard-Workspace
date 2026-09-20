import { expect, test } from 'vitest';
import {
  normalizeColors,
  defaultColors,
  themes,
  isColor,
  itemColorVariables,
  applyItemColors,
} from '../shared/appearance';
import type { CanvasItem } from '../shared/types';
const item = (id: string): CanvasItem => ({
  id,
  type: 'text',
  data: { text: 'Hello' },
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
});
test('legacy color preferences survive expansion and invalid values fall back', () => {
  expect(normalizeColors({ canvas: '#123456', text: 'url(secret)', spoiler: '#ffffff00' })).toEqual(
    { ...defaultColors, canvas: '#123456' },
  );
  expect(normalizeColors(null)).toEqual(defaultColors);
  for (const colors of Object.values(themes)) {
    expect(Object.keys(colors)).toEqual(Object.keys(defaultColors));
    expect(Object.values(colors).every(isColor)).toBe(true);
  }
});
test('item overrides isolate selection, reset cleanly, and reject nonopaque colors', () => {
  const a = item('a'),
    b = item('b');
  const changed = applyItemColors([a, b], ['a'], { background: '#123456', spoiler: '#00000000' });
  expect(changed[0].data.colors).toEqual({ background: '#123456' });
  expect(changed[1]).toBe(b);
  expect(a.data.colors).toBeUndefined();
  expect(applyItemColors(changed, ['a'], null)[0].data.colors).toBeUndefined();
  expect(itemColorVariables({ text: '#abcdef', spoiler: 'transparent' })).toMatchObject({
    '--item-text': '#abcdef',
    '--item-spoiler': 'initial',
    '--item-background': 'initial',
  });
  b.data.locked = true;
  expect(applyItemColors([a, b], ['a', 'b'], { text: '#ffffff' })).toEqual([a, b]);
});
