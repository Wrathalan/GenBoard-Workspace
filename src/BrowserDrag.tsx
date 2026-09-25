import { Globe } from 'lucide-react';

export function BrowserDrag({
  ids,
  label = 'Drag image to browser',
}: {
  ids: string[];
  label?: string;
}) {
  if (!window.imagine.startAssetDrag) return null;
  return (
    <button
      className="browser-drag nodrag"
      title={label}
      aria-label={label}
      draggable
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.imagine.startAssetDrag!(ids);
      }}
    >
      <Globe size={14} />
    </button>
  );
}
