import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { browserURL, type BrowserEntry } from '../shared/embedded-browser';

export function browserEntries(rows: unknown[], kind: BrowserEntry['kind']): BrowserEntry[] {
  const entries = new Map<string, BrowserEntry>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const { url, title } = row as { url?: unknown; title?: unknown };
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
    try {
      const safe = browserURL(url);
      entries.set(safe, { url: safe, title: typeof title === 'string' ? title.slice(0, 300) : safe, kind });
    } catch { /* Skip unsupported addresses. */ }
    if (entries.size >= 2000) break;
  }
  return [...entries.values()];
}

export function chromeBookmarks(data: unknown): BrowserEntry[] {
  const rows: unknown[] = [];
  function walk(node: any, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 30 || rows.length >= 5000) return;
    if (node.type === 'url') rows.push({ url: node.url, title: node.name });
    if (Array.isArray(node.children)) node.children.forEach((n: unknown) => walk(n, depth + 1));
  }
  const roots = (data as any)?.roots;
  if (roots && typeof roots === 'object') Object.values(roots).forEach((n) => walk(n));
  return browserEntries(rows, 'bookmark');
}

export async function importBrowserProfile(folder: string, source: 'chrome' | 'firefox') {
  const entries: BrowserEntry[] = [];
  const warnings: string[] = [];
  if (source === 'chrome') {
    try { entries.push(...chromeBookmarks(JSON.parse(await fs.readFile(path.join(folder, 'Bookmarks'), 'utf8')))); }
    catch { warnings.push('Bookmarks could not be read. Select the Chrome profile folder containing Bookmarks.'); }
  }
  let db: Database.Database | undefined;
  try {
    db = new Database(path.join(folder, source === 'chrome' ? 'History' : 'places.sqlite'), { readonly: true, fileMustExist: true, timeout: 1000 });
    if (source === 'firefox') entries.push(...browserEntries(db.prepare('SELECT p.url, COALESCE(b.title, p.title) AS title FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk WHERE b.type = 1 LIMIT 2000').all(), 'bookmark'));
    entries.push(...browserEntries(db.prepare(source === 'chrome'
      ? 'SELECT url, title FROM urls ORDER BY last_visit_time DESC LIMIT 2000'
      : 'SELECT url, title FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT 2000').all(), 'history'));
  } catch { warnings.push('History could not be read. Close the source browser and choose its profile folder again.'); }
  finally { db?.close(); }
  if (!entries.length) throw new Error(warnings.join(' ') || 'No supported bookmarks or history found.');
  return { entries, warnings };
}
