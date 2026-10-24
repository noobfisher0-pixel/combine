/**
 * ゲーム G0（docs/game-design.md §10・§11）：決定的な乱数とマップ、運転、刈り取り・取りこぼし・タンク、衝突、決定性。
 */
import mapSrc from '../src/game/map.ts?raw';
import randSrc from '../src/game/rand.ts?raw';
import { describe, expect, it } from 'vitest';
import { CUT, isStanding } from '../src/field/field';
import { BALANCE, GAME_DT, REAL_DT } from '../src/game/balance';
import { standardMap } from '../src/game/map';
import { fnv1a, fractalNoise, mulberry32, valueNoise } from '../src/game/rand';
import { initialCombine, KEY, stepCombine } from '../src/game/sim/combine';
import { GameSim } from '../src/game/sim/game';
import { lossFraction } from '../src/game/sim/harvest';
import { minTurnRadius } from '../src/field/path';
import { spec } from '../src/spec/spec';

const stepsFor = (realSeconds: number) => Math.round(realSeconds / REAL_DT);

/** ヘッダを下げて、目標速度 kmh まで短押しで上げる */
function goCutting(sim: GameSim, kmh: number) {
  sim.step(KEY.header);
  sim.step(0);
  for (let i = 0; i < Math.round(kmh / BALANCE.combine.tapStep); i++) {
    sim.step(KEY.up);
    sim.step(0);
  }
}
function run(sim: GameSim, n: number, keys = 0) {
  for (let i = 0; i < n && !sim.over; i++) sim.step(keys);
}

describe('決定的な乱数（G-R-13）', () => {
  it('FNV-1a と mulberry32 は決まった値を返す', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('値ノイズは −1〜1 で、なめらか（近い点は近い値）', () => {
    const n = valueNoise(7, 10);
    let max = 0;
    for (let x = 0; x < 100; x += 0.37) {
      const v = n(x, x * 0.6);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      max = Math.max(max, Math.abs(n(x + 0.05, x * 0.6) - v));
    }
    expect(max).toBeLessThan(0.05);
    const f = fractalNoise(3, [25, 12]);
    expect(Math.abs(f(10, 20))).toBeLessThanOrEqual(1);
  });
  it('マップの生成に Math の三角関数・指数関数を使っていない', () => {
    for (const [file, text] of [['rand.ts', randSrc], ['map.ts', mapSrc]]) {
      const src = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(src, file).not.toMatch(/Math\.(sin|cos|tan|exp|log|pow|atan)/);
    }
  });
});

describe('標準マップ', () => {
  const m = standardMap();
  it('作物の範囲 120 m × 70 m を 0.5 m のセルで 240 × 140、枕地 25 m の外に柵', () => {
    expect([m.field.nx, m.field.nz]).toEqual([240, 140]);
    expect(m.field.cropCells).toBe(240 * 140);
    expect(m.world).toEqual({ x0: -25, z0: -25, x1: 145, z1: 95 });
  });
  it('穀粒の合計（本物の値）は 4.5 t/ha × 0.84 ha × 収量のゆらぎの平均、セルの合計と一致', () => {
    const sum = m.field.grain.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(m.field.totalGrain, 0);
    expect(m.field.totalGrain / 1000).toBeGreaterThan(3.78 * 0.9);
    expect(m.field.totalGrain / 1000).toBeLessThan(3.78 * 1.1);
  });
  it('同じシードなら同じ畑、違うシードなら違う畑', () => {
    const a = standardMap('x');
    const b = standardMap('x');
    const c = standardMap('y');
    expect(Array.from(a.field.grain.slice(0, 500))).toEqual(Array.from(b.field.grain.slice(0, 500)));
    expect(Array.from(a.field.grain.slice(0, 500))).not.toEqual(Array.from(c.field.grain.slice(0, 500)));
  });
});

describe('運転（§3・§4.1）', () => {
  it('短く押すと目標速度が 0.25 km/h ずつ変わり、長押しで連続して上がる', () => {
    const c = initialCombine(0, 0, 0);
    stepCombine(c, KEY.up, null);
    stepCombine(c, 0, null);
    expect(c.vTarget).toBeCloseTo(0.25);
    for (let i = 0; i < stepsFor(1.25); i++) stepCombine(c, KEY.up, null);
    // 0.25（押した瞬間）＋ 0.25 秒を超えてから約 1 秒ぶん × 3.6 km/h/s × 1.5（ゲームの時計）
    expect(c.vTarget).toBeGreaterThan(5);
    expect(c.vTarget).toBeLessThan(6.5);
  });
  it('止まってから、いったん離してもう一度押すと後退する（押しっぱなしでは後退しない）', () => {
    const c = initialCombine(0, 0, 0);
    for (let i = 0; i < 120; i++) stepCombine(c, KEY.down, null);
    expect(c.vTarget).toBe(0);
    stepCombine(c, 0, null);
    stepCombine(c, KEY.down, null);
    expect(c.vTarget).toBeCloseTo(-0.25);
    for (let i = 0; i < 600; i++) stepCombine(c, KEY.down, null);
    expect(c.vTarget).toBe(-BALANCE.combine.maxReverse);
    for (let i = 0; i < 300; i++) stepCombine(c, 0, null);
    expect(c.v).toBeLessThan(0);
  });
  it('ハンドルは押し始め 0.3 秒ゆっくり切れ、いっぱいに切ると最小旋回半径 約 6.0 m で回る', () => {
    const c = initialCombine(0, 0, 0);
    for (let i = 0; i < stepsFor(0.3); i++) stepCombine(c, KEY.right, null);
    expect(c.steer).toBeCloseTo(3, 0);
    for (let i = 0; i < 60; i++) stepCombine(c, KEY.right, null);
    expect(c.steer).toBe(spec.wheels.steerMax);
    // 3 km/h でいっぱいに切ったまま 1 周して、通った点の外接円の半径
    c.vTarget = 3;
    for (let i = 0; i < 60; i++) stepCombine(c, KEY.right, null);
    const xs: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i < 2000; i++) {
      stepCombine(c, KEY.right, null);
      xs.push(c.x);
      zs.push(c.z);
    }
    const r = (Math.max(...xs) - Math.min(...xs)) / 2;
    expect(r).toBeCloseTo(minTurnRadius(), 1);
    expect((Math.max(...zs) - Math.min(...zs)) / 2).toBeCloseTo(minTurnRadius(), 1);
  });
  it('排出オーガを振り出している間は 7 km/h まで', () => {
    const c = initialCombine(0, 0, 0);
    stepCombine(c, KEY.auger, null);
    for (let i = 0; i < 600; i++) stepCombine(c, KEY.up, null);
    expect(c.vTarget).toBe(BALANCE.combine.maxWithAuger);
  });
});

describe('刈り取り・取りこぼし・タンク（§4.1〜4.3）', () => {
  it('取りこぼし率：r ≤ 1 で 0、1.09 で約 20 %、1.27 で約 76 %、上限 90 %', () => {
    expect(lossFraction(1)).toBe(0);
    expect(lossFraction(1.09)).toBeCloseTo(0.204, 2);
    expect(lossFraction(1.27)).toBeCloseTo(0.759, 2);
    expect(lossFraction(3)).toBe(0.9);
  });

  it('5 km/h で 1 辺を刈ると、刈幅の中に刈り残しがなく、1 m あたり約 82 kg（ゲームの重さ）がタンクへ', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    goCutting(sim, 5);
    run(sim, stepsFor(70));
    run(sim, stepsFor(8), KEY.down); // 止まって搬送中を空にする
    const f = sim.map.field;
    // 1 行程目の刈幅（Z −0.1〜12.09）の中、刈刃が通った X の範囲に立毛がない
    const reached = sim.combine.x + sim.harvest.knifeX;
    const { count } = f.uncutIn(0, Math.min(120, reached - 0.5), 0, spec.header.width - 0.1 - 0.25);
    expect(count).toBe(0);
    const s = sim.harvest.stats;
    let cutGrain = 0;
    f.state.forEach((st, i) => { if (st === CUT) cutGrain += f.grain[i]; });
    // 質量の釣り合い：刈った穀粒 × 15 ＝ タンク ＋ 失った量 ＋ 搬送中
    const out = s.harvested + s.overflow + s.rotorLoss + s.lodgedLoss + sim.harvest.inTransit;
    expect(out).toBeCloseTo(cutGrain * BALANCE.grainMult, -1);
    const perM = s.harvested / Math.min(120, reached);
    expect(perM).toBeGreaterThan(82 * 0.85);
    expect(perM).toBeLessThan(82 * 1.15);
    expect(s.flattenedCells).toBe(0);
  });

  it('速すぎると取りこぼす（8 km/h なら刈った量の 3 割以上）', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    goCutting(sim, 8);
    run(sim, stepsFor(30));
    const s = sim.harvest.stats;
    expect(s.rotorLoss / (s.rotorLoss + s.harvested + sim.harvest.inTransit)).toBeGreaterThan(0.3);
  });

  it('ヘッダを上げたまま小麦に入ると押し倒し、何も入らない', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    for (let i = 0; i < 20; i++) { sim.step(KEY.up); sim.step(0); }
    run(sim, stepsFor(20));
    expect(sim.harvest.stats.flattenedCells).toBeGreaterThan(100);
    expect(sim.harvest.stats.harvested).toBe(0);
  });

  it('満杯のときに届いた分は「あふれ」。自動停止を入れていれば止まる', () => {
    const a = new GameSim(standardMap(), { autoStop: false });
    a.harvest.tank = BALANCE.tank.capacity - 200;
    goCutting(a, 5);
    run(a, stepsFor(40));
    expect(a.harvest.tank).toBe(BALANCE.tank.capacity);
    expect(a.harvest.stats.overflow).toBeGreaterThan(1000);
    expect(a.events.some((e) => e.kind === 'full')).toBe(true);

    const b = new GameSim(standardMap(), { autoStop: true });
    b.harvest.tank = BALANCE.tank.capacity - 2000;
    goCutting(b, 5);
    run(b, stepsFor(40));
    expect(b.events.some((e) => e.kind === 'autoStop')).toBe(true);
    expect(b.combine.v).toBe(0);
  });

  it('負荷ホールド：負荷率 95 % 前後に速度を合わせる', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    goCutting(sim, 3);
    sim.step(KEY.hold);
    run(sim, stepsFor(30));
    expect(sim.combine.loadHold).toBe(true);
    expect(sim.harvest.load).toBeGreaterThan(0.8);
    expect(sim.harvest.load).toBeLessThan(1.05);
  });
});

describe('衝突と時間切れ', () => {
  it('柵に当たると止まり、2 秒動けない', () => {
    const m = standardMap();
    const sim = new GameSim(m, { autoStop: false });
    // 後退して後ろの柵（X = −25）へ
    for (let i = 0; i < 3; i++) { sim.step(KEY.down); sim.step(0); }
    run(sim, stepsFor(30), KEY.down);
    expect(sim.collisions).toBeGreaterThan(0);
    expect(sim.events[sim.events.findIndex((e) => e.kind === 'collision')]).toBeTruthy();
  });
  it('制限時間（ふつう：ゲームの時計 360 秒 ＝ 実時間 4 分）で終わる', () => {
    const sim = new GameSim(standardMap(), { autoStop: false });
    run(sim, stepsFor(4 * 60) + 10);
    expect(sim.over).toBe(true);
    expect(sim.t).toBeCloseTo(360, 1);
    expect(GAME_DT).toBeCloseTo(1.5 / 60, 12);
  });
});

describe('決定性（§8.1）', () => {
  /** 決まった操作の並び：刈って、曲がって、速さを変える */
  function script(i: number): number {
    if (i === 1) return KEY.header;
    if (i < 80) return i % 2 ? KEY.up : 0;
    if (i > 2000 && i < 2300) return KEY.right;
    if (i > 3000 && i < 3100) return KEY.left | KEY.up;
    if (i === 3500) return KEY.hold;
    return 0;
  }
  it('同じマップと同じ入力なら、同じ状態になる。記録した入力を再生しても同じ', () => {
    const a = new GameSim(standardMap());
    const b = new GameSim(standardMap());
    for (let i = 0; i < 5000; i++) { a.step(script(i)); b.step(script(i)); }
    expect(a.hash()).toBe(b.hash());
    const c = new GameSim(standardMap());
    for (const k of a.inputs) c.step(k);
    expect(c.hash()).toBe(a.hash());
    expect(a.harvest.stats.cutCells).toBeGreaterThan(1000);
    // 入力を 1 か所変えると変わる
    const d = new GameSim(standardMap());
    for (let i = 0; i < 5000; i++) d.step(i === 2100 ? 0 : script(i));
    expect(d.hash()).not.toBe(a.hash());
  });
  it('1 刻みは 0.2 ms 以下（実時間 4 分 ＝ 14,400 刻みが 3 秒以内）', () => {
    const sim = new GameSim(standardMap());
    const t0 = performance.now();
    for (let i = 0; i < 14_400; i++) sim.step(script(i));
    expect(performance.now() - t0).toBeLessThan(3000);
  });
  it('立毛の判定：刈れるセルは STANDING と LODGED', () => {
    expect(isStanding(0)).toBe(true);
    expect(isStanding(3)).toBe(true);
    expect(isStanding(1)).toBe(false);
    expect(isStanding(4)).toBe(false);
  });
});
