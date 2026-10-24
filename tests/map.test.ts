/**
 * ゲーム G2：マップの自動生成（docs/game-design.md §6・§10）。
 */
import { describe, expect, it } from 'vitest';
import { LODGED, NONE } from '../src/field/field';
import { BALANCE } from '../src/game/balance';
import { buildMap, checkPlan, dailySeed, generateMap, MAP_RULES, planMap, pointInPolygon, polygonArea, type Shape } from '../src/game/map';
import { Cart } from '../src/game/sim/cart';

describe('計画（1,000 シード × 3 難易度）', () => {
  for (const d of ['easy', 'normal', 'hard'] as const) {
    it(`${d}：すべて検査に通り、作り直しは 10 回以内、標準マップに落ちるのは 1 % 未満`, () => {
      const shapes = new Set<Shape>();
      let fallback = 0;
      let maxAttempt = 0;
      for (let i = 0; i < 1000; i++) {
        const p = planMap(`seed-${i}`, d);
        expect(checkPlan(p), `seed-${i}`).toEqual([]);
        if (p.fallback) fallback++;
        maxAttempt = Math.max(maxAttempt, p.attempt);
        shapes.add(p.shape);
        // 置ける場所が足りなければ減ることがある（下限は保証しない）が、上限は超えない
        if (!p.fallback) expect(p.obstacles.length).toBeLessThanOrEqual(MAP_RULES.obstacles[d][1]);
        if (d !== 'hard') expect(p.lodged.length + p.water.length).toBe(0);
        if (d === 'easy') expect(p.obstacles.length).toBe(0);
      }
      expect(fallback).toBeLessThan(10);
      expect(maxAttempt).toBeLessThanOrEqual(MAP_RULES.maxAttempts);
      expect([...shapes].sort()).toEqual(d === 'easy' ? ['rect', 'trapezoid'] : ['L', 'notch', 'rect', 'trapezoid']);
    });
  }

  it('障害物どうし・障害物と作物の縁は、外周のすき間が 14 m 以上（刈幅 12.19 m より広い）', () => {
    for (let i = 0; i < 300; i++) {
      const p = planMap(`gap-${i}`, 'hard');
      for (const o of p.obstacles) {
        for (const q of p.obstacles) {
          if (o === q) continue;
          expect(Math.hypot(o.x - q.x, o.z - q.z) - o.r - q.r).toBeGreaterThanOrEqual(MAP_RULES.spacing - 1e-6);
        }
      }
    }
    expect(MAP_RULES.spacing).toBeGreaterThan(12.19);
  });

  it('同じシードと難易度なら同じ計画、違えば違う計画。今日のマップは UTC の日付', () => {
    expect(planMap('x', 'hard')).toEqual(planMap('x', 'hard'));
    expect(planMap('x', 'hard')).not.toEqual(planMap('y', 'hard'));
    expect(dailySeed(new Date(Date.UTC(2026, 9, 24, 23, 30)))).toBe('2026-10-24');
  });

  it('多角形の判定と面積', () => {
    const sq: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(sq, 5, 5)).toBe(true);
    expect(pointInPolygon(sq, 11, 5)).toBe(false);
    expect(polygonArea(sq)).toBe(100);
  });
});

describe('セル（buildMap）', () => {
  it('作物の範囲の外・障害物・水たまりは NONE、倒れた小麦は LODGED。穀粒の合計はセルの和と一致', () => {
    for (let i = 0; i < 6; i++) {
      const m = generateMap(`cells-${i}`, 'hard');
      const f = m.field;
      let crop = 0;
      for (let k = 0; k < f.nz; k++) {
        for (let j = 0; j < f.nx; j++) {
          const X = (j + 0.5) * f.cell;
          const Z = (k + 0.5) * f.cell;
          const s = f.state[k * f.nx + j];
          if (!m.inCrop(X, Z) || m.inWater(X, Z) || m.obstacles.some((o) => Math.hypot(o.x - X, o.z - Z) < o.r)) expect(s).toBe(NONE);
          else if (s !== NONE) crop++;
        }
      }
      expect(f.cropCells).toBe(crop);
      if (m.lodged.length) expect(f.state.some((s) => s === LODGED)).toBe(true);
      expect(f.grain.reduce((a, b) => a + b, 0)).toBeCloseTo(f.totalGrain, 0);
      expect(f.cell).toBe(BALANCE.map.cell);
    }
  });

  it('同じ計画からは同じ畑ができる', () => {
    const p = planMap('same', 'normal');
    const a = buildMap(p).field;
    const b = buildMap(p).field;
    expect(Array.from(a.grain.slice(0, 2000))).toEqual(Array.from(b.grain.slice(0, 2000)));
    expect(Array.from(a.state)).toEqual(Array.from(b.state));
  });

  it('トラックの横から枕地の 4 隅へ、カートが通れる（20 シード）', () => {
    for (let i = 0; i < 20; i++) {
      const m = generateMap(`reach-${i}`, i % 2 ? 'hard' : 'normal');
      const cart = new Cart(m);
      cart.grid.rebuild(false);
      const hl = m.headland;
      for (const [x, z] of [[-hl + 6, -hl + 6], [m.length + hl - 6, -hl + 6], [m.length + hl - 6, m.width + hl - 6], [-hl + 6, m.width + hl - 6]]) {
        const goal = cart.grid.nearestFree(x, z)!;
        expect(goal, `reach-${i}`).not.toBeNull();
        expect(cart.grid.findPath([cart.home.x, cart.home.z], goal), `reach-${i} → ${x},${z}`).not.toBeNull();
      }
    }
  });
});
