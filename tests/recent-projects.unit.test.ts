import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RecentProjects } from '../electron/recent-projects';
function fixture() {
  const root = fs.mkdtempSync(path.resolve('.test-data') + '/recent-');
  return { root, cache: new RecentProjects(path.join(root, 'preferences', 'recent.json')) };
}
it('persists projects, deduplicates paths and orders by most recently opened', () => {
  const { root, cache } = fixture();
  for (const name of ['a', 'b']) {
    fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, name, 'workspace.sqlite'), '');
  }
  cache.record(path.join(root, 'a'), 'A');
  cache.record(path.join(root, 'b'), 'B');
  cache.record(path.join(root, 'a'), 'A renamed');
  const list = cache.list();
  expect(list.map((r) => r.name)).toEqual(['A renamed', 'B']);
  expect(cache.resolve(list[0].id)).toBe(fs.realpathSync(path.join(root, 'a')));
  expect(new RecentProjects(path.join(root, 'preferences', 'recent.json')).list()).toEqual(list);
  cache.remove(list[0].id);
  expect(fs.existsSync(path.join(root, 'a', 'workspace.sqlite'))).toBe(true);
  expect(cache.list()).toHaveLength(1);
});
it('marks unavailable projects without recreating files and rejects unknown IDs', () => {
  const { root, cache } = fixture();
  cache.record(root, 'Missing database');
  expect(cache.list()[0].missing).toBe(true);
  expect(() => cache.resolve(cache.list()[0].id)).toThrow('unavailable');
  expect(() => cache.resolve('../escape')).toThrow('no longer listed');
  expect(fs.existsSync(path.join(root, 'workspace.sqlite'))).toBe(false);
});
it('bounds history and recovers from a corrupt cache', () => {
  const { root, cache } = fixture();
  for (let i = 0; i < 15; i++) {
    const p = path.join(root, String(i));
    fs.mkdirSync(p);
    cache.record(p, String(i));
  }
  expect(cache.list()).toHaveLength(12);
  fs.writeFileSync(path.join(root, 'preferences', 'recent.json'), 'not json');
  expect(cache.list()).toEqual([]);
  cache.record(root, 'Recovered');
  expect(cache.list()[0].name).toBe('Recovered');
});
