import { WebContentsView, session, Menu, type BrowserWindow } from 'electron';
import {
  browserURL,
  type BrowserBounds,
  type EmbeddedBrowserState,
} from '../shared/embedded-browser';

export class EmbeddedBrowser {
  private view?: WebContentsView;
  private error = '';
  constructor(
    private win: BrowserWindow,
    private update: (state: EmbeddedBrowserState) => void,
  ) {
    win.webContents.on('did-start-loading', () => this.view?.setVisible(false));
    win.on('closed', () => this.close());
  }
  state(): EmbeddedBrowserState {
    const wc = this.view?.webContents;
    return {
      url: wc?.getURL() || '',
      title: wc?.getTitle() || '',
      loading: wc?.isLoading() || false,
      canGoBack: wc?.navigationHistory.canGoBack() || false,
      canGoForward: wc?.navigationHistory.canGoForward() || false,
      error: this.error,
    };
  }
  private ensureView() {
    if (this.view) return this.view;
    const browserSession = session.fromPartition(
      process.env.IMAGINE_TEST === '1' ? 'weave-browser-test' : 'persist:weave-browser',
    );
    browserSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !/^(https?:|wss?:|data:|blob:|about:)/.test(details.url) }),
    );
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        navigateOnDragDrop: false,
      },
    });
    this.view = view;
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    const wc = view.webContents;
    const publish = () => this.update(this.state());
    wc.on('did-start-loading', () => {
      this.error = '';
      publish();
    });
    wc.on('did-stop-loading', publish);
    wc.on('did-navigate', publish);
    wc.on('did-navigate-in-page', publish);
    wc.on('page-title-updated', publish);
    wc.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) {
        this.error = `Unable to load this page: ${description}`;
        publish();
      }
    });
    wc.on('render-process-gone', () => {
      this.error = 'The page stopped responding. Reload to try again.';
      publish();
    });
    const guard = (event: Electron.Event, url: string) => {
      try {
        browserURL(url);
      } catch {
        event.preventDefault();
      }
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
    wc.setWindowOpenHandler(({ url }) => {
      try {
        void this.navigate(browserURL(url));
      } catch {
        /* Never launch external protocols. */
      }
      return { action: 'deny' };
    });
    wc.on('context-menu', (_event, params) => {
      if (!params.isEditable) return;
      Menu.buildFromTemplate([
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ]).popup({ window: this.win });
    });
    return view;
  }
  async navigate(input: string) {
    const url = browserURL(input);
    try {
      await this.ensureView().webContents.loadURL(url);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ERR_ABORTED') {
        this.error = 'Unable to load this page. Check the address and connection.';
        this.update(this.state());
      }
    }
  }
  command(command: 'back' | 'forward' | 'reload' | 'stop') {
    const wc = this.view?.webContents;
    if (!wc) return;
    if (command === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (command === 'forward' && wc.navigationHistory.canGoForward())
      wc.navigationHistory.goForward();
    else if (command === 'reload') wc.reload();
    else if (command === 'stop') wc.stop();
  }
  bounds(bounds: BrowserBounds | null) {
    if (!bounds) {
      this.view?.setVisible(false);
      return;
    }
    if (
      !['x', 'y', 'width', 'height'].every((key) =>
        Number.isFinite(bounds[key as keyof BrowserBounds]),
      )
    )
      throw new Error('Invalid browser bounds.');
    const [width, height] = this.win.getContentSize();
    const zoom = this.win.webContents.getZoomFactor();
    const x = Math.max(0, Math.min(width, Math.round(bounds.x * zoom)));
    const y = Math.max(43, Math.min(height, Math.round(bounds.y * zoom)));
    const w = Math.max(0, Math.min(width - x, Math.round(bounds.width * zoom)));
    const h = Math.max(0, Math.min(height - y, Math.round(bounds.height * zoom)));
    const view = this.ensureView();
    view.setBounds({ x, y, width: w, height: h });
    view.setVisible(w > 0 && h > 0);
  }
  close() {
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = undefined;
  }
}
