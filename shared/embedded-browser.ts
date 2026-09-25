export type BrowserBounds = { x: number; y: number; width: number; height: number };
export type EmbeddedBrowserState = {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string;
};
export function browserURL(input: string): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 8192)
    throw new Error('Enter a website address.');
  const text = input.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP or HTTPS website address without embedded credentials.');
  return url.href;
}
