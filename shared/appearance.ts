import type { CanvasItem } from './types';
export const defaultColors = {
  overlay: '#000000',
  shadow: '#000000',
  canvas: '#111110',
  grid: '#535448',
  guides: '#c6d9aa',
  selection: '#bccdaa',
  accent: '#c6d9aa',
  surface: '#191917',
  text: '#e7e6e2',
  cardText: '#dadbd2',
  group: '#9ba68d',
  muted: '#999d91',
  border: '#393b34',
  input: '#181816',
  hover: '#33372c',
  onAccent: '#18230f',
  toolbar: '#191917',
  menu: '#20211d',
  dialog: '#191917',
  chat: '#191917',
  chatBubble: '#2a3022',
  success: '#acbf8f',
  warning: '#d6be82',
  danger: '#e4aa9d',
  viewer: '#0e100c',
  cardBackground: '#111110',
  cardBorder: '#535448',
  groupBackground: '#1b1d18',
  jobBackground: '#20231a',
  jobText: '#a3b88e',
  spoiler: '#242424',
  spoilerText: '#bbbbbb',
  spoilerBorder: '#555555',
};
export type Colors = typeof defaultColors;
export const colorSections: Record<string, Partial<Record<keyof Colors, string>>> = {
  Canvas: {
    canvas: 'Canvas background',
    grid: 'Grid dots',
    guides: 'Alignment guides',
    selection: 'Selection highlights',
  },
  Interface: {
    accent: 'Interface accent',
    onAccent: 'Accent button text',
    surface: 'Panels and top bar',
    toolbar: 'Toolbar background',
    menu: 'Context menu background',
    dialog: 'Dialog background',
    text: 'Interface text',
    muted: 'Secondary text',
    border: 'Interface borders',
    input: 'Input background',
    hover: 'Hover and active background',
    viewer: 'Image viewer background',
    overlay: 'Modal backdrop',
    shadow: 'Drop shadows',
  },
  Chat: { chat: 'Chat panel background', chatBubble: 'User message background' },
  Status: { success: 'Success color', warning: 'Warning color', danger: 'Error and delete color' },
  Cards: {
    cardText: 'Text cards',
    cardBackground: 'Text card background',
    cardBorder: 'Image and text borders',
    group: 'Group frames',
    groupBackground: 'Group background',
    jobBackground: 'Generation card background',
    jobText: 'Generation card text',
    spoiler: 'Sensitive cover background',
    spoilerText: 'Sensitive cover text',
    spoilerBorder: 'Sensitive cover border',
  },
};
export const isColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function normalizeColors(saved: unknown): Colors {
  const values = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(defaultColors).map(([key, fallback]) => [
      key,
      isColor(values[key]) ? values[key] : fallback,
    ]),
  ) as Colors;
}
function palette(base: Partial<Colors>, accent: string): Colors {
  return {
    ...defaultColors,
    ...base,
    accent,
    guides: accent,
    selection: accent,
    group: accent,
    success: accent,
    jobText: accent,
  };
}
export const themes: Record<string, Colors> = {
  'Original dark': { ...defaultColors },
  Midnight: palette(
    {
      canvas: '#101522',
      surface: '#192235',
      toolbar: '#192235',
      menu: '#202d43',
      dialog: '#192235',
      chat: '#151e30',
      chatBubble: '#273952',
      input: '#121b2a',
      hover: '#2d3d56',
      border: '#40516c',
      text: '#e5edf9',
      muted: '#9dafc7',
      cardText: '#dbe8fa',
      cardBackground: '#101522',
      cardBorder: '#40516c',
      groupBackground: '#182238',
      jobBackground: '#182238',
      viewer: '#0b101b',
      grid: '#3c4b63',
    },
    '#8ebaff',
  ),
  Plum: palette(
    {
      canvas: '#1b1422',
      surface: '#281d31',
      toolbar: '#281d31',
      menu: '#33263e',
      dialog: '#281d31',
      chat: '#241a2e',
      chatBubble: '#3c2a49',
      input: '#1e1626',
      hover: '#44314e',
      border: '#62456e',
      text: '#f1e5f6',
      muted: '#bca6c5',
      cardText: '#ead8f2',
      cardBackground: '#1b1422',
      cardBorder: '#62456e',
      groupBackground: '#302139',
      jobBackground: '#302139',
      viewer: '#150f1b',
      grid: '#554060',
    },
    '#d4a0eb',
  ),
  'Paper light': palette(
    {
      canvas: '#f1f0ea',
      surface: '#ffffff',
      toolbar: '#ffffff',
      menu: '#ffffff',
      dialog: '#ffffff',
      chat: '#f8f7f2',
      chatBubble: '#e3eadf',
      input: '#f7f7f2',
      hover: '#e1e8dc',
      border: '#b6bcae',
      text: '#20291e',
      muted: '#596652',
      onAccent: '#ffffff',
      cardText: '#263221',
      cardBackground: '#ffffff',
      cardBorder: '#88977d',
      groupBackground: '#e5eadf',
      jobBackground: '#e5eadf',
      viewer: '#e3e5df',
      grid: '#b8c0ad',
      spoiler: '#c9cfc3',
      spoilerText: '#263221',
      spoilerBorder: '#77886a',
      warning: '#866000',
      danger: '#aa302c',
    },
    '#446831',
  ),
};
export type ItemColors = Partial<
  Record<'background' | 'text' | 'border' | 'selection' | 'spoiler' | 'spoilerText', string>
>;
export function itemColorVariables(colors?: ItemColors): Record<string, string> {
  return {
    ...Object.fromEntries(
      ['background', 'text', 'border', 'selection', 'spoiler', 'spoilerText'].map((key) => [
        `--item-${key}`,
        'initial',
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(colors || {})
        .filter(
          ([key, value]) =>
            ['background', 'text', 'border', 'selection', 'spoiler', 'spoilerText'].includes(key) &&
            isColor(value),
        )
        .map(([key, value]) => [`--item-${key}`, value]),
    ),
  };
}
export function applyItemColors(
  items: CanvasItem[],
  ids: string[],
  patch: ItemColors | null,
): CanvasItem[] {
  if (items.some((i) => ids.includes(i.id) && i.data.locked)) return items;
  const clean =
    patch &&
    Object.fromEntries(
      Object.entries(patch).filter(
        ([key, value]) =>
          ['background', 'text', 'border', 'selection', 'spoiler', 'spoilerText'].includes(key) &&
          isColor(value),
      ),
    );
  return items.map((i) =>
    ids.includes(i.id)
      ? { ...i, data: { ...i.data, colors: clean ? { ...i.data.colors, ...clean } : undefined } }
      : i,
  );
}
