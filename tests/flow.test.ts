/** M4 の検査（design §7、§12）：作物フローの質量の釣り合い、ヘッダへの追従、排出、粒子数の上限。 */
import { describe, expect, it } from 'vitest';
import { FLOWS, FlowSystem, type FlowInputs } from '../src/flow/system';
import { mountMatrices, UNLOAD_POSE, WORK_POSE } from '../src/model/kinematics';
import { cutHeight, mogFromCut } from '../src/model/harvest';
import { DEFAULT_MACHINE, motionRates } from '../src/model/machine';
import { spec } from '../src/spec/spec';
import { Matrix4, Vector3 } from 'three';

const rates = motionRates(DEFAULT_MACHINE);
const base: FlowInputs = {
  pose: { ...WORK_POSE },
  engineOn: true,
  headerOn: true,
  separatorOn: true,
  unloadOn: false,
  groundSpeed: DEFAULT_MACHINE.groundSpeed,
  yield: spec.crop.wheat.yield,
  cropHeight: spec.crop.wheat.height,
  draperSide: rates.draperSide,
  draperCenter: rates.draperCenter,
  elevator: rates.elevator,
};
const DT = 1 / 30;
const run = (f: FlowSystem, seconds: number, inp: FlowInputs) => {
  for (let t = 0; t < seconds; t += DT) f.update(DT, inp);
};
const grainKgS = (inp: FlowInputs) => (inp.yield * 1000 * spec.header.width * (inp.groundSpeed / 3.6)) / 10000;

describe('定常状態（基準の小麦、5 km/h）', () => {
  const f = new FlowSystem(7);
  run(f, 40, base);
  const before = f.delivered;
  run(f, 30, base);
  const rate = (f.delivered - before) / 30;

  it('タンクに入る穀粒の量 ＝ 刈った穀粒の量（±10%、2 番も戻って穀粒になる）', () => {
    expect(rate / grainKgS(base)).toBeGreaterThan(0.9);
    expect(rate / grainKgS(base)).toBeLessThan(1.1);
  });
  it('6 系統のうち排出以外の 5 系統に粒子がある', () => {
    const c = f.stats().count;
    for (const k of ['crop', 'straw', 'grain', 'chaff', 'tailings'] as const) expect(c[k], k).toBeGreaterThan(0);
    expect(c.unload).toBe(0);
  });
  it('粒子数の合計は 8,000 以下', () => {
    const c = f.stats().count;
    expect(FLOWS.reduce((s, k) => s + c[k], 0)).toBeLessThanOrEqual(8000);
  });
  it('MOG/穀粒 の推定値が刈高さに合っている', () => {
    expect(mogFromCut(cutHeight(base.pose))).toBeCloseTo(1.2, 2);
  });
});

describe('ヘッダへの追従（M4 の完了条件）', () => {
  it('ヘッダを上げると、ヘッダの上の粒子もヘッダの座標系で同じ位置のまま一緒に上がる', () => {
    const f = new FlowSystem(3);
    run(f, 6, base);
    const onHeader = f.particles.crop.filter((q) => q.stage <= 2);
    expect(onHeader.length).toBeGreaterThan(20);
    const inv0 = new Matrix4().copy(mountMatrices(base.pose).header).invert();
    const local0 = onHeader.map((q) => q.pos.clone().applyMatrix4(inv0));
    const y0 = onHeader.reduce((s, q) => s + q.pos.y, 0) / onHeader.length;

    const raised = { ...base, pose: { ...base.pose, headerAngle: 8 } };
    f.update(1e-4, raised); // ほとんど時間を進めずに姿勢だけ変える
    const inv1 = new Matrix4().copy(mountMatrices(raised.pose).header).invert();
    const local1 = onHeader.map((q) => q.pos.clone().applyMatrix4(inv1));
    const y1 = onHeader.reduce((s, q) => s + q.pos.y, 0) / onHeader.length;
    expect(y1 - y0).toBeGreaterThan(0.3);
    const maxMove = Math.max(...local0.map((p, i) => p.distanceTo(local1[i])));
    expect(maxMove).toBeLessThan(0.01);
  });

  it('ヘッダを作物より上に上げると刈り取りが止まり、遅れて穀粒も止まる', () => {
    const f = new FlowSystem(5);
    run(f, 30, base);
    const raised = { ...base, pose: { ...base.pose, headerAngle: 12 } };
    f.update(DT, raised);
    expect(f.stats().cutting).toBe(false);
    // すぐには止まらない（経路の中に残っている穀粒がある）
    const d0 = f.delivered;
    run(f, 3, raised);
    expect(f.delivered).toBeGreaterThan(d0);
    // 十分時間がたつと止まる
    run(f, 30, raised);
    const d1 = f.delivered;
    run(f, 5, raised);
    expect(f.delivered - d1).toBe(0);
  });
});

describe('排出', () => {
  it('オーガを振り出して排出すると、150 L/s × 容積重 でタンクが減り、スパウトから穀粒が落ちる', () => {
    const f = new FlowSystem(9);
    f.setTankMass(6000);
    const inp = { ...base, pose: { ...UNLOAD_POSE }, unloadOn: true, groundSpeed: 0 };
    run(f, 10, inp);
    const expected = spec.unload.rate * spec.crop.wheat.testWeight * 10;
    expect(6000 - f.tankMass).toBeCloseTo(expected, -1);
    expect(f.stats().count.unload).toBeGreaterThan(10);
    // 落ちた穀粒は機体の左外（ヘッダ端より外）にある
    const zs = f.particles.unload.map((q) => q.pos.z);
    expect(Math.max(...zs)).toBeLessThan(-(spec.header.width / 2));
  });
  it('オーガが格納されているときは排出しない', () => {
    const f = new FlowSystem(9);
    f.setTankMass(6000);
    run(f, 3, { ...base, unloadOn: true, groundSpeed: 0 });
    expect(f.tankMass).toBe(6000);
  });
});

describe('止める・上限', () => {
  it('エンジンを止めると粒子は動かない（落下中のものを除く）', () => {
    const f = new FlowSystem(11);
    run(f, 10, base);
    const off = { ...base, engineOn: false };
    f.update(DT, off);
    const snap = f.particles.crop.map((q) => q.pos.clone());
    run(f, 2, off);
    const moved = f.particles.crop.filter((q, i) => snap[i] && q.pos.distanceTo(snap[i] as Vector3) > 1e-9);
    expect(moved.length).toBe(0);
  });
  it('高収量・高速でも粒子数は上限内', () => {
    const f = new FlowSystem(13);
    const heavy = { ...base, yield: 10, groundSpeed: 12 };
    run(f, 20, heavy);
    const c = f.stats().count;
    expect(FLOWS.reduce((s, k) => s + c[k], 0)).toBeLessThanOrEqual(8000);
  });
});
