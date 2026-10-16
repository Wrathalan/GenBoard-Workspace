import { useState } from 'react';

export function panelWidth(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= 240 ? value : fallback;
  } catch { return fallback; }
}

export function PanelResize({ side, width, change }: {
  side: 'left' | 'right'; width: number; change: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const label = side === 'left' ? 'Resize Codex panel' : 'Resize browser panel';
  return <div role="separator" aria-label={label} aria-orientation="vertical"
    aria-valuenow={Math.round(width)} aria-valuemin={240} aria-valuemax={Math.max(240, window.innerWidth - 160)}
    tabIndex={0} className={`panel-resize ${side}${dragging ? ' dragging' : ''}`}
    onKeyDown={(e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      change(width + (e.key === 'ArrowRight' ? 20 : -20) * (side === 'left' ? 1 : -1));
    }}
    onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); }}
    onPointerMove={(e) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) change(side === 'left' ? e.clientX : window.innerWidth - e.clientX);
    }}
    onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); setDragging(false); }}
    onLostPointerCapture={() => setDragging(false)} />;
}
