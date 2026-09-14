import { useEffect, useRef, useState } from 'react';
import { X, Send, Square, Plus, Settings2, Paperclip } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { flush, useWorkspace } from './store';
import { assetUrl } from './Canvas';
type Message = {
  id: string;
  role: 'user' | 'assistant' | 'activity';
  text: string;
  assetIds?: string[];
};
export function CodexPanel({ close }: { close: () => void }) {
  const board = useWorkspace((s) => s.board),
    project = useWorkspace((s) => s.project),
    selected = useWorkspace((s) => s.selected);
  const flow = useReactFlow();
  const [status, setStatus] = useState('Connect or sign in to start chatting.');
  const [signedIn, setSignedIn] = useState(false),
    [busy, setBusy] = useState(false),
    [connecting, setConnecting] = useState(false);
  const [settings, setSettings] = useState(false),
    [prompt, setPrompt] = useState(''),
    [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]),
    [imagegen, setImagegen] = useState<boolean | null>(null);
  const scroll = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setMessages([]);
    setAttachments([]);
  }, [board?.id]);
  useEffect(() => {
    if (nearBottom.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [messages, busy]);
  useEffect(
    () =>
      window.imagine.onCodexEvent((e) => {
        if (e.type === 'text')
          setMessages((old) => {
            const id = e.itemId || 'response';
            const found = old.find((m) => m.id === id);
            return found
              ? old.map((m) => (m.id === id ? { ...m, text: m.text + e.text } : m))
              : [...old, { id, role: 'assistant', text: e.text }];
          });
        else if (e.type === 'image' && e.assetId)
          setMessages((old) => [
            ...old,
            {
              id: e.itemId || crypto.randomUUID(),
              role: 'assistant',
              text: 'Added to your board',
              assetIds: [e.assetId!],
            },
          ]);
        else if (e.type === 'tool')
          setMessages((old) => [
            ...old,
            { id: crypto.randomUUID(), role: 'activity', text: e.text.replaceAll('_', ' ') },
          ]);
        else {
          setStatus(e.text);
          if (e.type === 'done') {
            setBusy(false);
            composer.current?.focus();
          }
          if (e.type === 'status' && e.text === 'Signed in.') setSignedIn(true);
          if (e.type === 'error')
            setMessages((old) => [
              ...old,
              { id: crypto.randomUUID(), role: 'activity', text: e.text },
            ]);
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
    setImagegen(a.imageGeneration ?? null);
    setStatus(a.label);
  }
  async function send() {
    if (!board || busy || !prompt.trim() || !signedIn) return;
    const text = prompt,
      refs = [...attachments];
    setBusy(true);
    nearBottom.current = true;
    setMessages((v) => [...v, { id: crypto.randomUUID(), role: 'user', text, assetIds: refs }]);
    setPrompt('');
    setAttachments([]);
    try {
      await flush();
      const rect = document.querySelector('.canvas-wrap')!.getBoundingClientRect();
      await window.imagine.codexRun(board.id, text, {
        referenceAssetIds: refs,
        position: flow.screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }),
      });
    } catch (e) {
      setStatus(String(e));
      setBusy(false);
      setPrompt(text);
      setAttachments(refs);
    }
  }
  return (
    <aside className="codex-panel" aria-label="Codex agent panel">
      <header className="chat-header">
        <strong>Codex</strong>
        <div>
          <button
            title="New chat"
            aria-label="New chat"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await window.imagine.codexNewChat();
                setMessages([]);
              })
            }
          >
            <Plus size={17} />
          </button>
          <button
            title="Chat settings"
            aria-label="Chat settings"
            onClick={() => setSettings((v) => !v)}
          >
            <Settings2 size={17} />
          </button>
          <button title="Close Codex" aria-label="Close Codex" onClick={close}>
            <X size={17} />
          </button>
        </div>
      </header>
      {settings && (
        <section className="chat-settings">
          <button disabled={connecting || busy} onClick={() => void action(refresh)}>
            Connect / refresh
          </button>
          {signedIn ? (
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
          ) : null}
          <button
            disabled={connecting || busy}
            onClick={() => void action(() => window.imagine.codexChoose())}
          >
            Choose codex.exe...
          </button>
          <p>
            Codex chats and imagegen use your account online. Attached images are sent to Codex.
            ComfyUI stays available for local generation.
          </p>
          <p>
            Imagegen:{' '}
            {imagegen === true
              ? 'Available'
              : imagegen === false
                ? 'Unavailable from this provider'
                : 'Check with Connect / refresh'}
          </p>
        </section>
      )}
      {!signedIn && (
        <div className="chat-signin">
          <button
            disabled={connecting}
            onClick={() => void action(() => window.imagine.codexLogin())}
          >
            Sign into Codex
          </button>
          <button disabled={connecting} onClick={() => void action(refresh)}>
            Connect / refresh
          </button>
        </div>
      )}
      <div
        className="chat-messages"
        ref={scroll}
        aria-label="Codex conversation"
        aria-live="polite"
        onScroll={() => {
          const el = scroll.current!;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!messages.length && (
          <div className="chat-empty">
            <h2>What would you like to create?</h2>
            <p>Chat, explore ideas, generate images, or arrange your board.</p>
          </div>
        )}
        {messages.map((m) => (
          <article
            key={m.id}
            className={`chat-message ${m.role}`}
            aria-label={
              m.role === 'user'
                ? 'Your message'
                : m.role === 'assistant'
                  ? 'Codex message'
                  : 'Workspace activity'
            }
          >
            {m.role !== 'activity' && <small>{m.role === 'user' ? 'You' : 'Codex'}</small>}
            {m.text && <div>{m.text}</div>}
            {m.assetIds?.map((id) => (
              <img
                key={id}
                src={assetUrl(id)}
                alt="Chat image"
                onDoubleClick={() => {
                  const item = useWorkspace
                    .getState()
                    .board?.items.find((i) => i.data.assetId === id);
                  if (item) void flow.fitView({ nodes: [{ id: item.id }], padding: 0.2 });
                }}
              />
            ))}
          </article>
        ))}
        {busy && <div className="chat-thinking">Codex is working...</div>}
      </div>
      <footer className="chat-composer">
        <div className="chat-status" role="status">
          {status}
        </div>
        {attachments.length > 0 && (
          <div className="chat-attachments">
            {attachments.map((id) => (
              <button
                key={id}
                title="Remove attachment"
                onClick={() => setAttachments((v) => v.filter((a) => a !== id))}
              >
                <img src={assetUrl(id)} alt="Attached reference" />
                <X size={12} />
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={composer}
          aria-label="Codex request"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Message Codex..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="chat-compose-actions">
          <button
            title="Attach selected images (sent to Codex)"
            aria-label="Attach selected images"
            disabled={
              busy || !board?.items.some((i) => selected.includes(i.id) && i.type === 'image')
            }
            onClick={() =>
              setAttachments(
                [
                  ...new Set(
                    board!.items
                      .filter((i) => selected.includes(i.id) && i.type === 'image')
                      .map((i) => i.data.assetId!),
                  ),
                ].slice(0, 5),
              )
            }
          >
            <Paperclip size={16} />
          </button>
          <span>Enter to send</span>
          {busy ? (
            <button
              title="Stop response"
              onClick={() => void action(() => window.imagine.codexStop())}
            >
              <Square size={15} />
              Stop
            </button>
          ) : (
            <button
              title="Send message"
              aria-label="Send"
              disabled={!signedIn || !prompt.trim() || !board}
              onClick={() => void send()}
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <small>Imagegen is online. Use “ComfyUI” for local generation.</small>
      </footer>
    </aside>
  );
}
