import { useEffect, useState } from 'react';
import { X, Send, Square } from 'lucide-react';
import { flush, useWorkspace } from './store';
export function CodexPanel({ close }: { close: () => void }) {
  const board = useWorkspace((s) => s.board);
  const [status, setStatus] = useState('Connect to check your Codex sign-in.');
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [log, setLog] = useState('');
  useEffect(
    () =>
      window.imagine.onCodexEvent((e) => {
        if (e.type === 'text') setLog((v) => (v + e.text).slice(-100000));
        else if (e.type === 'tool') setLog((v) => v + `\n[Workspace: ${e.text}]\n`);
        else {
          setStatus(e.text);
          if (e.type === 'done') setBusy(false);
          if (e.type === 'status' && e.text === 'Signed in.') setSignedIn(true);
        }
      }),
    [],
  );
  async function action(fn: () => Promise<unknown>) {
    setConnecting(true);
    try {
      await fn();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setConnecting(false);
    }
  }
  async function refresh() {
    const a = await window.imagine.codexStatus();
    setSignedIn(a.signedIn);
    setStatus(a.label);
  }
  async function send() {
    if (!board) return;
    setBusy(true);
    try {
      await flush();
      setLog((v) => v + `\nYou: ${prompt}\n\n`);
      await window.imagine.codexRun(board.id, prompt);
      setPrompt('');
    } catch (e) {
      setStatus(String(e));
      setBusy(false);
    }
  }
  return (
    <aside className="panel right-panel codex-panel" aria-label="Codex agent panel">
      <div className="panel-title">
        <strong>Codex workspace agent</strong>
        <button title="Close Codex" onClick={close}>
          <X size={17} />
        </button>
      </div>
      <div className="panel-scroll">
        <p className="codex-notice">
          Codex uses your account online. Sending a request shares board text, layout, asset
          metadata and workflow/job details with OpenAI. Image files stay local. Generation runs
          through your local ComfyUI.
        </p>
        <div className="codex-auth">
          <button disabled={connecting || busy} onClick={() => void action(refresh)}>
            Connect / refresh
          </button>
          {!signedIn ? (
            <button
              disabled={connecting || busy}
              onClick={() => void action(() => window.imagine.codexLogin())}
            >
              Sign into Codex
            </button>
          ) : (
            <button
              disabled={connecting || busy}
              onClick={() =>
                void action(async () => {
                  await window.imagine.codexLogout();
                  setSignedIn(false);
                })
              }
            >
              Sign out
            </button>
          )}
          <button
            disabled={connecting || busy}
            onClick={() => void action(() => window.imagine.codexChoose())}
          >
            Choose codex.exe...
          </button>
        </div>
        <p role="status">{status}</p>
        <div className="codex-log" aria-label="Codex conversation" aria-live="polite">
          {log ||
            'Ask Codex to organize cards, add notes, or generate images. For generation, specify your installed checkpoint and workflow, or ask what is available.'}
        </div>
        <label>
          Request
          <textarea
            aria-label="Codex request"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Arrange the selected cards in a row..."
          />
        </label>
        <div className="codex-auth">
          <button
            disabled={!signedIn || busy || !prompt.trim() || !board}
            onClick={() => void send()}
          >
            <Send size={15} />
            Send
          </button>
          <button disabled={!busy} onClick={() => void action(() => window.imagine.codexStop())}>
            <Square size={14} />
            Stop
          </button>
        </div>
        <small>
          Edits use canvas undo. Stop interrupts Codex; already queued image jobs continue and can
          be cancelled from their job controls. Conversation history lasts for this app session.
        </small>
      </div>
    </aside>
  );
}
