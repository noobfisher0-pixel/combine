/**
 * docs/design.md §4.3 の自動検査。
 * 1. 全ペア検査（許可リスト以外の重なり・隙間不足）
 * 2. 可動部のスイープ
 * 3. 輸送時の外形
 * 4. 地面（刈刃・最低地上高）
 */
import { describe, expect, it } from 'vitest';
import { checkPose, envelope, place, type Violation } from '../src/collision/check';
import { DEFAULT_POSE, HEADER_MOUNTS, TRANSPORT_POSE, WORK_POSE, poseRanges } from '../src/model/kinematics';
import { buildParts } from '../src/model/parts';
import type { PartDef, Pose } from '../src/model/types';
import { spec } from '../src/spec/spec';

const parts = buildParts();
const ranges = poseRanges();

function steps(range: readonly [number, number], step: number): number[] {
  const out: number[] = [];
  for (let v = range[0]; v < range[1]; v += step) out.push(+v.toFixed(4));
  out.push(range[1]);
  return out;
}

function describeViolations(vs: Array<Violation & { pose?: Partial<Pose> }>): string {
  return vs.map((v) => `${v.a} × ${v.b}（隙間 ${v.gap.toFixed(3)} m）${v.pose ? ' @' + JSON.stringify(v.pose) : ''}`).join('\n');
}

/** 同じ組の違反は最初の 1 件だけ残す。 */
function sweep(poses: Pose[], filter: (p: PartDef) => boolean): Array<Violation & { pose: Partial<Pose> }> {
  const seen = new Set<string>();
  const out: Array<Violation & { pose: Partial<Pose> }> = [];
  for (const pose of poses) {
    for (const v of checkPose(parts, pose, { filter })) {
      const key = `${v.a}|${v.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const diff = Object.fromEntries(Object.entries(pose).filter(([k, val]) => val !== (DEFAULT_POSE as never)[k]));
      out.push({ ...v, pose: diff });
    }
  }
  return out;
}

describe('部品定義', () => {
  it('ID が重複しない', () => {
    const ids = parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('全ペア検査（静止姿勢）', () => {
  for (const [name, pose] of [['既定（フラップ閉）', DEFAULT_POSE], ['作業（フラップ展開）', WORK_POSE]] as const) {
    it(name, () => {
      const vs = checkPose(parts, pose);
      expect(vs, describeViolations(vs)).toEqual([]);
    });
  }
});

describe('スイープ', () => {
  const onHeaderSide = (p: PartDef) => p.mount === 'feeder' || HEADER_MOUNTS.has(p.mount) || p.shape.kind === 'link';

  it('フィーダ昇降 × フェース前後チルト × 左右チルト × リール位置', () => {
    const poses: Pose[] = [];
    for (const headerAngle of steps(ranges.headerAngle, 0.5))
      for (const faceTilt of [ranges.faceTilt[0], 0, ranges.faceTilt[1]])
        for (const lateralTilt of [ranges.lateralTilt[0], 0, ranges.lateralTilt[1]])
          for (const reelLift of ranges.reelLift)
            for (const reelSlide of ranges.reelSlide)
              poses.push({ ...WORK_POSE, headerAngle, faceTilt, lateralTilt, reelLift, reelSlide });
    const vs = sweep(poses, onHeaderSide);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it('排出オーガ 0〜95° × フラップ開閉', () => {
    const poses: Pose[] = [];
    for (const augerDeploy of steps(ranges.augerDeploy, 1))
      for (const flaps of [0, spec.tank.flap.openDeg]) poses.push({ ...DEFAULT_POSE, augerDeploy, flaps });
    const vs = sweep(poses, (p) => p.mount === 'auger');
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it('タンクフラップ 0〜110° × 排出オーガ格納・展開', () => {
    const poses: Pose[] = [];
    for (const flaps of steps(ranges.flaps, 2))
      for (const augerDeploy of ranges.augerDeploy) poses.push({ ...DEFAULT_POSE, flaps, augerDeploy });
    const vs = sweep(poses, (p) => p.mount.startsWith('flap'));
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it('後輪操舵', () => {
    const poses = steps(ranges.steer, 1).map((steer) => ({ ...DEFAULT_POSE, steer }));
    const vs = sweep(poses, (p) => p.mount === 'steerL' || p.mount === 'steerR');
    expect(vs, describeViolations(vs)).toEqual([]);
  });
});

describe('輸送時の外形（ヘッダなし・排出オーガ格納・フラップ閉）', () => {
  const placed = place(parts, TRANSPORT_POSE).filter((p) => !HEADER_MOUNTS.has(p.part.mount));
  const env = envelope(placed);
  const L = spec.limits;
  it(`全高 ≤ ${L.transportHeight} m`, () => expect(env.max[1]).toBeLessThanOrEqual(L.transportHeight));
  it(`全幅 ≤ ${L.transportWidth} m`, () => expect(env.max[2] - env.min[2]).toBeLessThanOrEqual(L.transportWidth));
  it(`全長 ≤ ${L.transportLength} m`, () => expect(env.max[0] - env.min[0]).toBeLessThanOrEqual(L.transportLength));
});

describe('地面', () => {
  it('刈刃・ヘッダの最下点 ≥ 0（チルト 0、フィーダ全範囲）', () => {
    for (const headerAngle of steps(ranges.headerAngle, 0.1)) {
      const placed = place(parts, { ...WORK_POSE, headerAngle }).filter((p) => HEADER_MOUNTS.has(p.part.mount));
      const minY = Math.min(...placed.map((p) => p.box.min[1]));
      expect(minY, `headerAngle=${headerAngle}`).toBeGreaterThanOrEqual(0);
    }
  });

  it(`最低地上高 ≥ ${spec.limits.groundClearance} m（車輪・ヘッダを除く）`, () => {
    const placed = place(parts, WORK_POSE).filter((p) => p.part.group !== 'wheel' && !HEADER_MOUNTS.has(p.part.mount));
    const low = placed.reduce((a, b) => (a.box.min[1] < b.box.min[1] ? a : b));
    expect(low.box.min[1], low.part.id).toBeGreaterThanOrEqual(spec.limits.groundClearance);
  });
});
