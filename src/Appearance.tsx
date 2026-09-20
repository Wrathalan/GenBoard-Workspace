import { useEffect, useRef, useState } from 'react';
import { Palette, X } from 'lucide-react';
import {
  defaultColors,
  normalizeColors,
  colorSections,
  themes,
  type Colors,
} from '../shared/appearance';
export { defaultColors } from '../shared/appearance';
export function readColors(): Colors {
  try {
    return normalizeColors(JSON.parse(localStorage.getItem('imagine.colors') || '{}'));
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
    const rgb = colors.surface.slice(1).match(/../g)!.map(value => parseInt(value, 16));
    document.documentElement.style.colorScheme = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 140 ? 'light' : 'dark';
    localStorage.setItem('imagine.colors', JSON.stringify(colors));
    window.dispatchEvent(new Event('imagine-colors-changed'));
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
        <label className="theme-picker">
          Theme
          <select
            aria-label="Color theme"
            value={
              Object.keys(themes).find(
                (name) => JSON.stringify(themes[name]) === JSON.stringify(colors),
              ) || 'Custom'
            }
            onChange={(e) => {
              if (themes[e.target.value]) setColors({ ...themes[e.target.value] });
            }}
          >
            <option value="Custom" disabled>
              Custom
            </option>
            {Object.keys(themes).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {Object.entries(colorSections).map(([section, labels]) => (
          <details key={section} open>
            <summary>{section}</summary>
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
          </details>
        ))}
        <footer>
          <button onClick={() => setColors({ ...defaultColors })}>Reset colors</button>
          <button onClick={() => dialog.current?.close()}>Done</button>
        </footer>
      </dialog>
    </>
  );
}
