import { FolderOpen, X } from 'lucide-react';
import type { RecentProject } from '../shared/types';
export function RecentProjects({
  items,
  open,
  forget,
  busy,
}: {
  items: RecentProject[];
  open: (id: string) => void;
  forget: (id: string) => void;
  busy: boolean;
}) {
  if (!items.length) return null;
  return (
    <section className="recent-projects" aria-label="Recent projects">
      <h3>Recent projects</h3>
      <div className="recent-list">
        {items.map((item) => (
          <div className="recent-project" key={item.id}>
            <button
              className="recent-open"
              disabled={busy}
              title={item.folder}
              aria-label={`Open recent project ${item.name}`}
              onClick={() => open(item.id)}
            >
              <FolderOpen size={16} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.missing ? 'Unavailable - locate with Open project' : item.folder}
                </small>
              </span>
            </button>
            <button
              className="recent-forget"
              disabled={busy}
              title="Remove from recent projects (keeps project files)"
              aria-label={`Forget recent project ${item.name}`}
              onClick={() => forget(item.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
