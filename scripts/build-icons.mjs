import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// All app surfaces use the approved artwork without changing its composition.
const source = new URL('../resources/app-icon-source.png', import.meta.url);
const publicDir = new URL('../public/', import.meta.url);
await mkdir(publicDir, { recursive: true });
const artwork = sharp(fileURLToPath(source));
await artwork
  .clone()
  .resize(512, 512)
  .png()
  .toFile(fileURLToPath(new URL('app-icon.png', publicDir)));

// Windows ICO containers support PNG frames; include native sizes for high-DPI shells.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = await Promise.all(
  sizes.map((size) => artwork.clone().resize(size, size).png().toBuffer()),
);
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + 16 * index;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
const ico = Buffer.concat([directory, ...frames]);
await writeFile(new URL('../resources/icon.ico', import.meta.url), ico);
await writeFile(new URL('favicon.ico', publicDir), ico);
