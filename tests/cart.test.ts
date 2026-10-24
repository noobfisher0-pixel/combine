/**
 * ゲーム G1（docs/game-design.md §4.3〜4.7・§10）：通れる格子、カートの AI、排出、トラック・得点、時間切れ。
 */
import { describe, expect, it } from 'vitest';
import { CUT, isStanding } from '../src/field/field';
import { BALANCE, REAL_DT } from '../src/game/balance';
import { standardMap } from '../src/game/map';
import { CART_RECT, SPOUT } from '../src/game/sim/cart';
import { KEY } from '../src/game/sim/combine';
import { GameSim } from '../src/game/sim/game';
import { CLEARANCE, PassGrid } from '../src/game/sim/grid';

const steps = (realSeconds: number) => Math.round(realSeconds / REAL_DT);
function run(sim: GameSim, n: number, keys: (i: number) => number = () => 0) {
  for (let i = 0; i < n && !sim.over; i++) sim.step(keys(i));
}
/** ヘッダを下げて目標速度まで上げる */
function goCutting(sim: GameSim, kmh: number) {
  sim.step(KEY.header);
  sim.step(0);
  for (let i = 0; i < Math.round(kmh / BALANCE.combine.tapStep); i++) {
    sim.step(KEY.up);
    sim.step(0);
  }
}
/** 刈りながらカートを呼び、着いたらオーガを振り出す */
function callAndUnload(sim: GameSim, n: number) {
  let called = false;
  let auger = false;
  run(sim, n, () => {
    let k = 0;
    if (!called) {
      called = true;
      k |= KEY.cart;
    }
    if (!auger && sim.cart.state === 'alongside') {
      auger = true;
      k |= KEY.auger;
    }
    return k;
  });
}

describe('通れる格子（§4.4、G-R-06）', () => {
  it('立毛の密度 30 % 以上の格子は通れず、カートの中心は通れない格子から 2.2 m 以上離れる', () => {
    const m = standardMap();
    const g = new PassGrid(m);
    g.rebuild(false);
    const [i, k] = g.cellOf(60, 35); // 畑の真ん中
    expect(g.raw[g.idx(i, k)]).toBe(1);
    const [hi, hk] = g.cellOf(-12, -12); // 枕地
    expect(g.raw[g.idx(hi, hk)]).toBe(0);
    expect(g.free(hi, hk)).toBe(true);
    // 畑の縁から 2 m の枕地は置けない、3 m なら置ける
    expect(g.free(...g.cellOf(-1.5, 30))).toBe(false);
    expect(g.free(...g.cellOf(-3.5, 30))).toBe(true);
    expect(CLEARANCE).toBeCloseTo(1.6 + 0.6);
  });

  it('孤立した少しの株（密度 30 % 未満）はふさがない', () => {
    const m = standardMap();
    const f = m.field;
    // 2 m × 2 m を刈って、1 セルだけ残す
    for (let k = 40; k < 44; k++) for (let i = 40; i < 44; i++) f.set(k * f.nx + i, CUT);
    f.set(41 * f.nx + 41, 0);
    const g = new PassGrid(m);
    g.rebuild(false);
    expect(g.raw[g.idx(...g.cellOf(20.25, 20.25))]).toBe(0);
  });

  it('A* は濃い立毛を避けて、畑の向こうの枕地へ回り込む', () => {
    const m = standardMap();
    const g = new PassGrid(m);
    g.rebuild(false);
    const goal = g.nearestFree(60, 85)!; // 畑の上側の枕地
    const path = g.findPath([-12, -12], goal)!;
    expect(path).not.toBeNull();
    for (let s = 0; s < path.length - 1; s++) {
      const [a, b] = [path[s], path[s + 1]];
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
      for (let t = 0; t <= n; t++) {
        const X = a[0] + ((b[0] - a[0]) * t) / n;
        const Z = a[1] + ((b[1] - a[1]) * t) / n;
        expect(m.inCrop(X, Z) && g.density(Math.floor(X), Math.floor(Z)) >= 0.3, `${X},${Z}`).toBe(false);
      }
    }
  });
});

describe('カートの AI（§4.4）', () => {
  it('呼ぶと枕地を通ってコンバインの左に着き、まっすぐ走る間はスパウトが荷台の上に 9 割以上ある', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    goCutting(sim, 5);
    run(sim, steps(10)); // 畑に入ってから呼ぶ
    sim.step(KEY.cart);
    for (let i = 0; i < steps(40) && sim.cart.state !== 'alongside'; i++) sim.step(0);
    expect(sim.cart.state).toBe('alongside');
    run(sim, steps(3)); // 寄せ終わるまで
    let ok = 0;
    let total = 0;
    // 柵に着く前の 15 秒（実時間）
    run(sim, steps(15), () => {
      total++;
      if (sim.cart.accepts(sim.combineView)) ok++;
      return 0;
    });
    expect(ok / total).toBeGreaterThan(0.9);
    // カートは作物の範囲の外（左の枕地）を走っている
    expect(sim.cart.z).toBeLessThan(0);
  });

  it('左に切ってヘッダが寄っても、カートは退いてコンバインに重ならない（接触は押し出すだけ、罰なし）', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    goCutting(sim, 5);
    sim.step(KEY.cart);
    run(sim, steps(60), () => (sim.cart.state === 'alongside' ? 0 : 0));
    expect(sim.cart.state).toBe('alongside');
    let overlapped = 0;
    run(sim, steps(4), () => {
      if (sim.cart.overlapsCombine(sim.combineView)) overlapped++;
      return KEY.left;
    });
    expect(overlapped).toBe(0);
    expect(sim.cart.avoid).toBeGreaterThan(1);
    expect(sim.collisions).toBe(0);
  });

  it('左側が立毛のとき（畑の中を −X へ走る）は並走せず、行程の出口の枕地で待つ', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    const c = sim.combine;
    Object.assign(c, { x: 80, z: 40, psi: Math.PI });
    sim.step(KEY.cart);
    run(sim, steps(40));
    expect(sim.cart.state).toBe('waiting');
    expect(sim.events.some((e) => e.kind === 'cartNoLane')).toBe(true);
    const w = sim.cart.waitPoint!;
    expect(sim.map.inCrop(w[0], w[1])).toBe(false);
    // 待つ場所は X < 0 の枕地（コンバインの進む先）で、Z はコンバインの左（+Z）側
    expect(w[0]).toBeLessThan(0);
    expect(w[1]).toBeGreaterThan(40);
    expect(sim.cart.trampledCells).toBeLessThan(20);
  });

  it('強行呼び出し（Shift＋E）は立毛の中を通って並走し、通った所を踏み倒す', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    Object.assign(sim.combine, { x: 60, z: 40, psi: Math.PI });
    sim.step(KEY.cart | KEY.cartForce);
    run(sim, steps(60));
    expect(sim.cart.state).toBe('alongside');
    expect(sim.cart.trampledCells).toBeGreaterThan(100);
    expect(sim.cart.trampleLoss).toBeGreaterThan(0);
  });
});

describe('排出・トラック・得点（§4.3・§4.5）', () => {
  it('並走中は 600 kg/s でタンクからカートへ。刈った量 ＝ タンク ＋ カート ＋ トラック（質量の釣り合い）', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    goCutting(sim, 5);
    callAndUnload(sim, steps(60));
    expect(sim.cart.load).toBeGreaterThan(3000);
    expect(sim.truck + sim.cart.load + sim.harvest.tank + sim.spill).toBeCloseTo(sim.harvest.stats.harvested, 3);
  });

  it('カートがいないと、ふつうでは流れない（むずかしいでは地面にこぼれる）', () => {
    for (const difficulty of ['normal', 'hard'] as const) {
      const sim = new GameSim(standardMap(), { autoStop: false, difficulty });
      sim.harvest.tank = 5000;
      sim.step(KEY.auger);
      run(sim, steps(5));
      if (difficulty === 'normal') {
        expect(sim.harvest.tank).toBe(5000);
        expect(sim.events.some((e) => e.kind === 'noCart')).toBe(true);
      } else {
        expect(sim.spill).toBeGreaterThan(2000);
        expect(sim.harvest.tank + sim.spill).toBeCloseTo(5000, 3);
      }
    }
  });

  it('カートが満杯になるとトラックへ戻り、荷下ろしした量が得点になる', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    sim.harvest.tank = 8000;
    sim.cart.load = BALANCE.cart.capacity - 3000;
    goCutting(sim, 3);
    callAndUnload(sim, steps(150));
    expect(sim.events.some((e) => e.kind === 'cartFull')).toBe(true);
    expect(sim.events.some((e) => e.kind === 'cartDumped')).toBe(true);
    expect(sim.truck).toBeCloseTo(BALANCE.cart.capacity, -1);
    expect(['idle', 'toCombine', 'waiting', 'alongside']).toContain(sim.cart.state);
  });

  it('E で帰したカートは中身を下ろして待機に戻る', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    sim.cart.load = 4000;
    sim.step(KEY.cart);
    sim.step(0);
    run(sim, steps(1));
    sim.step(KEY.cart); // 向かう途中で帰す
    run(sim, steps(60));
    expect(sim.cart.state).toBe('idle');
    expect(sim.truck).toBeCloseTo(4000, 3);
  });
});

describe('時間切れ（§4.7）とランク（§7.2）', () => {
  it('並走中なら最後に 1 回移し、カートの中身は全部数える。タンクに残った分は数えない', () => {
    const sim = new GameSim(standardMap(), { autoStop: false, roundTime: 60 });
    goCutting(sim, 5);
    callAndUnload(sim, steps(25));
    expect(sim.cart.state).toBe('alongside');
    // オーガを格納して、タンクに貯めたまま時間切れを迎える
    sim.step(KEY.auger);
    run(sim, steps(60));
    expect(sim.over).toBe(true);
    expect(sim.finalTransfer).toBeGreaterThan(0);
    expect(sim.truck).toBeCloseTo(sim.finalCart, 3);
    expect(sim.truck + sim.leftInTank).toBeGreaterThan(0);
  });

  it('時間切れでカートが離れていれば、タンクの分は数えない', () => {
    const sim = new GameSim(standardMap(), { autoStop: false, roundTime: 30 });
    goCutting(sim, 5);
    run(sim, steps(30));
    expect(sim.over).toBe(true);
    expect(sim.truck).toBe(0);
    expect(sim.leftInTank).toBeGreaterThan(1000);
    expect(sim.rank).toBe('C');
  });

  it('理論上の上限は、ロータの能力いっぱいの穀粒の流れ × （360 s − 旋回 88 s）で約 34 t', () => {
    const sim = new GameSim(standardMap());
    expect(sim.upperBound / 1000).toBeGreaterThan(30);
    expect(sim.upperBound / 1000).toBeLessThan(38);
    const tut = new GameSim(standardMap(), { roundTime: Infinity });
    expect(tut.upperBound).toBe(Infinity);
    run(tut, steps(500));
    expect(tut.over).toBe(false);
  });
});

it('スパウトの位置とカートの外形：並走時の隙間は約 1.6 m（§4.4）', () => {
  const gap = -SPOUT.z + CART_RECT.z0 - BALANCE.cart.capacity * 0 - 12.19 / 2;
  expect(gap).toBeCloseTo(1.65, 1);
  expect(isStanding(0)).toBe(true);
});
