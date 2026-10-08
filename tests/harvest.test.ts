/** design §16 段階 1：小麦での成立チェック W-1〜W-6。 */
import { describe, expect, it } from 'vitest';
import { WORK_POSE } from '../src/model/kinematics';
import {
  cleaningArea,
  cutHeight,
  defaultConditions,
  harvestReport,
  headerAngleForCut,
  mogFromCut,
  reelReach,
  separationArea,
  tankCapacity,
} from '../src/model/harvest';
import { spec } from '../src/spec/spec';

const w = spec.crop.wheat;
const poseAtCut = (c: number) => ({ ...WORK_POSE, headerAngle: headerAngleForCut(c, WORK_POSE)! });

describe('形から計算する量', () => {
  it('作業姿勢の刈高さは 0.10 m（design §4.2 (b)）', () => expect(cutHeight(WORK_POSE)).toBeCloseTo(0.1, 3));
  it('分離面積は S790（1.54 m²）と同程度', () => expect(separationArea()).toBeGreaterThan(1.4));
  it('選別面積', () => expect(cleaningArea()).toBeCloseTo(4.575, 2));
  it('タンク容量 14.1 m³ ± 5%', () => expect(Math.abs(tankCapacity() / spec.tank.ratedCapacity - 1)).toBeLessThan(0.05));
  it('MOG/穀粒 は刈高さで下がる（PAMI：10 cm 1.20 → 25 cm 0.85 → 40 cm 0.64）', () => {
    expect(mogFromCut(0.1)).toBeCloseTo(1.2);
    expect(mogFromCut(0.25)).toBeCloseTo(0.85);
    expect(mogFromCut(0.4)).toBeCloseTo(0.64);
  });
});

describe('基準条件（小麦 4.5 t/ha、草丈 0.80 m、刈高さ 25 cm、5 km/h）で W-1〜W-6 がすべて成立', () => {
  const pose0 = poseAtCut(0.25);
  const cond = defaultConditions();
  // リールは推奨位置へ（W-2 は「調整で届く」ことを別に確かめる）
  const r = reelReach(pose0, cond);
  const lift = Math.min(spec.header.reel.liftRange[1], Math.max(spec.header.reel.liftRange[0], (r.zone[0] + r.zone[1]) / 2 - r.tineLow));
  const report = harvestReport({ ...pose0, reelLift: lift }, cond);
  for (const c of report.checks) it(`${c.id} ${c.name}：${c.detail}`, () => expect(c.ok).toBe(true));
});

describe('W-1・W-2：草丈の範囲（0.56〜1.09 m）と推奨の刈高さで、刈れてリールが届く', () => {
  for (const h of [w.heightRange[0], w.height, w.heightRange[1]]) {
    for (const c of [0.1, 0.25]) {
      if (c > h - w.headLength - 0.1) continue;
      it(`草丈 ${h} m・刈高さ ${c} m`, () => {
        const a = headerAngleForCut(c, WORK_POSE);
        expect(a).not.toBeNull();
        const rr = reelReach({ ...WORK_POSE, headerAngle: a! }, { ...defaultConditions(), cropHeight: h });
        expect(rr.adjustable, `目標 ${rr.zone.map((z) => z.toFixed(2))}`).toBe(true);
      });
    }
  }
});

describe('W-4：処理量（資料 06 の推定と照合）', () => {
  it('8 t/ha・MOG/穀粒 0.8（資料 06 と同じ条件）で最大速度 2.8〜4.5 km/h、ボトルネックはロータ（資料：Class 8 で約 4 km/h、ロータが最も厳しい）', () => {
    const rep = harvestReport(WORK_POSE, { ...defaultConditions(), yield: 8, mogRatio: 0.8 });
    expect(rep.maxSpeed).toBeGreaterThan(2.8);
    expect(rep.maxSpeed).toBeLessThan(4.5);
    expect(rep.bottleneck.id).toBe('rotor');
  });
  it('基準の小麦（4.5 t/ha・刈高さ 25 cm）では 5 km/h 以上で走れる（実例 4.8〜6.4 km/h）', () => {
    const rep = harvestReport(poseAtCut(0.25), defaultConditions());
    expect(rep.maxSpeed).toBeGreaterThanOrEqual(5);
  });
  it('8 t/ha・低刈り（10 cm、MOG/穀粒 1.20）ではさらに遅く、3 km/h 未満', () => {
    const rep = harvestReport(WORK_POSE, { ...defaultConditions(), yield: 8 });
    expect(rep.maxSpeed).toBeLessThan(3);
  });
  it('刈高さを上げると MOG が減り、最大速度が上がる', () => {
    const low = harvestReport(poseAtCut(0.1), defaultConditions());
    const high = harvestReport(poseAtCut(0.3), defaultConditions());
    expect(high.maxSpeed).toBeGreaterThan(low.maxSpeed);
  });
  it('エレベータと排出オーガはボトルネックにならない', () => {
    const rep = harvestReport(WORK_POSE, { ...defaultConditions(), yield: 10 });
    for (const id of ['elevator', 'unload'] as const) {
      expect(rep.stages.find((s) => s.id === id)!.limitSpeed).toBeGreaterThan(rep.maxSpeed * 2);
    }
  });
});

describe('W-3：リールの周速比', () => {
  it('周速比 1.25 でも 10 km/h まではリール上限 70 rpm に収まる', () => {
    const rep = harvestReport(WORK_POSE, { ...defaultConditions(), speed: 10, reelIndex: 1.25 });
    expect(rep.checks.find((c) => c.id === 'W-3')!.ok).toBe(true);
  });
  it('12 km/h・1.25 では上限を超える（判定が働くことの確認）', () => {
    const rep = harvestReport(WORK_POSE, { ...defaultConditions(), speed: 12, reelIndex: 1.25 });
    expect(rep.checks.find((c) => c.id === 'W-3')!.ok).toBe(false);
  });
});
