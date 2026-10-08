/** docs/design.md §4.3 6.「機能上の不変条件」。 */
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mountMatrices, poseRanges, WORK_POSE } from '../src/model/kinematics';
import { unloadElbow } from '../src/model/parts';
import { tankCapacity } from '../src/model/harvest';
import { spec } from '../src/spec/spec';

const deg = (d: number) => (d * Math.PI) / 180;

describe('脱穀・選別', () => {
  const t = spec.thresher;
  it('ロータ芯 < わらの経路半径 < ケージ内径（R-13）', () => {
    expect(t.rotor.coreRadius).toBeLessThan(t.strawPathRadius);
    expect(t.strawPathRadius).toBeLessThan(t.cage.innerRadius);
    expect(t.rotor.tipRadius).toBeLessThan(t.cage.innerRadius);
  });

  it('コンケーブ下端とグレインパン上端（振幅込み）の隙間 ≥ 0.10 m（R-14）', () => {
    const axisY = (x: number) => t.rotor.front[1] + (t.rotor.front[0] - x) * Math.tan(deg(t.rotor.slopeDeg));
    const pan = spec.shoe.pan;
    // コンケーブ区間でパンの上にある範囲の最も低いところ
    const xs = [Math.min(t.concave.x[0], pan.x[0]), Math.max(t.concave.x[1], pan.x[1])];
    const concaveBottom = Math.min(...xs.map((x) => axisY(x) - t.cage.innerRadius - t.cage.grateThickness));
    const panTop = pan.y + pan.t / 2 + spec.shoe.oscillationAmplitude;
    expect(concaveBottom - panTop).toBeGreaterThanOrEqual(spec.limits.concaveToPan);
  });

  it('グレインパンの前端がコンケーブ前端より前にある（落ちた穀粒を受ける）', () => {
    // コンケーブ前端 −0.10 で落ちた穀粒をパン（前端 −0.05）が受ける
    expect(spec.shoe.pan.x[0]).toBeGreaterThanOrEqual(t.concave.x[0]);
  });

  it('テーリングオーガはシーブ後端より後ろ、チャッファ延長部後端より前（R-06）', () => {
    const sh = spec.shoe;
    const sieveRear = sh.sieve.front[0] - sh.sieve.length * Math.cos(deg(sh.sieve.slopeDeg));
    const extRear = sh.chaffer.front[0] - (sh.chaffer.length + sh.chaffer.extension) * Math.cos(deg(sh.chaffer.slopeDeg));
    expect(sh.tailingsAuger.x).toBeLessThan(sieveRear);
    expect(sh.tailingsAuger.x).toBeGreaterThan(extRear);
  });
});

describe('グレインタンク', () => {
  it('容量（延長展開・平ら）が定格 14.1 m³ ± 5%（R-12）', () => {
    const total = tankCapacity();
    expect(total).toBeGreaterThan(spec.tank.ratedCapacity * 0.95);
    expect(total).toBeLessThan(spec.tank.ratedCapacity * 1.05);
  });
});

describe('排出オーガ', () => {
  const u = spec.unload;
  const elbow = unloadElbow();
  for (const angle of [90, u.deployRange[1]]) {
    it(`${angle}° で吐出口の高さ ≥ ${spec.limits.spoutMinHeight} m、ヘッダ端より ${spec.limits.spoutBeyondHeader} m 以上外`, () => {
      const m = mountMatrices({ ...WORK_POSE, augerDeploy: angle }).auger;
      const spoutBottom = new Vector3(elbow[0] + u.tubeLength - u.spout.radius, elbow[1] - u.spout.drop, elbow[2]).applyMatrix4(m);
      expect(spoutBottom.y).toBeGreaterThanOrEqual(spec.limits.spoutMinHeight);
      expect(-spoutBottom.z).toBeGreaterThanOrEqual(spec.header.width / 2 + spec.limits.spoutBeyondHeader);
    });
  }
});

describe('フィーダ昇降シリンダ', () => {
  it('全昇降範囲で 最短長 ≤ 長さ ≤ 最短長 + ストローク', () => {
    const lc = spec.feeder.liftCylinder;
    const [lo, hi] = poseRanges().headerAngle;
    for (let a = lo; a <= hi + 1e-9; a += 0.1) {
      const m = mountMatrices({ ...WORK_POSE, headerAngle: a }).feeder;
      const p = new Vector3(lc.feederAnchor[0], lc.feederAnchor[1], lc.z).applyMatrix4(m);
      const len = p.distanceTo(new Vector3(lc.chassisAnchor[0], lc.chassisAnchor[1], lc.z));
      expect(len, `angle=${a.toFixed(1)}`).toBeGreaterThanOrEqual(lc.closedLength);
      expect(len, `angle=${a.toFixed(1)}`).toBeLessThanOrEqual(lc.closedLength + lc.stroke);
    }
  });
});
