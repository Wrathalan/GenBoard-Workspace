import { expect, test } from 'vitest';
import { browserEntries, chromeBookmarks } from '../electron/browser-import';

test('imports nested Chrome bookmarks and filters unsafe or credential URLs', () => {
  const entries = chromeBookmarks({ roots: { bookmark_bar: { children: [
    { type: 'folder', children: [{ type: 'url', name: 'Reference', url: 'https://example.com/' }] },
    { type: 'url', url: 'javascript:alert(1)' },
    { type: 'url', url: 'file:///C:/private.txt' },
    { type: 'url', url: 'https://user:secret@example.com/' },
  ] } } });
  expect(entries).toEqual([{ title: 'Reference', url: 'https://example.com/', kind: 'bookmark' }]);
});

test('deduplicates URLs, bounds titles and handles malformed entries', () => {
  expect(browserEntries([null, {}, { url: 12 },
    { url: 'https://example.com', title: 'first' },
    { url: 'https://example.com/', title: 'x'.repeat(500) },
  ], 'history')).toEqual([{ url: 'https://example.com/', title: 'x'.repeat(300), kind: 'history' }]);
});
