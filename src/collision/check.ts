import { ALLOWED_CONTACTS } from '../model/parts';
import { mountMatrices } from '../model/kinematics';
import type { PartDef, Pose } from '../model/types';
import { spec } from '../spec/spec';
import { intersects, type V3 } from './gjk';
import { aabbOf, centerOf, supportOf, worldShape, type AABB, type WorldShape } from './shapes';

export interface Violation {
  a: string;
  b: string;
  /** 実際の隙間の推定（0 なら重なり）。二分探索で 5 mm 刻み。 */
  gap: number;
}

function matches(pattern: string, id: string): boolean {
  return pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern;
}

export function isAllowed(a: string, b: string): boolean {
  return ALLOWED_CONTACTS.some(([p, q]) => (matches(p, a) && matches(q, b)) || (matches(p, b) && matches(q, a)));
}

export interface Placed { part: PartDef; shape: WorldShape; box: AABB }

export function place(parts: PartDef[], pose: Pose): Placed[] {
  const m = mountMatrices(pose);
  return parts.map((part) => {
    const shape = worldShape(part, m);
    return { part, shape, box: aabbOf(shape) };
  });
}

function aabbClose(a: AABB, b: AABB, margin: number): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.min[i] > b.max[i] + margin || b.min[i] > a.max[i] + margin) return false;
  }
  return true;
}

function within(a: Placed, b: Placed, margin: number): boolean {
  if (!aabbClose(a.box, b.box, margin)) return false;
  const ca = centerOf(a.shape);
  const cb = centerOf(b.shape);
  const init: V3 = [cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]];
  return intersects(supportOf(a.shape, margin), supportOf(b.shape), init);
}

/** 2 部品の隙間（0〜margin の範囲で推定）。 */
export function gapBetween(a: Placed, b: Placed, margin: number): number {
  if (within(a, b, 0)) return 0;
  let lo = 0;
  let hi = margin;
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (within(a, b, mid)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * 1 つの姿勢での干渉を列挙する。
 * filter を渡すと、その部品を少なくとも片方に含む組だけを調べる（スイープ用）。
 */
export function checkPose(
  parts: PartDef[],
  pose: Pose,
  opts: { clearance?: number; filter?: (p: PartDef) => boolean; skip?: (p: PartDef) => boolean } = {},
): Violation[] {
  const margin = opts.clearance ?? spec.limits.clearance;
  const placed = place(parts, pose).filter((p) => !opts.skip?.(p.part));
  const out: Violation[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (opts.filter && !opts.filter(a.part) && !opts.filter(b.part)) continue;
      if (isAllowed(a.part.id, b.part.id)) continue;
      if (within(a, b, margin - 1e-6)) out.push({ a: a.part.id, b: b.part.id, gap: gapBetween(a, b, margin) });
    }
  }
  return out;
}

/** 部品群の全体の外形（AABB）。 */
export function envelope(placed: Placed[]): AABB {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of placed) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.box.min[i]);
      max[i] = Math.max(max[i], p.box.max[i]);
    }
  }
  return { min, max };
}
