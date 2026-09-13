import Database from 'better-sqlite3';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Asset, Board, Job, Project, Template } from '../shared/types';
import { builtinTemplates, parseWorkflow } from '../shared/workflow';

export function contained(root: string, relative: string): string {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep))
    throw new Error('Asset path is outside this project.');
  // Resolve existing ancestors to reject junction/symlink escapes as well.
  let existing = target;
  while (!fs.existsSync(existing) && existing !== path.dirname(existing))
    existing = path.dirname(existing);
  const actual = fs.realpathSync(existing);
  const realBase = fs.realpathSync(base);
  if (actual !== realBase && !actual.startsWith(realBase + path.sep))
    throw new Error('Linked path is outside this project.');
  return target;
}
export class ProjectStore {
  db!: Database.Database;
  lock: string;
  folder: string;
  closed = false;
  constructor(folder: string, create: boolean, style: string) {
    this.folder = fs.realpathSync(folder);
    this.lock = contained(this.folder, '.imagine.lock');
    if (!create && !fs.existsSync(path.join(folder, 'workspace.sqlite')))
      throw new Error('This folder does not contain an Imagine project.');
    if (fs.existsSync(this.lock)) {
      let pid: number;
      try {
        pid = Number(JSON.parse(fs.readFileSync(this.lock, 'utf8')).pid);
      } catch {
        throw new Error(
          'Project lock is unreadable. Close other app instances before recovering its lock file.',
        );
      }
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (e) {
        alive = (e as NodeJS.ErrnoException).code !== 'ESRCH';
      }
      if (alive) throw new Error('This project is already open in another window.');
      fs.unlinkSync(this.lock);
    }
    fs.writeFileSync(this.lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
    try {
      this.db = new Database(contained(this.folder, 'workspace.sqlite'));
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      const version = this.db.pragma('user_version', { simple: true }) as number;
      if (version > 1)
        throw new Error('This project requires a newer version of Local Imagine Workspace.');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lineage (job_id TEXT NOT NULL, source_id TEXT NOT NULL, output_id TEXT NOT NULL, PRIMARY KEY(job_id, source_id, output_id)); PRAGMA user_version = 1;',
      );
      for (const dir of ['originals', 'outputs', 'thumbnails', 'workflows'])
        fs.mkdirSync(contained(this.folder, dir), { recursive: true });
      if (!this.getSetting('name'))
        this.db.transaction(() => {
          this.setting('name', path.basename(this.folder));
          this.setting('style', style);
          const b = this.createBoard('Untitled board');
          this.setting('activeBoardId', b.id);
          builtinTemplates().forEach((t) => this.put('templates', t));
        })();
    } catch (e) {
      this.db!?.close();
      fs.unlinkSync(this.lock);
      throw e;
    }
  }
  getSetting(key: string): string | undefined {
    return (
      this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        { value: string } | undefined
    )?.value;
  }
  setting(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run(key, value);
  }
  list<T>(table: 'boards' | 'assets' | 'templates' | 'jobs'): T[] {
    return (this.db.prepare(`SELECT json FROM ${table}`).all() as { json: string }[]).map((r) =>
      JSON.parse(r.json),
    );
  }
  put(table: 'boards' | 'assets' | 'templates' | 'jobs', value: { id: string }) {
    this.db
      .prepare(`INSERT OR REPLACE INTO ${table} VALUES (?, ?)`)
      .run(value.id, JSON.stringify(value));
  }
  snapshot(): Project {
    return {
      name: this.getSetting('name')!,
      folder: this.folder,
      boards: this.list('boards'),
      activeBoardId: this.getSetting('activeBoardId')!,
      assets: this.list('assets'),
      templates: this.list('templates'),
      jobs: this.list('jobs'),
      style: this.getSetting('style') || '',
    };
  }
  createBoard(name: string): Board {
    const board: Board = {
      id: randomUUID(),
      name: name.trim().slice(0, 100) || 'Untitled board',
      items: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    this.put('boards', board);
    return board;
  }
  saveBoard(
    board: Board,
    knownManagedIds: string[] = board.items.filter((i) => i.data.jobId).map((i) => i.id),
  ) {
    if (!this.list<Board>('boards').some((b) => b.id === board.id))
      throw new Error('Unknown board.');
    if (
      !Array.isArray(board.items) ||
      board.items.length > 10000 ||
      ![board.viewport.x, board.viewport.y, board.viewport.zoom].every(Number.isFinite) ||
      board.viewport.zoom <= 0
    )
      throw new Error('Invalid board.');
    const ids = new Set<string>();
    for (const item of board.items) {
      if (
        ids.has(item.id) ||
        !['image', 'text', 'group', 'job'].includes(item.type) ||
        ![item.position.x, item.position.y, item.width, item.height].every(Number.isFinite) ||
        item.width <= 0 ||
        item.height <= 0
      )
        throw new Error('Invalid canvas item.');
      ids.add(item.id);
    }
    for (const item of board.items) {
      let p = item.parentId;
      const visited = new Set([item.id]);
      while (p) {
        if (visited.has(p)) throw new Error('Cyclic group.');
        visited.add(p);
        const parent = board.items.find((i) => i.id === p);
        if (!parent || parent.type !== 'group') throw new Error('Missing group.');
        p = parent.parentId;
      }
    }
    this.db.transaction(() => {
      const current = this.list<Board>('boards').find((b) => b.id === board.id)!;
      const jobs = this.list<Job>('jobs');
      // Preserve outputs that arrived after the renderer's snapshot and retire stale placeholders.
      board.items = board.items.filter(
        (i) =>
          !(i.type === 'job' && jobs.find((j) => j.id === i.data.jobId)?.state === 'completed'),
      );
      for (const item of current.items)
        if (
          item.data.jobId &&
          !board.items.some((i) => i.id === item.id) &&
          (!knownManagedIds.includes(item.id) ||
            (item.type === 'job' &&
              jobs.some(
                (j) =>
                  j.id === item.data.jobId &&
                  !['completed', 'failed', 'cancelled'].includes(j.state),
              )))
        )
          board.items.push(item);
      this.put('boards', board);
    })();
  }
  async importAsset(bytes: Buffer, name: string, output = false): Promise<Asset> {
    if (bytes.length > 100 * 1024 * 1024) throw new Error('Images must be smaller than 100 MB.');
    const png = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    const jpeg = bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
    const webp =
      bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpeg && !webp) throw new Error('Use a PNG, JPEG, or WebP image.');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const found = this.list<Asset>('assets').find((a) => a.hash === hash);
    if (found) return found;
    const image = sharp(bytes, { limitInputPixels: 100_000_000 });
    const meta = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || !meta.width || !meta.height)
      throw new Error('Use a PNG, JPEG, or WebP image.');
    if ((meta.pages || 1) > 1) throw new Error('Animated images are not supported yet.');
    const rotated = meta.orientation && meta.orientation >= 5;
    const a: Asset = {
      id: hash,
      hash,
      name: name.slice(0, 200),
      width: rotated ? meta.height : meta.width,
      height: rotated ? meta.width : meta.height,
      path: `${output ? 'outputs' : 'originals'}/${hash}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`,
      thumbnail: `thumbnails/${hash}.webp`,
    };
    fs.writeFileSync(contained(this.folder, a.path), bytes);
    await image
      .rotate()
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(contained(this.folder, a.thumbnail));
    this.put('assets', a);
    return a;
  }
  saveTemplate(t: Template): Template {
    parseWorkflow(t.workflow);
    const existing = this.list<Template>('templates').find((x) => x.id === t.id);
    const unchanged =
      existing &&
      JSON.stringify([t.workflow, t.mappings, t.outputs]) ===
        JSON.stringify([existing.workflow, existing.mappings, existing.outputs]);
    const saved = {
      ...t,
      builtin: !!existing?.builtin,
      offlineVerified: !!(unchanged && existing.offlineVerified),
      offlineEvidence: unchanged ? existing.offlineEvidence : undefined,
    };
    this.put('templates', saved);
    return saved;
  }
  verifyOffline(templateId: string, jobId: string): Template {
    const t = this.list<Template>('templates').find((t) => t.id === templateId);
    const j = this.list<Job>('jobs').find((j) => j.id === jobId);
    if (
      !t ||
      !j ||
      j.state !== 'completed' ||
      j.templateId !== templateId ||
      JSON.stringify([t.workflow, t.mappings, t.outputs]) !==
        JSON.stringify([
          j.templateSnapshot?.workflow,
          j.templateSnapshot?.mappings,
          j.templateSnapshot?.outputs,
        ])
    )
      throw new Error(
        'Complete a run with this exact workflow revision before recording offline verification.',
      );
    t.offlineVerified = true;
    t.offlineEvidence = { jobId, verifiedAt: Date.now(), method: 'user-confirmed-network-block' };
    this.put('templates', t);
    return t;
  }
  saveJob(job: Job) {
    this.put('jobs', job);
    fs.writeFileSync(
      contained(this.folder, `workflows/${job.id}.json`),
      JSON.stringify(job, null, 2),
    );
  }
  close() {
    if (this.closed) return;
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
    fs.unlinkSync(this.lock);
    this.closed = true;
  }
}
