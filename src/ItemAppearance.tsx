import { useRef, useEffect, useState } from 'react';
import { applyItemColors, defaultColors, type ItemColors } from '../shared/appearance';
import type { CanvasItem } from '../shared/types';
import { useWorkspace } from './store';
const labels: Record<keyof ItemColors, string> = {
  background: 'Item background',
  text: 'Item text',
  border: 'Item border',
  selection: 'Item selection',
  spoiler: 'Item sensitive cover',
  spoilerText: 'Item sensitive text',
};
export function ItemAppearance({ items }: { items: CanvasItem[] }) {
  const editing = useRef<string | null>(null);
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener('imagine-colors-changed', update);
    return () => window.removeEventListener('imagine-colors-changed', update);
  }, []);
  if (!items.length) return null;
  const locked = items.some((i) => i.data.locked);
  return (
    <section className="item-appearance" aria-label="Item colors">
      <div className="section-title">Item colors</div>
      <p className="micro">
        {locked
          ? 'Unlock selected items to customize colors.'
          : 'Overrides travel with the project. Images keep their original pixels.'}
      </p>
      <fieldset disabled={locked}>
        {Object.entries(labels).map(([key, label]) => {
          const k = key as keyof ItemColors;
          const values = items.map((i) => i.data.colors?.[k]);
          const mixed = values.some((v) => v !== values[0]);
          const inherited = !values[0];
          const token =
            k === 'background'
              ? items[0].type === 'group'
                ? 'groupBackground'
                : items[0].type === 'job'
                  ? 'jobBackground'
                  : 'cardBackground'
              : k === 'text'
                ? items[0].type === 'group'
                  ? 'group'
                  : items[0].type === 'job'
                    ? 'jobText'
                    : 'cardText'
                : k === 'border'
                  ? items[0].type === 'group'
                    ? 'group'
                    : 'cardBorder'
                  : k;
          const fallback =
            getComputedStyle(document.documentElement)
              .getPropertyValue(`--color-${token}`)
              .trim() || defaultColors[token as keyof typeof defaultColors];
          return (
            <label className="color-row" key={key}>
              <span>
                {label}
                <small>{mixed ? 'Mixed' : inherited ? 'Theme default' : values[0]}</small>
              </span>
              <input
                disabled={k === 'text' && items.every((i) => i.type === 'image')}
                title={
                  k === 'text' && items.every((i) => i.type === 'image')
                    ? 'Images have no editable text'
                    : undefined
                }
                type="color"
                aria-label={label}
                value={values[0] || fallback}
                onFocus={() => {
                  editing.current = null;
                }}
                onBlur={() => {
                  editing.current = null;
                }}
                onChange={(e) => {
                  const s = useWorkspace.getState();
                  if (!s.board) return;
                  const ids = items.map((i) => i.id);
                  const transaction = ids.join(',') + key;
                  s.change(
                    applyItemColors(s.board.items, ids, { [key]: e.target.value }),
                    editing.current !== transaction,
                  );
                  editing.current = transaction;
                }}
              />
            </label>
          );
        })}
        <button
          className="wide secondary"
          onClick={() => {
            const s = useWorkspace.getState();
            if (s.board)
              s.change(
                applyItemColors(
                  s.board.items,
                  items.map((i) => i.id),
                  null,
                ),
              );
          }}
        >
          Reset item colors
        </button>
      </fieldset>
    </section>
  );
}
