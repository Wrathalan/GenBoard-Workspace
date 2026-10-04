import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { contained } from './project';
import { MAX_IMAGE_REFERENCES } from '../shared/image-references';

// Bound the inline RPC payload without resizing or silently dropping references.
export const MAX_REFERENCE_DATA_URL_LENGTH = 20 * 1024 * 1024;
export const MAX_REFERENCE_PAYLOAD_LENGTH = 128 * 1024 * 1024;

export async function prepareCodexImages(paths: string[]) {
  if (paths.length > MAX_IMAGE_REFERENCES)
    throw new Error(`Attach up to ${MAX_IMAGE_REFERENCES} images.`);
  const images: { type: 'image'; url: string; detail: 'original' }[] = [];
  let total = 0;
  for (const [index, file] of paths.entries()) {
    try {
      const stat = await fs.promises.stat(file);
      const encodedLength = 4 * Math.ceil(stat.size / 3) + 32;
      if (!stat.isFile() || !stat.size) throw new Error('The image file is empty or unavailable.');
      if (encodedLength > MAX_REFERENCE_DATA_URL_LENGTH)
        throw new Error(
          'The image exceeds the 20 MiB encoded attachment limit. Export a smaller copy.',
        );
      if (total + encodedLength > MAX_REFERENCE_PAYLOAD_LENGTH)
        throw new Error('References exceed the 128 MiB encoded request limit. Use smaller images.');
      const bytes = await fs.promises.readFile(file);
      const metadata = await sharp(bytes).metadata();
      if (!['png', 'jpeg', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1)
        throw new Error('Use a non-animated PNG, JPEG, or WebP image.');
      const url = `data:image/${metadata.format};base64,${bytes.toString('base64')}`;
      if (
        url.length > MAX_REFERENCE_DATA_URL_LENGTH ||
        total + url.length > MAX_REFERENCE_PAYLOAD_LENGTH
      )
        throw new Error('The image changed and exceeds the attachment size limit.');
      total += url.length;
      images.push({ type: 'image', url, detail: 'original' });
    } catch (error) {
      throw new Error(
        `Reference ${index + 1} could not be attached: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return images;
}

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
