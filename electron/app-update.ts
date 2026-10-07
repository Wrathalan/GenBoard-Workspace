import type { AppUpdater } from 'electron-updater';
import type { AppUpdateState } from '../shared/app-update';
import { UPDATE_INTERVAL_MS } from '../shared/app-update';

export type UpdateDriver = Pick<
  AppUpdater,
  | 'on'
  | 'removeListener'
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'allowPrerelease'
  | 'allowDowngrade'
  | 'checkForUpdates'
  | 'downloadUpdate'
  | 'quitAndInstall'
>;

// All network and installer operations stay in the main process. The renderer
// receives only display state and cannot choose feeds, files, or commands.
export class AppUpdateService {
  private current: AppUpdateState;
  private listeners: ['download-progress' | 'error', (...args: any[]) => void][] = [];
  private startup?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;
  constructor(
    private driver: UpdateDriver,
    private enabled: boolean,
    private notify: (state: AppUpdateState) => void,
    private installBlocker: () => string | undefined,
  ) {
    this.current = { phase: enabled ? 'idle' : 'unsupported' };
    driver.autoDownload = false;
    driver.autoInstallOnAppQuit = false;
    driver.allowPrerelease = false;
    driver.allowDowngrade = false;
    this.listen('download-progress', ({ percent }: { percent: number }) => {
      if (this.current.phase === 'downloading' && Number.isFinite(percent))
        this.set({ ...this.current, percent: Math.max(0, Math.min(100, Math.floor(percent))) });
    });
    this.listen('error', () => {
      // check/download promises handle their errors. Installation errors arrive
      // through events because quitAndInstall is synchronous.
      if (this.current.phase === 'installing')
        this.set({
          ...this.current,
          phase: 'ready',
          message: 'Installation failed. Click to retry.',
        });
    });
  }
  private listen(event: 'download-progress' | 'error', listener: (...args: any[]) => void) {
    this.driver.on(event, listener);
    this.listeners.push([event, listener]);
  }
  state(): AppUpdateState {
    return { ...this.current };
  }
  private set(state: AppUpdateState) {
    this.current = state;
    this.notify(this.state());
  }
  start() {
    if (!this.enabled || this.startup || this.interval) return;
    this.startup = setTimeout(() => void this.check(), 15_000);
    this.interval = setInterval(() => void this.check(), UPDATE_INTERVAL_MS);
    this.startup.unref();
    this.interval.unref();
  }
  async check() {
    if (!this.enabled || !['idle', 'unsupported'].includes(this.current.phase)) return this.state();
    this.set({ phase: 'checking' });
    try {
      const result = await this.driver.checkForUpdates();
      this.set(
        result?.isUpdateAvailable
          ? { phase: 'available', version: result.updateInfo.version }
          : { phase: 'idle' },
      );
    } catch {
      // Offline or a release without updater metadata should not interrupt work.
      this.set({ phase: 'idle' });
    }
    return this.state();
  }
  async download() {
    if (!this.enabled) throw new Error('Updates are available only in the installed desktop app.');
    if (this.current.phase !== 'available') return this.state();
    this.set({ phase: 'downloading', version: this.current.version, percent: 0 });
    try {
      await this.driver.downloadUpdate();
      this.set({ phase: 'ready', version: this.current.version });
    } catch {
      this.set({
        phase: 'available',
        version: this.current.version,
        message: 'Download failed. Click to retry.',
      });
    }
    return this.state();
  }
  install(pendingCodexTasks: number) {
    if (!this.enabled) throw new Error('Updates are available only in the installed desktop app.');
    if (this.current.phase !== 'ready') throw new Error('Download the update first.');
    if (!Number.isInteger(pendingCodexTasks) || pendingCodexTasks < 0 || pendingCodexTasks > 50)
      throw new Error('Invalid queued task count.');
    const blocked = pendingCodexTasks
      ? 'Finish or clear queued Codex tasks before restarting.'
      : this.installBlocker();
    if (blocked) throw new Error(blocked);
    this.set({ phase: 'installing', version: this.current.version });
    try {
      this.driver.quitAndInstall(false, true);
    } catch {
      this.set({
        phase: 'ready',
        version: this.current.version,
        message: 'Installation failed. Click to retry.',
      });
    }
    return this.state();
  }
  close() {
    clearTimeout(this.startup);
    clearInterval(this.interval);
    for (const [event, listener] of this.listeners) this.driver.removeListener(event, listener);
  }
}
