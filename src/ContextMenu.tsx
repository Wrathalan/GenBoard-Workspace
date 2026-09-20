import { useLayoutEffect, useRef, useState } from 'react';
import {
  Copy,
  Palette,
  Download,
  FolderOpen,
  ImagePlus,
  Type,
  ClipboardPaste,
  Scan,
  Undo2,
  Redo2,
  Group,
  Ungroup,
  Lock,
  Trash2,
  Sparkles,
  Eye,
  AlignStartVertical,
  Pencil,
  RefreshCw,
  X,
  List,
  Layers,
  Maximize2,
} from 'lucide-react';
import type { MenuAction, MenuEntry } from '../shared/context-menu';
import type { Point } from '../shared/types';
const icons: Record<MenuAction, typeof Copy> = {
  import: ImagePlus,
  paste: ClipboardPaste,
  text: Type,
  selectAll: Layers,
  fitBoard: Maximize2,
  resetZoom: Scan,
  undo: Undo2,
  redo: Redo2,
  view: Eye,
  spoiler: Eye,
  colors: Palette,
  reference: Sparkles,
  copyImage: Copy,
  exportImage: Download,
  revealImage: FolderOpen,
  editText: Pencil,
  rename: Pencil,
  fitSelection: Scan,
  compare: Layers,
  jobDetails: List,
  cancel: X,
  retry: RefreshCw,
  reconcile: RefreshCw,
  duplicate: Copy,
  group: Group,
  ungroup: Ungroup,
  align: AlignStartVertical,
  lock: Lock,
  remove: Trash2,
};
export function ContextMenu({
  screen,
  entries,
  dismiss,
  execute,
}: {
  screen: Point;
  entries: MenuEntry[];
  dismiss: () => void;
  execute: (action: MenuAction) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(screen);
  useLayoutEffect(() => {
    const el = ref.current!;
    const bounds = document.querySelector('.app-shell')!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    setPosition({
      x: Math.max(bounds.left + 8, Math.min(screen.x, bounds.right - box.width - 8)),
      y: Math.max(bounds.top + 8, Math.min(screen.y, bounds.bottom - box.height - 8)),
    });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [screen.x, screen.y]);
  useLayoutEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) dismiss();
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [dismiss]);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Canvas context menu"
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const buttons = [
          ...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault();
          dismiss();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? buttons.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      {entries.map((entry, index) => {
        const Icon = icons[entry.action];
        return (
          <div key={entry.action}>
            {index > 0 && entries[index - 1].section !== entry.section && (
              <div className="context-separator" role="separator" />
            )}
            <button
              role="menuitem"
              aria-label={entry.label}
              disabled={!entry.enabled}
              aria-disabled={!entry.enabled}
              className={entry.danger ? 'danger' : ''}
              onClick={() => execute(entry.action)}
            >
              <Icon size={14} />
              <span>{entry.label}</span>
              {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
