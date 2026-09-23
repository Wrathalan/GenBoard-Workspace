import type { Asset } from '../shared/types';
import { useWorkspace } from './store';

export const REFERENCE_MIME = 'application/x-imagine-references';
export const ATTACH_REFERENCES = 'imagine:attach-references';
export function writeReferences(transfer: DataTransfer, ids: string[], characterId?: string) {
  transfer.setData(
    REFERENCE_MIME,
    JSON.stringify({ folder: useWorkspace.getState().project?.folder, ids, characterId }),
  );
  transfer.effectAllowed = 'copy';
}
export function referenceIds(ids: string[]): string[] {
  const s = useWorkspace.getState(),
    selected = new Set(ids);
  for (let changed = true; changed;) {
    changed = false;
    for (const i of s.board?.items || [])
      if (i.parentId && selected.has(i.parentId) && !selected.has(i.id)) {
        selected.add(i.id);
        changed = true;
      }
  }
  return [
    ...new Set(
      s.board?.items
        .filter((i) => selected.has(i.id) && i.type === 'image')
        .map((i) => i.data.assetId!) || [],
    ),
  ];
}
export async function readReferences(transfer: DataTransfer): Promise<Asset[]> {
  const project = useWorkspace.getState().project;
  if (!project) return [];
  const raw = transfer.getData(REFERENCE_MIME);
  if (raw) {
    const data = JSON.parse(raw);
    if (data.folder !== project.folder || !Array.isArray(data.ids))
      throw new Error('References must belong to this project.');
    return data.ids.map((id: string) => {
      const a = project.assets.find((a) => a.id === id);
      if (!a) throw new Error('Unknown reference image.');
      return a;
    });
  }
  const files = [...transfer.files];
  if (!files.length) return [];
  if (
    files.length > 500 ||
    files.some((f) => !/\.(png|jpe?g|webp)$/i.test(f.name) || f.size > 100 * 1024 * 1024)
  )
    throw new Error('Drop up to 500 PNG, JPEG, or WebP images smaller than 100 MB each.');
  const input = await Promise.all(
    files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  if (useWorkspace.getState().project?.folder !== project.folder) return [];
  const assets = await window.imagine.importImages(input);
  const current = useWorkspace.getState().project;
  if (current?.folder !== project.folder) return [];
  useWorkspace.setState({
    project: {
      ...current,
      assets: [...new Map([...current.assets, ...assets].map((a) => [a.id, a])).values()],
    },
  });
  return assets;
}
