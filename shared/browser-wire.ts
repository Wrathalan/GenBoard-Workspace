// JSON transport preserves imported image bytes without expanding each byte to a number.
export function encodeMessage(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!(item instanceof Uint8Array)) return item;
    let binary = '';
    for (let i = 0; i < item.length; i += 32768)
      binary += String.fromCharCode(...item.subarray(i, i + 32768));
    return { $imagineBytes: btoa(binary) };
  });
}
export function decodeMessage(text: string): any {
  return JSON.parse(text, (_key, item) => {
    if (
      item &&
      typeof item === 'object' &&
      Object.keys(item).length === 1 &&
      typeof item.$imagineBytes === 'string'
    ) {
      const bytes = atob(item.$imagineBytes);
      return Uint8Array.from(bytes, (c) => c.charCodeAt(0));
    }
    return item;
  });
}
