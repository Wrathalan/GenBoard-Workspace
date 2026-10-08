import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ImagePlus, Plus, X } from 'lucide-react';
import type { Asset, ReferenceCategory } from '../shared/types';
import { assetUrl } from './Canvas';
import { fail, useWorkspace } from './store';
import { readReferences, referenceIds, writeReferences } from './references';

const tabs: { id: ReferenceCategory; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'attire', label: 'Attire' },
  { id: 'environment', label: 'Environment' },
];

export function ReferenceTray({ inspect }: { inspect: (ids: string[]) => void }) {
  const [category, setCategory] = useState<ReferenceCategory>('character');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('imagine.referenceTrayCollapsed') === 'true');
  useEffect(() => {
    localStorage.setItem('imagine.referenceTrayCollapsed', String(collapsed));
  }, [collapsed]);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const board = useWorkspace((s) => s.board)!;
  const project = useWorkspace((s) => s.project)!;
  const selected = useWorkspace((s) => s.selected);
  const selectedAssets = referenceIds(selected);
  const ids = board.references?.[category] || [];
  const assets = ids.map((id) => project.assets.find((a) => a.id === id)).filter((a): a is Asset => !!a);
  const label = tabs.find((t) => t.id === category)!.label;

  async function add(load: () => Promise<Asset[]>) {
    if (busy) return;
    setBusy(true);
    try {
      const assets = await load();
      const current = useWorkspace.getState();
      if (current.project?.folder === project.folder && current.board?.id === board.id)
        current.addReferences(category, assets);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`reference-tray${hover ? ' reference-tray-hover' : ''}`}
      aria-label="Reference tray"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragOver={(e) => {
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setHover(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false);
      }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setHover(false);
        const transfer = e.dataTransfer;
        void add(() => readReferences(transfer));
      }}
    >
      <div className="reference-tray-header">
        <button aria-expanded={!collapsed} aria-controls="reference-tray-body"
          onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand reference tray' : 'Collapse reference tray'}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span>References</span>
        </button>
        <small>{tabs.reduce((count, tab) => count + (board.references?.[tab.id]?.length || 0), 0)}</small>
      </div>
      <div id="reference-tray-body" hidden={collapsed}>
        <div className="reference-tray-tabs" role="tablist" aria-label="Reference categories">
          {tabs.map((tab, index) => (
            <button key={tab.id} id={`reference-tab-${tab.id}`} role="tab"
              aria-selected={category === tab.id} aria-controls="reference-tray-panel"
              tabIndex={category === tab.id ? 0 : -1}
              onClick={() => setCategory(tab.id)}
              onKeyDown={(e) => {
                let next: number;
                if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
                else if (e.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = tabs.length - 1;
                else return;
                e.preventDefault();
                setCategory(tabs[next].id);
                document.getElementById(`reference-tab-${tabs[next].id}`)?.focus();
              }}>
              {tab.label}
            </button>
          ))}
        </div>
        <div id="reference-tray-panel" role="tabpanel" aria-labelledby={`reference-tab-${category}`}>
          <div className="reference-tray-images">
            {assets.map((asset) => (
              <div className="reference-tray-image" key={asset.id}>
                <button className="reference-tray-preview" aria-label={`Preview ${asset.name}`}
                  title={`${asset.name} · Drag to attach as a reference`} draggable
                  onClick={() => inspect([asset.id])}
                  onDragStart={(e) => { e.stopPropagation(); writeReferences(e.dataTransfer, [asset.id]); }}>
                  <img src={assetUrl(asset.id)} alt={asset.name} draggable={false} />
                </button>
                <button className="reference-tray-remove" aria-label={`Remove ${asset.name} from ${label} references`}
                  title="Remove reference" onClick={() => useWorkspace.getState().removeReference(category, asset.id)}>
                  <X size={12} />
                </button>
              </div>
            ))}
            {!assets.length && <p>Drop {label.toLowerCase()} images here</p>}
          </div>
          <div className="reference-tray-actions">
            <button disabled={busy} onClick={() => void add(() => window.imagine.importImages())}>
              <ImagePlus size={13} /> Import
            </button>
            <button disabled={busy || !selectedAssets.length}
              title="Copy selected board images into this reference tab"
              onClick={() => useWorkspace.getState().addReferences(category,
                project.assets.filter((a) => selectedAssets.includes(a.id)))}>
              <Plus size={13} /> Add selected
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
