import { expect, test } from 'vitest';
import { browserURL } from '../shared/embedded-browser';

test('browser addresses default to HTTPS and preserve explicit web URLs', () => {
  expect(browserURL(' example.com/upload ')).toBe('https://example.com/upload');
  expect(browserURL('http://127.0.0.1:4317/')).toBe('http://127.0.0.1:4317/');
});
test('embedded browser refuses local files, executable URLs and embedded credentials', () => {
  for (const url of [
    '',
    'file:///C:/secret.png',
    'javascript:alert(1)',
    'data:text/html,test',
    'imagine://asset/original',
    'https://user:password@example.com/',
  ])
    expect(() => browserURL(url)).toThrow();
});
