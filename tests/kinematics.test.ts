/** M2 の検査（design §6、§12）：回転の向き、リールの周速、ストロボ判定、油圧の速さ、地面の制限。 */
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WORK_POSE, poseRanges } from '../src/model/kinematics';
import { headerLowestY, minHeaderAngle } from '../src/model/limits';
import {
  ACTUATOR_RATES,
  DEFAULT_MACHINE,
  approachPose,
  isStrobing,
  motionRates,
  reelRpm,
} from '../src/model/machine';
import { spec } from '../src/spec/spec';

/** Z 軸回りに omegaZ で dt 回したとき、点 p がどちらへ動くか。 */
function velocityAt(p: Vector3, center: Vector3, omegaZ: number): Vector3 {
  const dt = 1e-3;
  const m = new Matrix4().makeTranslation(center.x, center.y, center.z)
    .multiply(new Matrix4().makeRotationZ(omegaZ * dt))
    .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  return p.clone().applyMatrix4(m).sub(p).divideScalar(dt);
}

describe('回転の向き（+X 前、+Y 上、+Z 右）', () => {
  const r = motionRates({ ...DEFAULT_MACHINE, groundSpeed: 6 });
  it('前進時、車輪の接地点は地面に対して止まる（上端は前へ、下端は後ろへ）', () => {
    const w = spec.wheels.front;
    const c = new Vector3(w.x, w.y, 0);
    const top = velocityAt(new Vector3(w.x, w.y + w.radius, 0), c, r.wheelFrontOmegaZ);
    const bottom = velocityAt(new Vector3(w.x, w.y - w.radius, 0), c, r.wheelFrontOmegaZ);
    expect(top.x).toBeGreaterThan(0);
    // 機体から見た接地点の速度 ＝ −地速（地面が後ろへ流れる速さと一致）
    expect(bottom.x).toBeCloseTo(-6 / 3.6, 3);
  });

  it('リールの下側のタインは後方（刈刃側）へ動く', () => {
    const h = spec.header.reel;
    const v = velocityAt(new Vector3(h.x, h.y - h.radius, 0), new Vector3(h.x, h.y, 0), r.reelOmegaZ);
    expect(v.x).toBeLessThan(0);
  });

  it('リール下端の速さ ＝ 地速 × 周速比（地面に対して後ろ向きに作物をかき込む）', () => {
    const h = spec.header.reel;
    const tip = Math.abs(r.reelOmegaZ) * h.radius;
    expect(tip / (6 / 3.6)).toBeCloseTo(DEFAULT_MACHINE.reelIndex, 2);
  });

  it('ドレーパーは中央へ、中央ベルトは後方へ流れる（速さは正）', () => {
    expect(r.draperSide).toBeGreaterThan(0);
    expect(r.draperCenter).toBeGreaterThan(0);
  });
});

describe('リールの回転数（W-3 の土台）', () => {
  it('φ1.07 m・6 km/h・周速比 1.25 で約 37 rpm（design §4.2 (b)）', () => {
    expect(reelRpm(6, 1.25)).toBeCloseTo(37.2, 0);
  });
  it('上限 70 rpm でクランプする', () => {
    expect(reelRpm(12, 1.25)).toBe(70);
  });
  it('エンジン OFF・ヘッダ OFF では止まる', () => {
    expect(motionRates({ ...DEFAULT_MACHINE, engineOn: false }).reelRpm).toBe(0);
    expect(motionRates({ ...DEFAULT_MACHINE, headerOn: false }).knifeHz).toBe(0);
    expect(motionRates({ ...DEFAULT_MACHINE, separatorOn: false }).shoeHz).toBe(0);
  });
});

describe('ストロボ判定（R-25）', () => {
  const perFrame = (rpm: number, fps: number) => ((rpm * 2 * Math.PI) / 60) / fps;
  it('ファン 40 枚：実機 1,000 rpm × 再生 1/10 ＝ 100 rpm、60 fps → ストロボ（ブラー表示）', () => {
    expect(isStrobing(perFrame(100, 60), (2 * Math.PI) / 40)).toBe(true);
  });
  it('ラスプバー 4 列：100 rpm、60 fps → 通常表示', () => {
    expect(isStrobing(perFrame(100, 60), (2 * Math.PI) / 4)).toBe(false);
  });
  it('リール 6 本：上限 70 rpm を実速で再生しても通常表示', () => {
    expect(isStrobing(perFrame(70, 60), (2 * Math.PI) / 6)).toBe(false);
  });
  it('ナイフ ±38 mm・10 Hz を実速で再生 → 1 フレームの最大移動がピッチ 76 mm の半分を超えるのでブラー', () => {
    const vmax = 2 * Math.PI * 10 * 0.038;
    expect(isStrobing(vmax / 60, 0.0762)).toBe(true);
    expect(isStrobing((vmax * 0.1) / 60, 0.0762)).toBe(false);
  });
});

describe('油圧の動き', () => {
  it('排出オーガは 0→95° を約 8 秒で動く（再生倍率に関係なく実時間）', () => {
    let pose = { ...WORK_POSE };
    const target = { ...WORK_POSE, augerDeploy: 95 };
    let t = 0;
    while (pose.augerDeploy < 95 && t < 30) {
      pose = approachPose(pose, target, 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeCloseTo(95 / ACTUATOR_RATES.augerDeploy, 1);
  });
  it('目標を通り過ぎない', () => {
    const p = approachPose({ ...WORK_POSE, flaps: 109.9 }, { ...WORK_POSE, flaps: 110 }, 1);
    expect(p.flaps).toBe(110);
  });
});

describe('地面の制限（ヘッダが地面に潜らない、§14.3）', () => {
  const [lo] = poseRanges().headerAngle;
  it('チルト 0 では spec の下限 −1.2° がそのまま使える', () => {
    expect(minHeaderAngle(WORK_POSE)).toBeCloseTo(lo, 3);
  });
  for (const [name, tilt] of [
    ['フェースを前傾（刈刃側を下げる）', { faceTilt: -8.5 }],
    ['左右に 4° 傾ける', { lateralTilt: 4 }],
    ['前傾＋左右', { faceTilt: -8.5, lateralTilt: -4 }],
  ] as const) {
    it(`${name}：下限が上がり、その角度でヘッダの最下点 ≥ 0`, () => {
      const pose = { ...WORK_POSE, ...tilt };
      const a = minHeaderAngle(pose);
      expect(a).toBeGreaterThan(lo);
      expect(headerLowestY({ ...pose, headerAngle: a })).toBeGreaterThanOrEqual(-1e-6);
      expect(headerLowestY({ ...pose, headerAngle: a - 0.05 })).toBeLessThan(0);
    });
  }
});
