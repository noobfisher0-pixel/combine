/**
 * 圃場シナリオ（design §16.6・§21、M6）。圃場のセル、経路、1 往復の収穫シナリオと W-7・W-8 の判定。
 */
import { describe, expect, it } from 'vitest';
import { CUT, FLAT, STANDING, toField, toMachine, WheatField, defaultFieldOptions } from '../src/field/field';
import { advance, minTurnRadius, Path, steerFor, uTurn } from '../src/field/path';
import { HarvestScenario } from '../src/field/scenario';
import { FlowSystem } from '../src/flow/system';
import { WORK_POSE } from '../src/model/kinematics';
import { spec } from '../src/spec/spec';

const hw = spec.header.width / 2;

describe('圃場のセル', () => {
  const f = new WheatField();
  it('100 m × 50 m を 0.25 m 角で 400 × 200 セル、穀粒の合計は 収量 × 面積', () => {
    expect([f.nx, f.nz]).toEqual([400, 200]);
    const sum = f.grain.reduce((a, b) => a + b, 0);
    expect(sum / 1000).toBeCloseTo((spec.crop.wheat.yield * 100 * 50) / 10000, 3); // 2.25 t
  });
  it('草丈は平均の ±10 cm 以内でばらつく', () => {
    const h = [...f.height];
    expect(Math.min(...h)).toBeGreaterThan(spec.crop.wheat.height - 0.1);
    expect(Math.max(...h)).toBeLessThan(spec.crop.wheat.height + 0.1);
    expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(0.04);
  });
  it('機体座標と圃場座標の変換は互いに逆（psi = 0 で前 = +X、右 = +Z）', () => {
    const m = { x: 10, z: 20, psi: 0.7 };
    const [X, Z] = toField(m, 3, -2);
    const [mx, mz] = toMachine(m, X, Z);
    expect(mx).toBeCloseTo(3, 9);
    expect(mz).toBeCloseTo(-2, 9);
    expect(toField({ x: 0, z: 0, psi: 0 }, 1, 2)).toEqual([1, 2]);
  });
});

describe('刈刃の線で刈る', () => {
  it('刈幅の中のセルだけを刈り、同じ行程で 2 回数えず、別の行程の重なりを数える', () => {
    const f = new WheatField();
    const zc = 25;
    let total = 0;
    // 刈刃を X 10 → 20 m へ 0.07 m ずつ動かす
    for (let x = 10; x < 20 - 1e-9; x += 0.07) {
      const r = f.sweepCut([x, zc - hw], [x, zc + hw], [x + 0.07, zc - hw], [x + 0.07, zc + hw], () => true, 0.15, 1);
      total += r.cells;
      expect(r.overlap).toBe(0);
    }
    const rows = [...Array(f.nz).keys()].filter((k) => Math.abs((k + 0.5) * 0.25 - zc) <= hw).length;
    const cols = [...Array(f.nx).keys()].filter((i) => (i + 0.5) * 0.25 >= 10 && (i + 0.5) * 0.25 <= 20).length;
    expect(total).toBe(rows * cols);
    // 刈幅の外は立ったまま
    expect(f.state[Math.floor((zc + hw + 0.2) / 0.25) * f.nx + 60]).toBe(STANDING);
    expect(f.state[100 * f.nx + 60]).toBe(CUT);
    expect(f.stubble[100 * f.nx + 60]).toBeCloseTo(0.15);
    // 別の行程で同じ場所を通ると重なり
    const again = f.sweepCut([12, zc - 1], [12, zc + 1], [13, zc - 1], [13, zc + 1], () => true, 0.15, 2);
    expect(again.cells).toBe(0);
    expect(again.overlap).toBe(8 * 4);
  });

  it('刈れない（穂に届かない）セルは onMiss に渡し、刈らない', () => {
    const f = new WheatField();
    let missed = 0;
    const r = f.sweepCut([10, 10], [10, 12], [11, 10], [11, 12], () => false, 0.6, 1, () => missed++);
    expect(r.cells).toBe(0);
    expect(missed).toBe(4 * 8);
  });

  it('部品の下にある、下端より背の高い立毛だけを押し倒す', () => {
    const f = new WheatField();
    const m = { x: 20, z: 20, psi: 0 };
    expect(f.flattenUnder(m, { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5 }, 1.5, 0)).toBe(0); // 下端が作物より上
    expect(f.flattenUnder(m, { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5 }, 0, 0)).toBe(16);
    expect(f.counts().flat).toBe(16);
    expect(f.state[80 * f.nx + 80]).toBe(FLAT);
  });
});

describe('走行経路', () => {
  it('最小旋回半径（ホイールベース / tan 32°）は約 6.0 m、シナリオの旋回半径はその 1 割増し以上', () => {
    expect(minTurnRadius()).toBeCloseTo(6.0, 1);
    expect(spec.field.turnRadius).toBeGreaterThanOrEqual(minTurnRadius() * 1.05);
    expect(Math.abs(steerFor(1 / spec.field.turnRadius))).toBeLessThan(spec.wheels.steerMax);
    expect(steerFor(1 / 10)).toBeGreaterThan(0); // 右旋回は steer > 0
  });

  for (const d of [11.99, 12.19 - 0.5, 15]) {
    for (const side of [1, -1] as const) {
      it(`U ターン：横へ ${d} m（${side > 0 ? '右' : '左'}）ずれて逆向き、x は元に戻る`, () => {
        const start = { x: 0, z: 0, psi: 0 };
        const p = new Path(start, uTurn(d, spec.field.turnRadius, side));
        const e = p.end();
        expect(e.z).toBeCloseTo(d * side, 6);
        expect(e.x).toBeCloseTo(0, 6);
        expect(Math.cos(e.psi)).toBeCloseTo(-1, 6);
      });
    }
  }

  it('円弧の積分：半径 R で 90° 右に曲がると (R, R) へ', () => {
    const e = advance({ x: 0, z: 0, psi: 0 }, 1 / 5, (Math.PI / 2) * 5);
    expect(e.x).toBeCloseTo(5, 9);
    expect(e.z).toBeCloseTo(5, 9);
  });
});

describe('収穫シナリオ（1 往復、既定の条件）', () => {
  const sc = new HarvestScenario();
  const r = sc.runToEnd();

  it('最後まで走り、W-1〜W-8 がすべて成立', () => {
    expect(r.done).toBe(true);
    expect(r.aborted).toBeNull();
    const bad = r.checks.filter((c) => !c.ok).map((c) => `${c.id} ${c.detail}`);
    expect(bad).toEqual([]);
    expect(r.checks.map((c) => c.id)).toEqual(['W-1', 'W-2', 'W-3', 'W-4', 'W-5', 'W-6', 'W-7', 'W-8']);
  });

  it('W-7：刈った幅に刈り残しがなく、何も押し倒さない', () => {
    expect(r.w7.uncut).toBe(0);
    expect(r.w7.flattened).toBe(0);
    expect(r.w7.headerInside).toBe(true);
    expect(r.w7.dividerAhead).toBe(true);
    // 刈った幅 ＝ 2 行程 × 刈幅 − 重なり − はみ出し 0.1 m
    expect(r.w7.zRange[1]).toBeCloseTo(2 * spec.header.width - spec.field.overlap - 0.1, 6);
    expect(r.areaHa).toBeCloseTo((r.w7.zRange[1] * 100) / 10000, 2);
  });

  it('質量の釣り合い：刈った穀粒はすべてタンクに入り、タンク ＝ 最初 ＋ 入った量 − 排出', () => {
    expect(r.deliveredKg).toBeCloseTo(r.harvestedKg, 0);
    expect(r.tankStartKg + r.deliveredKg - r.unloadedKg - r.overflowKg).toBeCloseTo(r.tankEndKg, 3);
    // 刈ったセルの穀粒の合計と一致
    let cutGrain = 0;
    sc.field.state.forEach((s, i) => { if (s === CUT) cutGrain += sc.field.grain[i]; });
    expect(r.harvestedKg).toBeCloseTo(cutGrain, 3);
    expect(r.overflowKg).toBe(0);
  });

  it('1 行程目（左が圃場の外）で、走りながら排出してタンクを空にする', () => {
    expect(r.unloads.length).toBe(1);
    const u = r.unloads[0];
    expect(u.moving).toBe(true);
    expect(u.reason).toBe('タンクが空');
    expect(u.kg).toBeCloseTo(r.tankStartKg + (r.deliveredKg - r.tankEndKg) , -1);
    // 150 L/s × 772 kg/m³ で出す
    expect(u.kg / (u.end - u.start)).toBeCloseTo(spec.unload.rate * spec.crop.wheat.testWeight, -1);
  });

  it('負荷率のピークはどの段も 100% 以下（ボトルネックはロータ）', () => {
    for (const p of r.peaks) expect(p.peak, p.name).toBeLessThanOrEqual(1);
    const top = r.peaks.reduce((a, b) => (a.peak > b.peak ? a : b));
    expect(top.id).toBe('rotor');
  });

  it('経路は圃場と枕地の中、旋回中の後輪の切れ角は 32° 以内', () => {
    let maxSteer = 0;
    for (let s = 0; s <= sc.path.total; s += 0.5) {
      const p = sc.path.at(s);
      expect(p.x).toBeGreaterThan(-spec.field.headland);
      expect(p.x).toBeLessThan(spec.field.length + spec.field.headland);
      expect(p.z).toBeGreaterThan(-spec.field.headland);
      maxSteer = Math.max(maxSteer, Math.abs(steerFor(p.kappa)));
    }
    expect(maxSteer).toBeLessThan(spec.wheels.steerMax);
  });

  it('同じ条件なら同じ結果（シード固定）', () => {
    const r2 = new HarvestScenario().runToEnd();
    expect(r2.time).toBe(r.time);
    expect(r2.harvestedKg).toBe(r.harvestedKg);
    expect(r2.tankEndKg).toBe(r.tankEndKg);
  });

  it('2 往復：4 行程目までで刈り残し・押し倒しなし', () => {
    const r4 = new HarvestScenario({ roundTrips: 2 }).runToEnd();
    expect(r4.passes).toBe(4);
    expect(r4.w7.ok, r4.checks.find((c) => c.id === 'W-7')!.detail).toBe(true);
    expect(r4.w7.zRange[1]).toBeLessThanOrEqual(spec.field.width);
  });
});

describe('収穫シナリオ：うまくいかない条件を見つける', () => {
  it('行程の間に 0.5 m のすき間（重なり −0.5 m）→ W-7 ✗、刈り残しの帯を示す', () => {
    const r = new HarvestScenario({ overlap: -0.5 }).runToEnd();
    expect(r.w7.uncut).toBeGreaterThan(300);
    expect(r.w7.strips.length).toBe(1);
    const [z0, z1] = r.w7.strips[0];
    // 1 行程目の右端（Z = 刈幅 − 0.1）から 0.5 m
    const edge = 2 * hw - 0.1;
    expect(z0).toBeGreaterThan(edge - 0.25);
    expect(z1).toBeLessThan(edge + 0.5 + 0.25);
    expect(r.checks.find((c) => c.id === 'W-7')!.ok).toBe(false);
  });

  it('刈刃が穂より高い（草丈 0.56 m を 0.5 m で刈る）→ 押し倒して W-1・W-7 ✗', () => {
    const r = new HarvestScenario({ cropHeight: 0.56, cutHeight: 0.5 }).runToEnd();
    expect(r.w7.flattenedByHeader).toBeGreaterThan(1000);
    expect(r.checks.find((c) => c.id === 'W-1')!.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'W-7')!.ok).toBe(false);
  });

  it('満杯になってから運搬車を呼ぶと、オーガを振り出す間止まる → W-8 ✗', () => {
    const r = new HarvestScenario({ startTank: 0.97, unloadAt: 1 }).runToEnd();
    expect(r.stoppedFull).toBeGreaterThan(3);
    expect(r.checks.find((c) => c.id === 'W-8')!.ok).toBe(false);
  });
});

describe('作物フローを圃場シナリオから動かす', () => {
  const inputs = {
    pose: WORK_POSE, engineOn: true, headerOn: true, separatorOn: true, unloadOn: false,
    groundSpeed: 5, yield: 4.5, cropHeight: 0.8, draperSide: 2.5, draperCenter: 3.5, elevator: 3,
  };
  it('刈った量（feedKgS）で粒子を出し、タンクは外から決めた量のまま', () => {
    const fl = new FlowSystem(3);
    for (let i = 0; i < 300; i++) fl.update(1 / 30, { ...inputs, feedKgS: 15, tank: { mass: 1234, unloading: false } });
    const st = fl.stats();
    expect(st.cutting).toBe(true);
    expect(st.count.grain).toBeGreaterThan(50);
    expect(st.tankMass).toBe(1234);
    const idle = new FlowSystem(3);
    for (let i = 0; i < 60; i++) idle.update(1 / 30, { ...inputs, feedKgS: 0, tank: { mass: 0, unloading: false } });
    expect(idle.stats().count.crop).toBe(0);
  });
  it('排出中は排出の粒子を出し、運搬車の荷台の高さで止まる', () => {
    const fl = new FlowSystem(3);
    for (let i = 0; i < 90; i++) fl.update(1 / 30, { ...inputs, pose: { ...WORK_POSE, augerDeploy: 95 }, feedKgS: 0, tank: { mass: 5000, unloading: true }, unloadFloor: 2.3 });
    const ys = fl.particles.unload.map((q) => q.pos.y);
    expect(ys.length).toBeGreaterThan(20);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(2.3 - 1e-9);
  });
});

it('圃場の既定値（spec.field）', () => {
  const o = defaultFieldOptions();
  expect(o.length * o.width).toBe(5000);
  expect(spec.field.headland).toBeGreaterThanOrEqual(2 * spec.field.turnRadius);
});
