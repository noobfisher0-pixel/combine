import { place } from '../collision/check';
import { HEADER_MOUNTS, poseRanges } from './kinematics';
import { buildParts } from './parts';
import type { PartDef, Pose } from './types';

const defaultParts = buildParts();

/** ヘッダ側（フェース以降）の部品の最下点の高さ。 */
export function headerLowestY(pose: Pose, parts: PartDef[] = defaultParts): number {
  const placed = place(parts, pose).filter((p) => HEADER_MOUNTS.has(p.part.mount));
  return Math.min(...placed.map((p) => p.box.min[1]));
}

/**
 * ヘッダの最下点が地面（y = 0）より下に行かないフィーダ角の下限（§14.3、M2）。
 * チルト（前後・左右）とリール位置は pose の値を使う。フィーダ角を上げると最下点は上がる（単調）ので二分探索。
 */
export function minHeaderAngle(pose: Pose, parts: PartDef[] = defaultParts): number {
  const [lo, hi] = poseRanges().headerAngle;
  const y = (a: number) => headerLowestY({ ...pose, headerAngle: a }, parts);
  if (y(lo) >= 0) return lo;
  if (y(hi) < 0) return hi; // どの角度でも地面に当たる（ありえないが安全側）
  let a = lo;
  let b = hi;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    if (y(m) >= 0) b = m;
    else a = m;
  }
  return b;
}
