import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ImagePlus, Plus, X } from 'lucide-react';
import type { Asset, ReferenceCategory, ReferenceObject } from '../shared/types';
import { assetUrl } from './Canvas';
import { fail, useWorkspace } from './store';
import { readReferences, referenceIds, writeReferences } from './references';

const tabs: { id: ReferenceCategory; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'attire', label: 'Attire' },
  { id: 'environment', label: 'Environment' },
];

export function ReferenceTray({ inspect }: { inspect: (ids: string[]) => void }) {
  const category = useWorkspace((s) => s.referenceCategory);
  const setCategory = (referenceCategory: ReferenceCategory) => useWorkspace.setState({ referenceCategory });
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('imagine.referenceTrayCollapsed') === 'true');
  useEffect(() => {
    localStorage.setItem('imagine.referenceTrayCollapsed', String(collapsed));
  }, [collapsed]);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const project = useWorkspace((s) => s.project)!;
  const selected = useWorkspace((s) => s.selected);
  const selectedAssets = referenceIds(selected);
  const references = (project.references || []).filter((r) => r.category === category);
  const [editing, setEditing] = useState<string | null>(null);
  const label = tabs.find((t) => t.id === category)!.label;

  async function add(load: () => Promise<Asset[]>) {
    if (busy) return;
    setBusy(true);
    try {
      const assets = await load();
      const current = useWorkspace.getState();
      if (current.project?.folder === project.folder)
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
        <small>{(project.references || []).length} objects</small>
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
          <ul className="reference-tray-list" aria-label={`${label} reference objects`}>
            {references.map((reference) => {
              const asset = project.assets.find((a) => a.id === reference.assetId);
              if (!asset) return null;
              return <li className="reference-tray-object" key={reference.id}>
                <button className="reference-tray-preview" aria-label={`Preview ${asset.name}`}
                  title={`${asset.name} · Drag to attach as a reference`} draggable
                  onClick={() => inspect([asset.id])}
                  onDragStart={(e) => { e.stopPropagation(); writeReferences(e.dataTransfer, [asset.id]); }}>
                  <img src={assetUrl(asset.id)} alt={asset.name} draggable={false} />
                </button>
                <div className="reference-tray-info">
                  <strong>{reference.name}</strong>
                  <small>{asset.width} × {asset.height} · {asset.name}</small>
                  <p>{reference.details || 'No details yet'}</p>
                  <button className="reference-tray-edit" onClick={() => setEditing(editing === reference.id ? null : reference.id)}
                    aria-expanded={editing === reference.id}>{editing === reference.id ? 'Close details' : 'Edit details'}</button>
                </div>
                <button className="reference-tray-remove" aria-label={`Remove ${asset.name} from ${label} references`}
                  title="Remove reference" onClick={() => useWorkspace.getState().removeReference(reference.id)}>
                  <X size={12} />
                </button>
                {editing === reference.id && <ReferenceDetails key={reference.id} reference={reference} />}
              </li>;
            })}
          </ul>
          {!references.length && <p className="reference-tray-empty">Drop {label.toLowerCase()} images here<br /><small>Organize shared references with names and details.</small></p>}
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

function ReferenceDetails({ reference }: { reference: ReferenceObject }) {
  const [name, setName] = useState(reference.name);
  const [details, setDetails] = useState(reference.details);
  return <form className="reference-tray-details" onSubmit={(e) => {
    e.preventDefault();
    useWorkspace.getState().editReference(reference.id, { name: name.trim(), details });
  }}>
    <label>Name<input aria-label="Reference name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></label>
    <label>Details<textarea aria-label="Reference details" value={details} maxLength={10000} rows={3}
      placeholder="Identity, materials, colors, setting, or continuity notes…" onChange={(e) => setDetails(e.target.value)} /></label>
    <button type="submit" disabled={!name.trim() || (name.trim() === reference.name && details === reference.details)}>Save details</button>
  </form>;
}
