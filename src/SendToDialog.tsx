import { useEffect, useRef, useState } from 'react';

export function SendToDialog({ mode, destinations, submit, close }: {
  mode: 'folder' | 'board';
  destinations: { id: string; name: string }[];
  submit: (id: string) => Promise<void>;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    const focus = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); if (focus?.isConnected) focus.focus(); };
  }, []);
  const visible = destinations.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()));
  return <dialog ref={dialog} className="board-name-dialog send-to-dialog" aria-labelledby="send-to-title"
    onCancel={(e) => { e.preventDefault(); if (!busy) close(); }}>
    <h2 id="send-to-title">Send to {mode}</h2>
    <p>{mode === 'folder' ? 'Move the selection into a folder, keeping its layout.' : 'Copy the selection to another board. The originals stay here.'}</p>
    <label>Search destinations<input autoFocus aria-label="Search destinations" value={query}
      disabled={busy} onChange={(e) => setQuery(e.target.value)} /></label>
    <div className="send-to-destinations">
      {visible.map((d) => <button key={d.id} disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await submit(d.id); close(); }
        catch (e) { setError((e as Error).message || String(e)); setBusy(false); }
      }}>{d.name}</button>)}
      {!visible.length && <p role="status">No available {mode === 'folder' ? 'folders' : 'boards'}.</p>}
    </div>
    {error && <p role="alert" className="board-name-error">{error}</p>}
    {busy && <p role="status">Saving…</p>}
    <button disabled={busy} onClick={close}>Cancel</button>
  </dialog>;
}
