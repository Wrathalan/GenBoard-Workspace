import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Asset, Board, Capabilities, GenerateRequest, Job, Template } from '../shared/types';
import { batchSeeds, compileWorkflow, validateWorkflow } from '../shared/workflow';
import { contained, ProjectStore } from './project';
import { ComfyClient } from './comfy';

export class JobService {
  client?: ComfyClient;
  caps?: Capabilities;
  busy = false;
  timer?: NodeJS.Timeout;
  disposed = false;
  constructor(
    private store: ProjectStore,
    private emit: () => void,
  ) {
    for (const j of this.store.list<Job>('jobs'))
      if (['submitting', 'running'].includes(j.state) || (j.state === 'queued' && j.promptId)) {
        j.state = 'connection-unknown';
        j.error = 'Reconnecting will reconcile this attempt; it will not be resubmitted.';
        this.store.saveJob(j);
      }
  }
  async connect(port: number) {
    if (this.busy) throw new Error('Wait for the current queue operation before reconnecting.');
    this.client?.close();
    this.client = new ComfyClient(port, (e) => {
      if (!e.data?.prompt_id) return;
      const j = this.store
        .list<Job>('jobs')
        .find((j) => j.promptId === e.data.prompt_id && j.endpoint === this.client?.endpoint);
      if (j && ['running', 'connection-unknown'].includes(j.state) && e.type === 'progress') {
        j.progress = `Node ${e.data.node}: ${e.data.value} / ${e.data.max}`;
        this.store.put('jobs', j);
        this.emit();
      }
    });
    this.caps = await this.client.connect();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.tick(), 1800);
    await this.tick();
    return this.caps;
  }
  async enqueue(r: GenerateRequest): Promise<Job[]> {
    if (!this.client || !this.caps) throw new Error('Connect to local ComfyUI first.');
    const t = this.store.list<Template>('templates').find((t) => t.id === r.templateId);
    if (!t) throw new Error('Choose a workflow.');
    if (!t.builtin && !t.offlineVerified && !r.offlineTestConfirmed)
      throw new Error(
        'For an imported workflow’s first run, block external networking and confirm the offline test in the generation panel.',
      );
    const board = this.store.list<Board>('boards').find((b) => b.id === r.boardId);
    if (!board) throw new Error('Choose a board.');
    if (!r.prompt.trim()) throw new Error('Enter a prompt.');
    for (const n of [r.width, r.height])
      if (!Number.isInteger(n) || n < 64 || n > 4096 || n % 8)
        throw new Error('Dimensions must be multiples of 8 between 64 and 4096.');
    const seeds = batchSeeds(r.seed, r.count);
    if (
      t.mappings.image &&
      (!r.referenceAssetId ||
        !this.store.snapshot().assets.some((a) => a.id === r.referenceAssetId))
    )
      throw new Error('Select a reference image.');
    const prepared = compileWorkflow(t, r, seeds[0]);
    const issues = validateWorkflow({ ...t, workflow: prepared }, this.caps).filter(
      (s) =>
        !(
          t.mappings.image && s.includes(`Node ${t.mappings.image.node}: ${t.mappings.image.input}`)
        ),
    );
    if (issues.length) throw new Error(issues.join('\n'));
    const jobs: Job[] = seeds.map((seed, index) => ({
      id: randomUUID(),
      boardId: r.boardId,
      templateId: t.id,
      workflow: compileWorkflow(t, r, seed),
      outputs: t.outputs,
      prompt: r.prompt,
      seed,
      sourceIds: r.sourceIds,
      state: 'queued',
      endpoint: this.client!.endpoint,
      assetIds: [],
      createdAt: Date.now() + index,
      position: { x: r.position.x + index * 280, y: r.position.y },
      width: 240,
      height: Math.max(80, (240 * r.height) / r.width),
      referenceAssetId: r.referenceAssetId,
      imageBinding: t.mappings.image,
      templateSnapshot: structuredClone(t),
    }));
    this.store.db.transaction(() => {
      for (const j of jobs) {
        this.store.saveJob(j);
        board.items.push({
          id: j.id,
          type: 'job',
          position: j.position,
          width: j.width,
          height: j.height,
          data: { jobId: j.id, label: 'Queued' },
        });
      }
      this.store.put('boards', board);
    })();
    this.emit();
    setTimeout(() => void this.tick(), 50);
    return jobs;
  }
  async tick() {
    if (this.busy || !this.client || this.disposed) return;
    this.busy = true;
    try {
      const queue = await this.client.queue();
      const pending = this.store
        .list<Job>('jobs')
        .filter(
          (j) =>
            (['running', 'submitting', 'connection-unknown'].includes(j.state) ||
              (j.state === 'queued' && j.promptId)) &&
            j.endpoint === this.client!.endpoint,
        );
      for (const j of pending) {
        if (!j.promptId) {
          const entries = [...(queue.queue_running || []), ...(queue.queue_pending || [])];
          const match = entries.find((e: any[]) => e[3]?.local_imagine_job_id === j.id);
          if (match) j.promptId = match[1];
          else {
            const all = await this.client.history();
            const match = Object.entries<any>(all).find(
              ([, h]) => h.prompt?.[3]?.local_imagine_job_id === j.id,
            );
            if (match) j.promptId = match[0];
          }
          if (!j.promptId) {
            j.state = 'connection-unknown';
            j.error =
              'Submission outcome unknown. Inspect ComfyUI before retrying; automatic submission is paused.';
            this.store.saveJob(j);
            continue;
          }
        }
        const history = await this.client.history(j.promptId);
        const result = history[j.promptId];
        if (result) {
          const status = result.status;
          if (status?.status_str === 'error') {
            j.state = status.messages?.some((m: any[]) => m[0] === 'execution_interrupted')
              ? 'cancelled'
              : 'failed';
            j.error = JSON.stringify(status.messages).slice(0, 2000);
            this.store.saveJob(j);
            continue;
          }
          if (status?.completed === true || status?.status_str === 'success')
            await this.ingest(j, result);
        } else if (
          [...(queue.queue_running || []), ...(queue.queue_pending || [])].some(
            (e: any[]) => e[1] === j.promptId,
          )
        ) {
          j.state = (queue.queue_running || []).some((e: any[]) => e[1] === j.promptId)
            ? 'running'
            : 'queued';
          j.progress = j.state === 'queued' ? 'Waiting in ComfyUI queue' : j.progress;
          j.error = undefined;
          this.store.saveJob(j);
        } else {
          j.state = 'connection-unknown';
          j.error = 'Prompt is absent from queue and history. No automatic resubmission.';
          this.store.saveJob(j);
        }
      }
      const jobs = this.store.list<Job>('jobs');
      if (
        !jobs.some(
          (j) =>
            ['running', 'submitting', 'connection-unknown'].includes(j.state) ||
            (j.state === 'queued' && j.promptId),
        )
      ) {
        const next = jobs
          .filter(
            (j) => j.state === 'queued' && !j.promptId && j.endpoint === this.client!.endpoint,
          )
          .sort((a, b) => a.createdAt - b.createdAt)[0];
        if (next) await this.submit(next);
      }
      this.emit();
    } catch (e) {
      for (const j of this.store.list<Job>('jobs'))
        if (['running', 'submitting'].includes(j.state)) {
          j.state = 'connection-unknown';
          j.error = `Connection lost: ${(e as Error).message}`;
          this.store.saveJob(j);
        }
      this.emit();
    } finally {
      this.busy = false;
    }
  }
  async submit(j: Job) {
    // Upload errors happen before prompt submission and can safely be reported as failed.
    try {
      const binding = j.imageBinding;
      if (j.referenceAssetId && binding) {
        const a = this.store.snapshot().assets.find((a) => a.id === j.referenceAssetId)!;
        const name = await this.client!.upload(
          fs.readFileSync(contained(this.store.folder, a.path)),
          `${a.id}.${a.path.split('.').pop()}`,
        );
        j.workflow[binding.node].inputs[binding.input] = name;
      }
    } catch (e) {
      j.state = 'failed';
      j.error = (e as Error).message;
      this.store.saveJob(j);
      return;
    }
    j.state = 'submitting';
    this.store.saveJob(j);
    this.emit();
    try {
      const response = await this.client!.submit(j.workflow, j.id);
      if (!response.prompt_id || response.error) {
        j.state = 'failed';
        j.error = JSON.stringify(response);
      } else {
        j.promptId = response.prompt_id;
        j.state = 'running';
      }
    } catch (e) {
      const message = (e as Error).message;
      j.state = /ComfyUI 4\d\d:/.test(message) ? 'failed' : 'connection-unknown';
      j.error = message;
    }
    this.store.saveJob(j);
  }
  async ingest(j: Job, history: any) {
    const files = j.outputs.flatMap((id) => history.outputs?.[id]?.images || []);
    if (!files.length) {
      j.state = 'failed';
      j.error = 'Workflow completed without image outputs on the mapped nodes.';
      this.store.saveJob(j);
      return;
    }
    const assets: Asset[] = [];
    for (const file of files)
      assets.push(
        await this.store.importAsset(await this.client!.output(file), file.filename, true),
      );
    this.store.db.transaction(() => {
      const b = this.store.list<Board>('boards').find((b) => b.id === j.boardId)!;
      const placeholder = b.items.find((i) => i.id === j.id);
      const anchor = placeholder?.position || j.position;
      b.items = b.items.filter((i) => i.id !== j.id);
      assets.forEach((a, index) => {
        const id = `${j.id}-output-${index}`;
        if (!b.items.some((i) => i.id === id))
          b.items.push({
            id,
            type: 'image',
            position: { x: anchor.x + index * 260, y: anchor.y },
            width: 240,
            height: (240 * a.height) / a.width,
            data: { assetId: a.id, jobId: j.id },
          });
        for (const source of j.sourceIds)
          this.store.db
            .prepare('INSERT OR IGNORE INTO lineage VALUES (?, ?, ?)')
            .run(j.id, source, a.id);
      });
      j.assetIds = assets.map((a) => a.id);
      j.state = 'completed';
      j.progress = 'Complete';
      j.error = undefined;
      this.store.saveJob(j);
      this.store.put('boards', b);
    })();
  }
  async cancel(id: string) {
    if (this.busy) throw new Error('Queue is updating. Try cancel again in a moment.');
    this.busy = true;
    let finished = false;
    try {
      const j = this.store.list<Job>('jobs').find((j) => j.id === id);
      if (!j) throw new Error('Unknown job.');
      if (['completed', 'cancelled', 'failed'].includes(j.state)) return;
      if (j.state !== 'queued' || j.promptId) {
        if (!j.promptId)
          throw new Error(
            'Submission outcome is unknown. Inspect ComfyUI before resolving this attempt.',
          );
        if (!this.client || this.client.endpoint !== j.endpoint)
          throw new Error('Reconnect to this job’s local port before cancelling.');
        finished = (await this.client.cancel(j.promptId)) === 'finished';
      }
      if (!finished) {
        j.state = 'cancelled';
        this.store.saveJob(j);
        this.emit();
      }
    } finally {
      this.busy = false;
    }
    if (finished) await this.tick();
  }
  async retry(id: string) {
    const old = this.store.list<Job>('jobs').find((j) => j.id === id);
    if (!old || !['failed', 'cancelled'].includes(old.state))
      throw new Error(
        'Only failed or cancelled attempts can be retried. Unknown submissions must be reconciled first.',
      );
    const j: Job = {
      ...structuredClone(old),
      id: randomUUID(),
      parentJobId: old.id,
      promptId: undefined,
      state: 'queued',
      error: undefined,
      progress: undefined,
      assetIds: [],
      createdAt: Date.now(),
      position: { x: old.position.x, y: old.position.y + old.height + 40 },
    };
    const b = this.store.list<Board>('boards').find((b) => b.id === j.boardId)!;
    b.items.push({
      id: j.id,
      type: 'job',
      position: j.position,
      width: j.width,
      height: j.height,
      data: { jobId: j.id },
    });
    this.store.db.transaction(() => {
      this.store.saveJob(j);
      this.store.put('boards', b);
    })();
    this.emit();
    return j;
  }
  close() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.client?.close();
  }
}
