import { useState } from 'react';
import { emptyLibrary } from '../shared/library';
import type { Library as LibraryData, Point } from '../shared/types';
import { assetUrl } from './Canvas';
import { fail, useWorkspace } from './store';
import { readReferences, referenceIds, writeReferences } from './references';
import { BrowserDrag } from './BrowserDrag';

export function Library({ center }: { center: () => Point }) {
  const project = useWorkspace((s) => s.project)!;
  const library = project.library || emptyLibrary();
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [character, setCharacter] = useState<LibraryData['characters'][number] | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(next: LibraryData) {
    setBusy(true);
    try {
      await window.imagine.saveLibrary(next);
      const current = useWorkspace.getState().project;
      if (current?.folder === project.folder)
        useWorkspace.setState({ project: { ...current, library: next } });
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function move(e: React.DragEvent, target: string) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    try {
      const assets = await readReferences(e.dataTransfer);
      if (useWorkspace.getState().project?.folder !== project.folder || !assets.length) return;
      const assetFolders = { ...library.assetFolders };
      for (const a of assets) target ? (assetFolders[a.id] = target) : delete assetFolders[a.id];
      await save({ ...library, assetFolders });
    } catch (e) {
      fail(e);
    }
  }
  const currentFolder = library.folders.find((f) => f.id === folder);
  return (
    <section className="library" aria-label="Project library">
      <div className="section-title">
        Project library <small>{project.assets.length}</small>
      </div>
      <div className="folder-row">
        <button
          onClick={() => setFolder('')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => void move(e, '')}
        >
          All images
        </button>
        {currentFolder && (
          <button onClick={() => setFolder(currentFolder.parentId || '')}>↑ Parent</button>
        )}
      </div>
      {currentFolder && <strong>{currentFolder.name}</strong>}
      {library.folders
        .filter((f) => (f.parentId || '') === folder)
        .map((f) => (
          <button
            key={f.id}
            className="board-link folder-target"
            onClick={() => setFolder(f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => void move(e, f.id)}
          >
            📁 {f.name}
          </button>
        ))}
      <div className="folder-row">
        <input
          aria-label="Folder name"
          placeholder="Folder name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          disabled={busy || !name.trim()}
          onClick={async () => {
            if (
              await save({
                ...library,
                folders: [
                  ...library.folders,
                  { id: crypto.randomUUID(), name: name.trim(), parentId: folder || undefined },
                ],
              })
            )
              setName('');
          }}
        >
          New folder
        </button>
      </div>
      {currentFolder && (
        <div className="folder-row">
          <button
            disabled={busy || !name.trim()}
            onClick={() =>
              void save({
                ...library,
                folders: library.folders.map((f) =>
                  f.id === folder ? { ...f, name: name.trim() } : f,
                ),
              })
            }
          >
            Rename folder
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              const assetFolders = { ...library.assetFolders };
              for (const [id, f] of Object.entries(assetFolders))
                if (f === folder)
                  currentFolder.parentId
                    ? (assetFolders[id] = currentFolder.parentId)
                    : delete assetFolders[id];
              if (
                await save({
                  ...library,
                  assetFolders,
                  folders: library.folders
                    .filter((f) => f.id !== folder)
                    .map((f) =>
                      f.parentId === folder ? { ...f, parentId: currentFolder.parentId } : f,
                    ),
                })
              )
                setFolder(currentFolder.parentId || '');
            }}
          >
            Remove folder
          </button>
        </div>
      )}
      <div
        className="asset-grid"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void move(e, folder)}
      >
        {project.assets
          .filter((a) => !folder || library.assetFolders[a.id] === folder)
          .map((a) => (
            <div key={a.id} className="library-asset">
              <button
                title={`Add ${a.name} to board`}
                draggable
                onDragStart={(e) =>
                  writeReferences(e.dataTransfer, chosen.includes(a.id) ? chosen : [a.id])
                }
                onClick={() => useWorkspace.getState().addAssets([a], center())}
              >
                <img src={assetUrl(a.id)} alt={a.name} />
              </button>
              <BrowserDrag
                ids={chosen.includes(a.id) ? chosen : [a.id]}
                label={`Drag ${chosen.includes(a.id) && chosen.length > 1 ? `${chosen.length} images` : a.name} to browser`}
              />
              <input
                type="checkbox"
                aria-label={`Select reference ${a.name}`}
                checked={chosen.includes(a.id)}
                onChange={(e) =>
                  setChosen((v) =>
                    e.target.checked ? [...v, a.id] : v.filter((id) => id !== a.id),
                  )
                }
              />
            </div>
          ))}
      </div>
      <p className="micro">
        Drag images to a folder, a board group, or Codex. Drop files here to import them.
      </p>
      {chosen.length > 0 && (
        <label>
          Move {chosen.length} selected to folder
          <select
            aria-label="Move references to folder"
            value=""
            disabled={busy}
            onChange={(e) => {
              if (!e.target.value) return;
              const assetFolders = { ...library.assetFolders };
              for (const id of chosen)
                e.target.value === '__root'
                  ? delete assetFolders[id]
                  : (assetFolders[id] = e.target.value);
              void save({ ...library, assetFolders });
            }}
          >
            <option value="">Choose folder…</option>
            <option value="__root">Unfiled</option>
            {library.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="section-title">Character references</div>
      <button
        disabled={busy}
        onClick={() => {
          const ids = chosen.length ? chosen : referenceIds(useWorkspace.getState().selected);
          if (!ids.length || ids.length > 5)
            return fail(new Error('Select 1–5 library or board images for this character.'));
          setCharacter({ id: crypto.randomUUID(), name: '', description: '', assetIds: ids });
        }}
      >
        New character from selection
      </button>
      {library.characters.map((c) => (
        <div key={c.id} className="character-row">
          <button
            draggable
            onDragStart={(e) => writeReferences(e.dataTransfer, c.assetIds, c.id)}
            onClick={() => setCharacter(structuredClone(c))}
          >
            {c.name} · {c.assetIds.length} refs
          </button>
          <button
            aria-label={`Delete character ${c.name}`}
            disabled={busy}
            onClick={() =>
              void save({ ...library, characters: library.characters.filter((v) => v.id !== c.id) })
            }
          >
            ×
          </button>
        </div>
      ))}
      {character && (
        <div className="character-editor">
          <label>
            Character name
            <input
              aria-label="Character name"
              maxLength={100}
              value={character.name}
              onChange={(e) => setCharacter({ ...character, name: e.target.value })}
            />
          </label>
          <label>
            Identity and details
            <textarea
              aria-label="Character description"
              maxLength={10000}
              value={character.description}
              onChange={(e) => setCharacter({ ...character, description: e.target.value })}
            />
          </label>
          <div className="chat-attachments">
            {character.assetIds.map((id) => (
              <img key={id} src={assetUrl(id)} alt="Character reference" />
            ))}
          </div>
          <button
            onClick={() => {
              if (chosen.length > 0 && chosen.length <= 5)
                setCharacter({ ...character, assetIds: chosen });
            }}
          >
            Replace images with library selection
          </button>
          <div className="folder-row">
            <button
              disabled={busy || !character.name.trim()}
              onClick={async () => {
                if (
                  await save({
                    ...library,
                    characters: [
                      ...library.characters.filter((c) => c.id !== character.id),
                      { ...character, name: character.name.trim() },
                    ],
                  })
                )
                  setCharacter(null);
              }}
            >
              Save character
            </button>
            <button onClick={() => setCharacter(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
