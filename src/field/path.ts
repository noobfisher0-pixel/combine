/**
 * 圃場の走行経路（design §21、M6）。前車軸中心が通る線を、直線と円弧の区間で表す。
 * 後輪操舵の機体では前車軸中心が横滑りしないので、向き ＝ 経路の接線、曲率 κ から後輪の切れ角が決まる：
 *   tan(steer) = ホイールベース × κ（κ > 0 で右旋回、steer > 0 も右旋回）。
 */
import { spec } from '../spec/spec';
import type { MachinePlace } from './field';

export interface Segment {
  /** 区間の長さ [m] */
  length: number;
  /** 曲率 [1/m]（0 = 直線、> 0 = 右旋回） */
  kappa: number;
  /** 何番目の行程か（1〜）。旋回は 0 */
  pass: number;
}

interface Placed extends Segment {
  s0: number;
  start: MachinePlace;
}

/** 区間の始点から距離 u だけ進んだ位置と向き。psi は右旋回で減る（toField の定義） */
export function advance(p: MachinePlace, kappa: number, u: number): MachinePlace {
  if (Math.abs(kappa) < 1e-9) return { x: p.x + Math.cos(p.psi) * u, z: p.z - Math.sin(p.psi) * u, psi: p.psi };
  const psi = p.psi - kappa * u;
  return {
    x: p.x + (Math.sin(p.psi) - Math.sin(psi)) / kappa,
    z: p.z + (Math.cos(p.psi) - Math.cos(psi)) / kappa,
    psi,
  };
}

export class Path {
  readonly segs: Placed[] = [];
  readonly total: number;

  constructor(start: MachinePlace, segs: Segment[]) {
    let s = 0;
    let p = start;
    for (const g of segs) {
      if (g.length <= 1e-9) continue;
      this.segs.push({ ...g, s0: s, start: p });
      p = advance(p, g.kappa, g.length);
      s += g.length;
    }
    this.total = s;
  }

  private find(s: number): Placed {
    const segs = this.segs;
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (segs[m].s0 <= s) lo = m;
      else hi = m - 1;
    }
    return segs[lo];
  }

  at(s: number): MachinePlace & { kappa: number; pass: number } {
    const c = Math.max(0, Math.min(this.total, s));
    const g = this.find(c);
    return { ...advance(g.start, g.kappa, c - g.s0), kappa: g.kappa, pass: g.pass };
  }

  end(): MachinePlace {
    return this.at(this.total);
  }
}

/** 後輪の切れ角 [deg]（曲率から） */
export function steerFor(kappa: number, s = spec): number {
  return (Math.atan(-s.wheels.rear.x * kappa) * 180) / Math.PI;
}

/** 後輪操舵の最小旋回半径（前車軸中心） */
export function minTurnRadius(s = spec): number {
  return -s.wheels.rear.x / Math.tan((s.wheels.steerMax * Math.PI) / 180);
}

/**
 * U ターン：進行方向に対して横へ d [m]（side = +1 で右、−1 で左）ずれて逆向きになる区間。
 * d ≥ 2R：90° ＋ 直線 ＋ 90°。d < 2R：電球形（いったん反対へ β 切り、π＋2β 回って、β 戻す）。
 */
export function uTurn(d: number, R: number, side: 1 | -1): Segment[] {
  const k = side / R;
  if (d >= 2 * R) {
    return [
      { length: (Math.PI / 2) * R, kappa: k, pass: 0 },
      { length: d - 2 * R, kappa: 0, pass: 0 },
      { length: (Math.PI / 2) * R, kappa: k, pass: 0 },
    ];
  }
  // 電球形の横ずれは β = 0（半円）の 2R から、β を増やすと単調に減るので二分探索
  const lateral = (beta: number) => {
    const o = { x: 0, z: 0, psi: 0 };
    let p = advance(o, -k, beta * R);
    p = advance(p, k, (Math.PI + 2 * beta) * R);
    p = advance(p, -k, beta * R);
    return p.z * side;
  };
  let a = 0;
  let b = Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (lateral(m) > d) a = m;
    else b = m;
  }
  const beta = (a + b) / 2;
  return [
    { length: beta * R, kappa: -k, pass: 0 },
    { length: (Math.PI + 2 * beta) * R, kappa: k, pass: 0 },
    { length: beta * R, kappa: -k, pass: 0 },
  ];
}
