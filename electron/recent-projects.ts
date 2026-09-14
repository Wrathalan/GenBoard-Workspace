import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RecentProject } from '../shared/types';
export class RecentProjects {
  constructor(private file: string) {}
  private read(): RecentProject[] {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(data)) return [];
      return data
        .filter(
          (r: any) =>
            r &&
            typeof r.id === 'string' &&
            typeof r.name === 'string' &&
            typeof r.folder === 'string' &&
            path.isAbsolute(r.folder) &&
            typeof r.openedAt === 'number',
        )
        .slice(0, 12);
    } catch {
      return [];
    }
  }
  private save(records: RecentProject[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(records, null, 2), 'utf8');
    fs.renameSync(temp, this.file);
  }
  list() {
    return this.read().map((r) => ({
      ...r,
      missing: !fs.existsSync(path.join(r.folder, 'workspace.sqlite')),
    }));
  }
  record(folder: string, name: string) {
    const canonical = fs.realpathSync(folder);
    const records = this.read();
    const match = (r: RecentProject) => r.folder.toLowerCase() === canonical.toLowerCase();
    const old = records.find(match);
    this.save(
      [
        {
          id: old?.id || randomUUID(),
          name,
          folder: canonical,
          openedAt: Date.now(),
          missing: false,
        },
        ...records.filter((r) => !match(r)),
      ].slice(0, 12),
    );
  }
  resolve(id: string) {
    const r = this.read().find((r) => r.id === id);
    if (!r) throw new Error('This recent project is no longer listed.');
    if (!fs.existsSync(path.join(r.folder, 'workspace.sqlite')))
      throw new Error(
        'Project folder is unavailable. Use Open project to locate it, or reconnect its drive.',
      );
    return r.folder;
  }
  remove(id: string) {
    this.save(this.read().filter((r) => r.id !== id));
  }
}
