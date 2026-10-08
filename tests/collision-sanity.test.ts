/**
 * 検査そのものの確認：v0.1 の設計（docs/review.md R-02〜R-05）の値を入れると干渉として検出されること。
 */
import { describe, expect, it } from 'vitest';
import { checkPose } from '../src/collision/check';
import { DEFAULT_POSE } from '../src/model/kinematics';
import { buildParts } from '../src/model/parts';
import { spec, type Spec } from '../src/spec/spec';

type Mutable<T> = T extends number
  ? number
  : T extends readonly unknown[]
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : { -readonly [K in keyof T]: Mutable<T[K]> };
const variant = (edit: (s: Mutable<Spec>) => void): Spec => {
  const s = structuredClone(spec) as unknown as Mutable<Spec>;
  edit(s);
  return s as unknown as Spec;
};
const pairs = (s: Spec) => checkPose(buildParts(s), DEFAULT_POSE).map((v) => [v.a, v.b].sort().join(' × '));

describe('v0.1 の干渉を検出できる', () => {
  it('R-02 タンク底 2.35 m → ロータケージと干渉', () => {
    const found = pairs(variant((s) => { s.tank.y = [2.35, 3.92]; }));
    expect(found).toContain('tank × thresher.cage');
  });

  it('R-03 キャブ床 2.20 m → ロータケージと干渉', () => {
    const found = pairs(variant((s) => { s.cab.y = [2.2, 3.9]; }));
    expect(found).toContain('cab × thresher.cage');
  });

  it('R-04 エレベータ x = −1.10 → 右前輪と干渉', () => {
    const found = pairs(variant((s) => { s.shoe.elevator.x = -1.1; }));
    expect(found).toContain('grain.elevator × wheel.frontR');
  });

  it('R-05 排出オーガ z = −1.45（タンク左壁の線上）→ タンクと干渉', () => {
    const found = pairs(variant((s) => { s.unload.base = [-3.4, 2.6, -1.45]; }));
    expect(found).toEqual(expect.arrayContaining(['tank × unload.tube']));
  });
});
