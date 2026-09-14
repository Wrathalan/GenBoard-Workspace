import { useEffect, useRef, useState } from 'react';
import { Palette, X } from 'lucide-react';
export const defaultColors = {
  canvas: '#111110',
  grid: '#535448',
  guides: '#c6d9aa',
  selection: '#bccdaa',
  accent: '#c6d9aa',
  surface: '#191917',
  text: '#e7e6e2',
  cardText: '#dadbd2',
  group: '#9ba68d',
};
type Colors = typeof defaultColors;
const labels: Record<keyof Colors, string> = {
  canvas: 'Canvas background',
  grid: 'Grid dots',
  guides: 'Alignment guides',
  selection: 'Selection highlights',
  accent: 'Interface accent',
  surface: 'Panels and toolbars',
  text: 'Interface text',
  cardText: 'Text cards',
  group: 'Group frames',
};
export function readColors(): Colors {
  try {
    const saved = JSON.parse(localStorage.getItem('imagine.colors') || '{}');
    return Object.fromEntries(
      Object.entries(defaultColors).map(([key, value]) => [
        key,
        typeof saved?.[key] === 'string' && /^#[0-9a-f]{6}$/i.test(saved[key]) ? saved[key] : value,
      ]),
    ) as Colors;
  } catch {
    return { ...defaultColors };
  }
}
export function Appearance() {
  const [colors, setColors] = useState(readColors);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    for (const [key, value] of Object.entries(colors))
      document.documentElement.style.setProperty(`--color-${key}`, value);
    localStorage.setItem('imagine.colors', JSON.stringify(colors));
  }, [colors]);
  return (
    <>
      <button
        className="appearance-button"
        title="Customize colors"
        aria-label="Customize colors"
        onClick={() => dialog.current?.showModal()}
      >
        <Palette size={17} />
      </button>
      <dialog
        ref={dialog}
        className="appearance-dialog"
        aria-label="Customize colors"
        onClick={(e) => {
          if (e.target === dialog.current) {
            const b = dialog.current.getBoundingClientRect();
            if (
              e.clientX < b.left ||
              e.clientX > b.right ||
              e.clientY < b.top ||
              e.clientY > b.bottom
            )
              dialog.current.close();
          }
        }}
      >
        <div className="panel-title">
          <strong>Workspace colors</strong>
          <button aria-label="Close colors" onClick={() => dialog.current?.close()}>
            <X size={17} />
          </button>
        </div>
        <p>Preview changes instantly. Saved on this computer for all projects.</p>
        {Object.entries(labels).map(([key, label]) => (
          <label className="color-row" key={key}>
            <span>{label}</span>
            <input
              type="color"
              aria-label={label}
              value={colors[key as keyof Colors]}
              onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
            />
            <code>{colors[key as keyof Colors]}</code>
          </label>
        ))}
        <footer>
          <button onClick={() => setColors({ ...defaultColors })}>Reset colors</button>
          <button onClick={() => dialog.current?.close()}>Done</button>
        </footer>
      </dialog>
    </>
  );
}
