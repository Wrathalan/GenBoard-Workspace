import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron', 'better-sqlite3', 'sharp'],
  sourcemap: true,
});
await copyFile(
  'resources/graphic-anime-generation.md',
  'dist-electron/graphic-anime-generation.md',
);
