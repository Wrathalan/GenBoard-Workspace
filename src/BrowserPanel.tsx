import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Globe, RotateCw, X } from 'lucide-react';
import type { EmbeddedBrowserState } from '../shared/embedded-browser';

export function BrowserPanel({ close }: { close: () => void }) {
  const [state, setState] = useState<EmbeddedBrowserState>({
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: '',
  });
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const surface = useRef<HTMLDivElement>(null);
  const currentURL = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const update = (next: EmbeddedBrowserState) => {
      if (!active) return;
      setState(next);
      if (currentURL.current !== next.url) {
        currentURL.current = next.url;
        setAddress(next.url === 'about:blank' ? '' : next.url);
      }
    };
    const unsubscribe = window.imagine.onBrowserState(update);
    void window.imagine
      .browserState()
      .then(update)
      .catch((e) => setError(String(e)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const element = surface.current!;
    let previous = '';
    const sync = () => {
      const rect = element.getBoundingClientRect();
      const obscured = document.querySelector(
        'dialog[open], .modal-backdrop, [role="menu"], .board-switcher-menu, .canvas-wrap.capturing',
      );
      const bounds =
        obscured || !state.url || state.url === 'about:blank'
          ? null
          : {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            };
      const key = JSON.stringify(bounds);
      if (key === previous) return;
      previous = key;
      void window.imagine.browserBounds(bounds).catch((e) => setError(String(e)));
    };
    const resize = new ResizeObserver(sync);
    resize.observe(element);
    const mutations = new MutationObserver(sync);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'class'],
    });
    window.addEventListener('resize', sync);
    sync();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', sync);
      void window.imagine.browserBounds(null).catch(() => {});
    };
  }, [state.url]);
  const command = (action: 'back' | 'forward' | 'reload' | 'stop') => {
    setError('');
    void window.imagine.browserCommand(action).catch((e) => setError(String(e)));
  };
  return (
    <aside className="embedded-browser" aria-label="Workspace browser">
      <header className="panel-title">
        <span>
          <Globe size={15} /> {state.title || 'Browser'}
        </span>
        <button aria-label="Close browser" onClick={close}>
          <X size={16} />
        </button>
      </header>
      <form
        className="browser-navigation"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          void window.imagine.browserNavigate(address).catch((e) => setError(String(e)));
        }}
      >
        <button
          type="button"
          aria-label="Browser back"
          disabled={!state.canGoBack}
          onClick={() => command('back')}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Browser forward"
          disabled={!state.canGoForward}
          onClick={() => command('forward')}
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          aria-label={state.loading ? 'Stop loading page' : 'Reload page'}
          disabled={!state.url}
          onClick={() => command(state.loading ? 'stop' : 'reload')}
        >
          {state.loading ? <X size={16} /> : <RotateCw size={16} />}
        </button>
        <input
          aria-label="Website address"
          placeholder="Enter a website address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button type="submit">Go</button>
      </form>
      <p className="browser-attach-hint">
        Drag an image’s globe handle into the website’s attachment area. Use library checkboxes to
        attach several images.
      </p>
      {(error || state.error) && (
        <p className="browser-error" role="alert">
          {error || state.error}
        </p>
      )}
      <div className="browser-surface" ref={surface}>
        {!state.url && (
          <div className="browser-empty">
            <Globe size={32} />
            <strong>Your websites, beside your workspace</strong>
            <p>
              Open a website above, then drag images from your canvas or library to attach them.
            </p>
            <small>Websites use the internet. Dropping files shares them with that website.</small>
          </div>
        )}
      </div>
    </aside>
  );
}
