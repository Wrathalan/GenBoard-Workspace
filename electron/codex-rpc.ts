import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
export class CodexRpc {
  child: ChildProcessWithoutNullStreams;
  private seq = 0;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  onMessage: (m: any) => void = () => {};
  onExit: () => void = () => {};
  constructor(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
    this.child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: 'pipe' });
    this.child.stderr.resume();
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      try {
        const m = JSON.parse(line);
        if (!m.method && typeof m.id === 'number' && this.pending.has(m.id)) {
          const p = this.pending.get(m.id)!;
          this.pending.delete(m.id);
          clearTimeout(p.timer);
          m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
        } else this.onMessage(m);
      } catch {
        /* Ignore non-protocol diagnostic lines. */
      }
    });
    this.child.on('error', (e) => this.fail(e));
    this.child.on('exit', () => {
      this.fail(
        new Error(
          'Codex disconnected. Reconnect to continue; actions already completed are retained.',
        ),
      );
      this.onExit();
    });
  }
  private fail(e: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }
  send(m: unknown) {
    if (this.child.killed || !this.child.stdin.writable) throw new Error('Codex is not connected.');
    this.child.stdin.write(JSON.stringify(m) + '\n');
  }
  request(method: string, params: unknown = {}) {
    const id = ++this.seq;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out; no automatic retry was made.`));
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  close() {
    this.fail(new Error('Codex disconnected.'));
    this.child.kill();
  }
}
