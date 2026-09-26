import { useEffect, useRef, useState } from 'react';
import { X, Send, Square, Plus, Settings2, Paperclip } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { flush, useWorkspace } from './store';
import { assetUrl } from './Canvas';
import { ATTACH_REFERENCES, REFERENCE_MIME, readReferences, referenceIds } from './references';

type Task = {
  id: string;
  boardId: string;
  boardName: string;
  text: string;
  refs: string[];
  position: { x: number; y: number };
};
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
  const navigationPending = useWorkspace((s) => s.navigationPending);
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
  const [queue, setQueue] = useState<Task[]>([]),
    [paused, setPaused] = useState(false);
  const [characterId, setCharacterId] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const running = useRef(false),
    starting = useRef(false),
    completed = useRef(false);
  const selectedCharacter = project?.library?.characters.find((c) => c.id === characterId);
  function attach(ids: string[]) {
    setAttachments((old) => {
      const next = [...new Set([...old, ...ids])];
      if (next.length > 5) {
        setStatus('Attach up to five images. Remove an attachment first.');
        return old;
      }
      return next;
    });
  }
  useEffect(() => {
    const handler = (e: Event) => attach((e as CustomEvent<string[]>).detail);
    window.addEventListener(ATTACH_REFERENCES, handler);
    return () => window.removeEventListener(ATTACH_REFERENCES, handler);
  }, []);
  const scroll = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setMessages([]);
    setAttachments([]);
    setCharacterId('');
  }, [board?.id]);
  useEffect(() => {
    if (nearBottom.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [messages, busy]);
  useEffect(
    () =>
      window.imagine.onCodexEvent((e) => {
        if (e.type === 'busy') return;
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
            useWorkspace.setState({ codexBusy: false });
            completed.current = true;
            if (!/^(completed|complete)$/i.test(e.text)) setPaused(true);
            if (!starting.current) {
              running.current = false;
              setBusy(false);
            }
            composer.current?.focus();
          }
          if (e.type === 'status' && e.text === 'Signed in.') setSignedIn(true);
          if (e.type === 'error') {
            setPaused(true);
            setMessages((old) => [
              ...old,
              { id: crypto.randomUUID(), role: 'activity', text: e.text },
            ]);
          }
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
  async function runTask(task: Task) {
    if (running.current || useWorkspace.getState().navigationPending) return;
    running.current = true;
    useWorkspace.setState({ codexBusy: true });
    starting.current = true;
    completed.current = false;
    setBusy(true);
    nearBottom.current = true;
    setMessages((v) => [...v, { id: task.id, role: 'user', text: task.text, assetIds: task.refs }]);
    try {
      await flush();
      await window.imagine.codexRun(task.boardId, task.text, {
        referenceAssetIds: task.refs,
        position: task.position,
      });
    } catch (e) {
      setStatus(String(e));
      setPaused(true);
      completed.current = true;
      setMessages((v) => [
        ...v,
        {
          id: crypto.randomUUID(),
          role: 'activity',
          text: `Request failed: ${String(e)}. Queue paused; this request was not retried.`,
        },
      ]);
    } finally {
      starting.current = false;
      if (completed.current) {
        running.current = false;
        useWorkspace.setState({ codexBusy: false });
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    if (
      busy ||
      navigationPending ||
      running.current ||
      paused ||
      !signedIn ||
      !queue.length ||
      queue[0].boardId !== board?.id
    )
      return;
    const task = queue[0];
    setQueue((v) => v.filter((t) => t.id !== task.id));
    void runTask(task);
  }, [queue, busy, paused, signedIn, board?.id, navigationPending]);
  function send() {
    if (!board || !prompt.trim() || !signedIn) return;
    const refs = [...new Set([...attachments, ...(selectedCharacter?.assetIds || [])])];
    const text =
      prompt +
      (selectedCharacter
        ? `\n\nCharacter reference — ${selectedCharacter.name}:\n${selectedCharacter.description}`
        : '');
    if (refs.length > 5) {
      setStatus('Attach up to five images including character references.');
      return;
    }
    if (text.length > 30000 || queue.length >= 50) {
      setStatus('Use fewer than 30,000 characters and at most 50 queued tasks.');
      return;
    }
    const rect = document.querySelector('.canvas-wrap')!.getBoundingClientRect();
    setQueue((v) => [
      ...v,
      {
        id: crypto.randomUUID(),
        boardId: board.id,
        boardName: board.name,
        text,
        refs,
        position: flow.screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }),
      },
    ]);
    setPrompt('');
    setAttachments([]);
    setCharacterId('');
  }
  return (
    <aside
      className={`codex-panel${dropActive ? ' reference-drop-active' : ''}`}
      aria-label="Codex agent panel"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropActive(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropActive(false);
        const folder = project?.folder;
        try {
          const raw = e.dataTransfer.getData(REFERENCE_MIME);
          const character = raw ? JSON.parse(raw).characterId : undefined;
          const assets = await readReferences(e.dataTransfer);
          if (useWorkspace.getState().project?.folder === folder) {
            attach(assets.map((a) => a.id));
            if (project?.library?.characters.some((c) => c.id === character))
              setCharacterId(character);
          }
        } catch (error) {
          setStatus(String(error));
        }
      }}
    >
      <header className="chat-header">
        <strong>Codex</strong>
        <div>
          <button
            title="New chat"
            aria-label="New chat"
            disabled={busy || queue.length > 0}
            onClick={() =>
              void action(async () => {
                await window.imagine.codexNewChat();
                setMessages([]);
                setPaused(false);
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
        {queue.length > 0 && (
          <section className="task-queue" aria-label="Queued Codex tasks">
            <div className="folder-row">
              <strong>{queue.length} queued</strong>
              <button onClick={() => setPaused(!paused)}>
                {paused ? 'Resume queue' : 'Pause queue'}
              </button>
              <button onClick={() => setQueue([])}>Clear queue</button>
            </div>
            {queue[0].boardId !== board?.id && <p>Switch to {queue[0].boardName} to continue.</p>}
            <small>Queue lasts for this project session.</small>
            {queue.map((task, index) => (
              <div key={task.id} className="queued-task">
                <span title={task.text}>
                  {index + 1}. {task.text}
                </span>
                <button
                  aria-label={`Move queued task ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() =>
                    setQueue((v) => {
                      const next = [...v];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return next;
                    })
                  }
                >
                  ↑
                </button>
                <button
                  aria-label={`Cancel queued task ${index + 1}`}
                  onClick={() => setQueue((v) => v.filter((t) => t.id !== task.id))}
                >
                  ×
                </button>
              </div>
            ))}
          </section>
        )}
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
        {!!project?.library?.characters.length && (
          <label>
            Character reference
            <select
              aria-label="Codex character reference"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
            >
              <option value="">None</option>
              {project.library.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {selectedCharacter && (
              <span className="chat-attachments">
                {selectedCharacter.assetIds.map((id) => (
                  <img
                    key={id}
                    src={assetUrl(id)}
                    alt={`Reference for ${selectedCharacter.name}`}
                  />
                ))}
              </span>
            )}
          </label>
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
            disabled={!referenceIds(selected).length}
            onClick={() => attach(referenceIds(selected))}
          >
            <Paperclip size={16} />
          </button>
          <span>{busy ? 'Enter to queue' : 'Enter to send'}</span>
          {busy && (
            <button
              title="Stop response"
              onClick={() => {
                setPaused(true);
                void action(() => window.imagine.codexStop());
              }}
            >
              <Square size={15} />
              Stop
            </button>
          )}
          <button
            title="Send message"
            aria-label={busy ? 'Queue task' : 'Send'}
            disabled={!signedIn || !prompt.trim() || !board}
            onClick={() => void send()}
          >
            <Send size={16} />
            {busy && 'Queue'}
          </button>
        </div>
        <small>Imagegen is online. Use “ComfyUI” for local generation.</small>
      </footer>
    </aside>
  );
}
