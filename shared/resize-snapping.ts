import { absolutePosition } from './board';
import { motionRoots } from './group-motion';
import { GRID_SIZE, type SnapGuide } from './snapping';
import type { CanvasItem, Point } from './types';

export type ResizeBox = { x: number; y: number; width: number; height: number };

/** Snap the dragged edge, keeping the opposite edge/corner and image ratio fixed. */
export function snapResize(
  items: CanvasItem[],
  start: CanvasItem,
  raw: ResizeBox,
  zoom: number,
  grid: boolean,
  alignment: boolean,
  fixedAnchor?: Point,
) {
  const initial = { ...start.position, width: start.width, height: start.height };
  const roots = motionRoots(items);
  const targets = items.filter(
    (i) => roots.get(i.id) !== roots.get(start.id) && i.type !== 'group' && i.type !== 'job',
  );
  const anchors = { x: 0, y: 0 };
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height';
    const difference = raw[size] - initial[size];
    anchors[axis] =
      fixedAnchor?.[axis] ??
      (Math.abs(difference) < 0.000001
        ? 0
        : Math.round(Math.max(0, Math.min(1, (initial[axis] - raw[axis]) / difference)) * 2) / 2);
  }
  const fixed = {
    x: initial.x + anchors.x * initial.width,
    y: initial.y + anchors.y * initial.height,
  };
  // The resizer reads integer DOM measurements; preserve the stored image geometry.
  if (start.type === 'image') {
    const widthScale = raw.width / start.width,
      heightScale = raw.height / start.height;
    const scale = Math.max(
      64 / start.width,
      48 / start.height,
      Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale,
    );
    raw = {
      x: fixed.x - anchors.x * start.width * scale,
      y: fixed.y - anchors.y * start.height * scale,
      width: start.width * scale,
      height: start.height * scale,
    };
  }
  type Candidate = {
    axis: 'x' | 'y';
    size: number;
    priority: number;
    distance: number;
    value: number;
    edge: number;
  };
  const candidates: Candidate[] = [];
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height';
    if (Math.abs(raw[size] - initial[size]) < 0.000001) continue;
    for (const edge of [0, 1]) {
      const factor = edge - anchors[axis];
      if (Math.abs(factor) < 0.000001) continue;
      const value = raw[axis] + edge * raw[size];
      const add = (target: number, priority: number, threshold: number) => {
        const distance = Math.abs(target - value);
        const length = (target - fixed[axis]) / factor;
        const width =
          axis === 'x'
            ? length
            : start.type === 'image'
              ? (length * start.width) / start.height
              : raw.width;
        const height =
          axis === 'y'
            ? length
            : start.type === 'image'
              ? (length * start.height) / start.width
              : raw.height;
        if (distance <= threshold && width >= 64 && height >= 48)
          candidates.push({ axis, size: length, priority, distance, value: target, edge });
      };
      if (alignment)
        for (const target of targets) {
          const p = absolutePosition(target, items);
          const other = axis === 'x' ? 'y' : 'x';
          const otherSize = axis === 'x' ? 'height' : 'width';
          const overlap =
            Math.min(raw[other] + raw[otherSize], p[other] + target[otherSize]) -
            Math.max(raw[other], p[other]);
          for (const targetEdge of [0, 1])
            add(
              p[axis] + targetEdge * target[size],
              edge !== targetEdge && overlap > 0.01 ? 0 : 1,
              8 / zoom,
            );
        }
      if (grid) add(Math.round(value / GRID_SIZE) * GRID_SIZE, 2, Infinity);
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
  const result = { ...raw };
  const winners =
    start.type === 'image'
      ? candidates.slice(0, 1)
      : (['x', 'y'] as const).flatMap((axis) => candidates.find((c) => c.axis === axis) || []);
  for (const c of winners) {
    if (c.axis === 'x') {
      result.width = c.size;
      if (start.type === 'image') result.height = (c.size * start.height) / start.width;
    } else {
      result.height = c.size;
      if (start.type === 'image') result.width = (c.size * start.width) / start.height;
    }
  }
  result.x = fixed.x - anchors.x * result.width;
  result.y = fixed.y - anchors.y * result.height;
  const guides: SnapGuide[] = candidates
    .filter(
      (c) =>
        c.priority < 2 &&
        Math.abs(
          result[c.axis] + c.edge * (c.axis === 'x' ? result.width : result.height) - c.value,
        ) < 0.001,
    )
    .map((c) => ({ axis: c.axis, value: c.value }));
  return {
    box: result,
    guides: guides.filter(
      (g, index) => guides.findIndex((v) => v.axis === g.axis && v.value === g.value) === index,
    ),
  };
}
