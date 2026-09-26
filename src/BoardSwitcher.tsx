import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Frame, Pencil, Plus, Search } from 'lucide-react';
import type { Board } from '../shared/types';

export function BoardSwitcher({
  boards,
  board,
  busy,
  blocked,
  error,
  previous,
  choose,
  nameBoard,
}: {
  boards: Board[];
  board: Board;
  busy: boolean;
  blocked: string;
  error: string;
  previous?: Board;
  choose: (id: string) => Promise<boolean>;
  nameBoard: (mode: 'create' | 'rename') => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const results = boards.filter((item) =>
    (item.id === board.id ? board.name : item.name)
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  const dismiss = (focus = true) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };
  useEffect(() => {
    setOpen(false);
  }, [board.id]);
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
      return;
    }
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', outside, true);
    return () => window.removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => {
    const option = document.getElementById(`board-option-${results[activeIndex]?.id}`);
    if (!open || !option || !list.current) return;
    const row = option.getBoundingClientRect();
    const bounds = list.current.getBoundingClientRect();
    if (row.top < bounds.top) list.current.scrollTop -= bounds.top - row.top;
    else if (row.bottom > bounds.bottom) list.current.scrollTop += row.bottom - bounds.bottom;
  }, [open, activeIndex, query]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== 'b') return;
      const target = event.target as HTMLElement;
      if (
        document.querySelector('dialog[open], .modal-backdrop, [role="menu"], .capturing') ||
        target.closest(
          'input, textarea, select, [contenteditable=true], .codex-panel, .embedded-browser',
        )
      )
        return;
      event.preventDefault();
      setOpen(true);
      search.current?.focus();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const select = async (id: string) => {
    if (busy || blocked) return;
    if (await choose(id)) dismiss();
  };
  return (
    <div className="board-navigation">
      <button
        aria-label="Previous board"
        title={previous ? `Return to ${previous.name}` : 'No previous board'}
        disabled={!previous || busy || !!blocked}
        onClick={() => previous && void select(previous.id)}
      >
        <ArrowLeft size={14} aria-hidden="true" />
      </button>
      <div
        className="board-switcher"
        ref={root}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dismiss(false);
        }}
      >
        <button
          ref={trigger}
          className={`board-switcher-trigger ${open ? 'active' : ''}`}
          aria-label={`Switch board: ${board.name}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? 'board-switcher-popover' : undefined}
          title="Switch board (Ctrl+Shift+B)"
          onClick={() => setOpen(!open)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span>{board.name || 'Untitled board'}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </button>
        {open && (
          <div
            id="board-switcher-popover"
            className="board-switcher-menu"
            role="dialog"
            aria-label="Switch board"
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                event.preventDefault();
                dismiss();
              }
            }}
          >
            <div className="board-switcher-heading">
              Boards <span>{boards.length}</span>
            </div>
            <div className="board-search">
              <Search size={14} aria-hidden="true" />
              <input
                ref={search}
                role="combobox"
                aria-label="Search boards"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls="board-results"
                aria-activedescendant={
                  results.length ? `board-option-${results[activeIndex].id}` : undefined
                }
                placeholder="Search boards…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (results.length)
                      setActive(
                        (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) %
                          results.length,
                      );
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    if (results[activeIndex]) void select(results[activeIndex].id);
                  }
                }}
              />
            </div>
            {blocked && (
              <p className="board-navigation-notice" role="status">
                {blocked}
              </p>
            )}
            {error && (
              <p className="board-name-error" role="alert">
                {error}
              </p>
            )}
            <div
              ref={list}
              id="board-results"
              className="board-switcher-list"
              role="listbox"
              aria-label="Project boards"
            >
              {results.map((item, index) => (
                <div
                  key={item.id}
                  id={`board-option-${item.id}`}
                  role="option"
                  aria-selected={item.id === board.id}
                  aria-disabled={busy || !!blocked}
                  className={`board-option ${index === activeIndex ? 'highlighted' : ''}`}
                  title={item.id === board.id ? board.name : item.name}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  onClick={() => void select(item.id)}
                >
                  <Frame size={14} aria-hidden="true" />
                  <span>{(item.id === board.id ? board.name : item.name) || 'Untitled board'}</span>
                  {item.id === board.id && <Check size={14} aria-label="Current board" />}
                </div>
              ))}
            </div>
            {!results.length && (
              <p className="board-navigation-notice" role="status">
                No matching boards
              </p>
            )}
            <div className="board-switcher-divider" role="separator" />
            <button
              disabled={busy || !!blocked}
              onClick={() => {
                dismiss();
                nameBoard('create');
              }}
            >
              <Plus size={14} aria-hidden="true" /> New board
            </button>
            <button
              disabled={busy}
              onClick={() => {
                dismiss();
                nameBoard('rename');
              }}
            >
              <Pencil size={14} aria-hidden="true" /> Rename current board
            </button>
          </div>
        )}
      </div>
      {error && !open && (
        <p className="board-navigation-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
