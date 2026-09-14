import fs from 'node:fs';
import path from 'node:path';
import { contained } from './project';
export function generatedImageBytes(
  item: { status?: string; result?: string; savedPath?: string },
  profile: string,
): Buffer {
  if (item.status !== 'completed') throw new Error('Image generation has not completed.');
  if (item.savedPath) {
    const file = contained(profile, path.relative(profile, item.savedPath));
    if (!/\.(png|jpe?g|webp)$/i.test(file))
      throw new Error('Generated output must be an image file.');
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 50_000_000)
      throw new Error('Invalid generated image file.');
    return fs.readFileSync(file);
  }
  const result = item.result?.replace(/^data:image\/(png|jpeg|webp);base64,/, '') || '';
  if (!result || result.length > 67_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result))
    throw new Error('No valid generated image data was returned.');
  return Buffer.from(result, 'base64');
}
