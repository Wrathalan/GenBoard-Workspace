import { useEffect, useRef, useState } from 'react';

export function BoardNameDialog({
  mode,
  initialName,
  busy,
  blocked,
  error,
  submit,
  close,
}: {
  mode: 'create' | 'rename';
  initialName: string;
  busy: boolean;
  blocked: string;
  error: string;
  submit: (name: string) => Promise<boolean>;
  close: () => void;
}) {
  const [name, setName] = useState(initialName);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    returnFocus.current = document.activeElement as HTMLElement | null;
    element.showModal();
    input.current?.select();
    return () => {
      element.close();
    };
  }, []);
  const dismiss = () => {
    dialog.current?.close();
    close();
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
    else document.querySelector<HTMLButtonElement>('.board-switcher-trigger')?.focus();
  };
  const restricted = mode === 'create' ? blocked : '';
  return (
    <dialog
      ref={dialog}
      className="board-name-dialog"
      aria-labelledby="board-name-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) dismiss();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || restricted || !name.trim()) return;
          if (await submit(name.trim())) dismiss();
        }}
      >
        <h2 id="board-name-title">{mode === 'create' ? 'New board' : 'Rename board'}</h2>
        <label>
          Board name
          <input
            ref={input}
            aria-label="Board name"
            value={name}
            maxLength={100}
            required
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {restricted && (
          <p className="board-navigation-notice" role="status">
            {restricted}
          </p>
        )}
        {error && (
          <p className="board-name-error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="button" disabled={busy} onClick={dismiss}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy || !!restricted || !name.trim()}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create board' : 'Save name'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
