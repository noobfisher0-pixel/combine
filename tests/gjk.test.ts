import { describe, expect, it } from 'vitest';
import { intersects } from '../src/collision/gjk';
import { supportOf, type WorldShape } from '../src/collision/shapes';

const box = (c: [number, number, number], half: [number, number, number], rotZdeg = 0): WorldShape => {
  const r = (rotZdeg * Math.PI) / 180;
  return {
    kind: 'box',
    center: c,
    axes: [[Math.cos(r), Math.sin(r), 0], [-Math.sin(r), Math.cos(r), 0], [0, 0, 1]],
    half,
  };
};
const hit = (a: WorldShape, b: WorldShape, m = 0) => intersects(supportOf(a, m), supportOf(b));

describe('GJK 交差判定', () => {
  it('離れた箱は交差しない／余裕で膨らませると交差する', () => {
    const a = box([0, 0, 0], [0.5, 0.5, 0.5]);
    const b = box([1.5, 0, 0], [0.5, 0.5, 0.5]); // 隙間 0.5
    expect(hit(a, b)).toBe(false);
    expect(hit(a, b, 0.49)).toBe(false);
    expect(hit(a, b, 0.51)).toBe(true);
  });

  it('重なった箱・内包は交差する', () => {
    expect(hit(box([0, 0, 0], [1, 1, 1]), box([0.5, 0.2, -0.3], [1, 1, 1]))).toBe(true);
    expect(hit(box([0, 0, 0], [2, 2, 2]), box([0.1, 0.1, 0.1], [0.2, 0.2, 0.2]))).toBe(true);
  });

  it('45° 回した箱の角までの距離', () => {
    // 半辺 0.5 の箱を 45° 回すと角は中心から 0.707
    const a = box([0, 0, 0], [0.5, 0.5, 0.5], 45);
    expect(hit(a, box([1.0, 0, 0], [0.25, 0.25, 0.25]))).toBe(false); // 0.707 + 0.25 < 1.0
    expect(hit(a, box([0.9, 0, 0], [0.25, 0.25, 0.25]))).toBe(true);
  });

  it('円柱と箱（円柱の側面までの距離は半径）', () => {
    const c: WorldShape = { kind: 'cyl', a: [0, 0, -1], b: [0, 0, 1], radius: 0.5 };
    // 斜め 45° 方向の箱：円柱の表面は中心から 0.5
    const d = 0.62 / Math.SQRT2;
    expect(hit(c, box([d, d, 0], [0.05, 0.05, 0.05]))).toBe(false); // 箱の最近点は 0.62-0.07 > 0.5
    expect(hit(c, box([0.52, 0, 0], [0.05, 0.05, 0.05]))).toBe(true);
    // 円柱の端面の外
    expect(hit(c, box([0, 0, 1.2], [0.1, 0.1, 0.1]))).toBe(false);
    expect(hit(c, box([0, 0, 1.2], [0.1, 0.1, 0.1]), 0.15)).toBe(true);
  });

  it('平行な円柱どうし', () => {
    const a: WorldShape = { kind: 'cyl', a: [0, 0, -1], b: [0, 0, 1], radius: 0.3 };
    const b: WorldShape = { kind: 'cyl', a: [0.7, 0, -1], b: [0.7, 0, 1], radius: 0.3 };
    expect(hit(a, b)).toBe(false); // 隙間 0.1
    expect(hit(a, b, 0.09)).toBe(false);
    expect(hit(a, b, 0.11)).toBe(true);
  });
});
