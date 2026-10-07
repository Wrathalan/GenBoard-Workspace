import { useEffect, useRef, useState } from 'react';
import { Download, RotateCw, X } from 'lucide-react';
import type { AppUpdateState } from '../shared/app-update';
import { flush, useWorkspace } from './store';

export function UpdateNotice() {
  const [update, setUpdate] = useState<AppUpdateState>({ phase: 'idle' });
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const pending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let alive = true,
      received = false;
    const off = window.imagine.onAppUpdate((state) => {
      received = true;
      setUpdate(state);
    });
    void window.imagine
      .appUpdateState()
      .then((state) => {
        if (alive && !received) setUpdate(state);
      })
      .catch(() => {});
    return () => {
      alive = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (preparing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [preparing]);
  useEffect(() => {
    if (update.phase === 'ready' && update.message) setPreparing(false);
  }, [update]);
  if (['idle', 'checking', 'unsupported'].includes(update.phase)) return null;
  const downloading = update.phase === 'downloading';
  const ready = update.phase === 'ready';
  const installing = update.phase === 'installing' || preparing;
  const label = installing
    ? 'Restarting…'
    : downloading
      ? `Updating ${update.percent ?? 0}%`
      : ready
        ? 'Restart to update'
        : 'Update available';
  const message = error || update.message;
  async function activate() {
    if (pending.current || downloading || installing) return;
    pending.current = true;
    setError('');
    try {
      if (!ready) {
        setUpdate(await window.imagine.downloadAppUpdate());
        return;
      }
      const state = useWorkspace.getState();
      if (state.codexBusy)
        throw new Error('Finish or stop the current Codex turn before restarting.');
      if (state.codexQueued)
        throw new Error('Finish or clear queued Codex tasks before restarting.');
      if (state.navigationPending) throw new Error('Wait for board navigation to finish.');
      setPreparing(true);
      await flush();
      const latest = useWorkspace.getState();
      if (latest.project) await window.imagine.saveStyle(latest.project.style);
      const result = await window.imagine.installAppUpdate(latest.codexQueued);
      setUpdate(result);
      if (result.phase !== 'installing') setPreparing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreparing(false);
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="update-notice">
      <button
        className="update-notice-button"
        aria-label={label}
        title={message || `${label}${update.version ? ` · Weave ${update.version}` : ''}`}
        disabled={downloading || installing}
        onClick={() => void activate()}
      >
        {ready ? <RotateCw size={14} /> : <Download size={14} />}
        <span>{label}</span>
      </button>
      <span className="update-announcement" role="status" aria-live="polite">
        {downloading ? 'Downloading Weave update.' : label}
      </span>
      {message && (
        <div className="update-notice-message" role="status">
          <span>{message}</span>
          {error && (
            <button aria-label="Dismiss update message" onClick={() => setError('')}>
              <X size={13} />
            </button>
          )}
        </div>
      )}
      <dialog
        ref={dialog}
        className="update-restart-dialog"
        aria-label="Preparing update"
        onCancel={(e) => e.preventDefault()}
      >
        <p>
          {update.phase === 'installing'
            ? 'Restarting Weave to install the update…'
            : 'Saving your workspace before restarting…'}
        </p>
      </dialog>
    </div>
  );
}
