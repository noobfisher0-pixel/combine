/**
 * 基準のボット（docs/game-design.md §9）。プレイヤーと同じシミュレーションを、キーの入力だけで運転する。
 *
 * - 回り方：回り刈り（外周から時計回り、角は左へ 270° のループ）か、往復刈り（比べるため）。
 *   経路は外接長方形で作り、作物のない所（L 字の欠けなど）はそのまま通る。
 * - 運転：経路を pure pursuit でなぞり、必要な切れ角とのずれでハンドルのキーを押す。刈っている間は負荷ホールド。
 * - 障害物：前方の経路の近くにあれば、経路を横へずらしてよける（よけた所は刈り残す）。
 * - ヘッダ：刈刃の前に立毛があれば下げ、なければ上げる。
 * - カート：タンク（＋搬送中）が 60 % で呼び、横に来たらオーガを出す。むずかしいでは、いないときはしまう。
 * 決定的（乱数を使わない）なので、同じマップなら同じ点になる。
 */
import { isStanding, toField, toMachine, type MachinePlace } from '../field/field';
import { advance, Path, uTurn, type Segment } from '../field/path';
import { spec } from '../spec/spec';
import { BALANCE, REAL_DT } from './balance';
import type { GameMap } from './map';
import { KEY } from './sim/combine';
import { GameSim } from './sim/game';

export type Pattern = 'circuit' | 'backforth';
export interface BotOptions {
  pattern: Pattern;
  /** 速さを固定する [km/h]（省略時は負荷ホールド） */
  speed?: number;
  /** カートを呼ぶタンク量（タンク＋搬送中の割合） */
  callAt?: number;
}

const HW = spec.header.width / 2;
const R = spec.field.turnRadius;
const WHEELBASE = -spec.wheels.rear.x;
const STEP = spec.header.width - 0.2; // 行程の間隔（重なり 0.2 m）
const LOOKAHEAD = 7;

/** 円弧・直線を 1 m ごとの点にする */
function sample(start: MachinePlace, segs: Segment[]): Array<[number, number]> {
  const p = new Path(start, segs);
  const pts: Array<[number, number]> = [];
  for (let s = 0; s <= p.total; s += 1) {
    const q = p.at(s);
    pts.push([q.x, q.z]);
  }
  return pts;
}

/** 回り刈り：外接長方形を外周から内側へ。各辺の終わりで左へ 270° 回って次の辺へ */
export function circuitRoute(map: GameMap): Array<[number, number]> {
  const L = map.length;
  const W = map.width;
  const pts: Array<[number, number]> = [];
  let c = HW - 0.1;
  let cur: MachinePlace = { ...map.start };
  // 向き：+X → +Z → −X → −Z（psi：0, −π/2, π, π/2）
  const loop: Segment = { length: 1.5 * Math.PI * R, kappa: -1 / R, pass: 0 };
  for (let lap = 0; c < Math.min(L, W) / 2; lap++, c += STEP) {
    const cNext = c + STEP;
    // 各辺：直線の長さ（角でループを始める位置まで）
    const edges: Array<{ to: number; psi: number }> = [
      { to: L - c + R, psi: 0 }, // 下の辺：X まで
      { to: W - c + R, psi: -Math.PI / 2 }, // 右の辺：Z まで
      { to: c - R, psi: Math.PI }, // 上の辺：X まで
      { to: cNext - R, psi: Math.PI / 2 }, // 左の辺：Z まで（次の周の下の辺へ）
    ];
    for (const e of edges) {
      const along = e.psi === 0 ? e.to - cur.x : e.psi === Math.PI ? cur.x - e.to : e.psi < 0 ? e.to - cur.z : cur.z - e.to;
      const segs: Segment[] = [{ length: Math.max(0, along), kappa: 0, pass: lap + 1 }, loop];
      const s = sample(cur, segs);
      pts.push(...s);
      let p = advance(cur, 0, Math.max(0, along));
      p = advance(p, loop.kappa, loop.length);
      cur = p;
    }
  }
  return pts;
}

/** 往復刈り：+X と −X を交互に。端で U ターン（M6 と同じ形） */
export function backforthRoute(map: GameMap): Array<[number, number]> {
  const L = map.length;
  const W = map.width;
  // 刈刃が作物を出たところで回り始める（電球形の U ターンは前に約 13 m ふくらむので、柵の内側に収める）
  const out = 0;
  const segs: Segment[] = [];
  let x = map.start.x;
  let fwd = true;
  for (let z = HW - 0.1; z < W + HW; z += STEP) {
    const to = fwd ? L + out : -out;
    segs.push({ length: Math.abs(to - x), kappa: 0, pass: 1 });
    segs.push(...uTurn(STEP, R, fwd ? 1 : -1));
    x = to;
    fwd = !fwd;
  }
  return sample(map.start, segs);
}

export class Bot {
  private route: Array<[number, number]>;
  private idx = 0;
  private offset = 0;
  private offsetTarget = 0;
  private tap = 0;
  private recoverT = 0;
  private lastKeys = 0;
  private seenCollisions = 0;
  readonly opts: BotOptions;

  constructor(private sim: GameSim, opts: Partial<BotOptions> = {}) {
    this.opts = { pattern: 'circuit', callAt: 0.6, ...opts };
    this.route = this.opts.pattern === 'circuit' ? circuitRoute(sim.map) : backforthRoute(sim.map);
  }

  get done(): boolean {
    return this.idx >= this.route.length - 2;
  }

  /** 経路の上の今の位置から先の点（障害物をよける横のずれつき） */
  private target(pl: MachinePlace): [number, number] {
    const r = this.route;
    // いちばん近い点を少し先まで探す
    let best = this.idx;
    let bd = Infinity;
    for (let i = this.idx; i < Math.min(r.length, this.idx + 40); i++) {
      const d = (r[i][0] - pl.x) ** 2 + (r[i][1] - pl.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    this.idx = best;
    const j = Math.min(r.length - 1, best + LOOKAHEAD);
    const a = r[Math.max(0, j - 1)];
    const b = r[j];
    // 経路の右向き：進む向き (dx, dz) の右 ＝ (−dz, dx)
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    return [b[0] - (dz / len) * this.offset, b[1] + (dx / len) * this.offset];
  }

  /**
   * 前方の障害物（経路の 3 m 後ろ〜35 m 先）をすべて見て、経路を横へずらす量（右を正）を決める。
   * 候補（0、各障害物の右・左ぎりぎり）のうち、すべての障害物から離れられて、今のずれにいちばん近いもの。
   * どれも無理なら、いちばん近い障害物を避けられるもの。曲がっている所でも経路に沿って調べる
   */
  private planAvoid(pl: MachinePlace) {
    void pl;
    const r = this.route;
    const near: Array<{ lateral: number; clear: number; at: number }> = [];
    for (const o of this.sim.map.obstacles) {
      for (let i = Math.max(0, this.idx - 3); i < Math.min(r.length - 1, this.idx + 35); i++) {
        const [ax, az] = r[i];
        const dx = r[i + 1][0] - ax;
        const dz = r[i + 1][1] - az;
        const len = Math.hypot(dx, dz) || 1;
        const ox = o.x - ax;
        const oz = o.z - az;
        const along = (ox * dx + oz * dz) / len;
        if (along < -0.5 || along > 0.5) continue;
        const lateral = (-ox * dz + oz * dx) / len;
        if (Math.abs(lateral) > 25) continue;
        near.push({ lateral, clear: HW + o.r + 0.8, at: i });
        break;
      }
    }
    if (near.length === 0) {
      this.offsetTarget = 0;
      return;
    }
    const ok = (off: number, list: typeof near) => list.every((n) => Math.abs(n.lateral - off) >= n.clear - 1e-6);
    // 今のずれにいちばん近い候補を選ぶ（よけている途中で反対側へ切り替えて、障害物を横切らないように）
    const cands = [0, ...near.flatMap((n) => [n.lateral + n.clear, n.lateral - n.clear])].sort((a, b) => Math.abs(a - this.offset) - Math.abs(b - this.offset));
    let pick = cands.find((c) => ok(c, near));
    if (pick === undefined) {
      const first = near.reduce((a, b) => (a.at < b.at ? a : b));
      pick = cands.find((c) => ok(c, [first])) ?? 0;
    }
    this.offsetTarget = pick;
  }

  /** 衝突した後：止まっている間は待ち、そのあと 1.5 秒下がる（後退は「離して、もう一度押す」） */
  private recover(): number {
    const c = this.sim.combine;
    if (c.stun > 0) return 0;
    this.recoverT -= REAL_DT * BALANCE.timeScale;
    if (this.recoverT <= 0) return 0;
    if (c.vTarget >= 0) return this.sim.steps % 2 ? KEY.down : 0;
    return KEY.down;
  }

  /** この刻みのキー。切り替えのキー（ヘッダ・オーガ・ホールド・カート）は、前の刻みで押していたら 1 刻み離す */
  keys(): number {
    let k = this.decide();
    const TOGGLES = KEY.header | KEY.auger | KEY.hold | KEY.cart;
    k &= ~(this.lastKeys & TOGGLES);
    this.lastKeys = k;
    return k;
  }

  private decide(): number {
    const sim = this.sim;
    const c = sim.combine;
    const h = sim.harvest;
    const pl = sim.place;
    let k = 0;
    if (sim.collisions > this.seenCollisions) {
      this.seenCollisions = sim.collisions;
      this.recoverT = 1.5;
      // いちばん近い障害物を、余裕を 1 m 増やしてよけ直す（経路の向きは今の向きで近似）
      let best: { d: number; mz: number; o: { x: number; z: number; r: number } } | null = null;
      for (const ob of sim.map.obstacles) {
        const [mx, mz] = toMachine(pl, ob.x, ob.z);
        const d = Math.hypot(mx, mz);
        if (!best || d < best.d) best = { d, mz, o: ob };
      }
      // 下がったあと、ずれを今の値から少し大きくして通り直す（planAvoid が毎刻み決め直す）
      if (best && best.d < 15) this.offset += best.mz > 0 ? -1 : 1;
    }
    if (this.recoverT > 0 || c.stun > 0) {
      const rk = this.recover();
      if (this.recoverT > 0 || c.stun > 0) return rk;
    }
    if (this.done) {
      // 経路の終わり：止まる
      if (c.vTarget > 0) k |= sim.steps % 2 ? KEY.down : 0;
      return k;
    }

    // --- ハンドル
    this.planAvoid(pl);
    const dOff = 2.0 * REAL_DT * BALANCE.timeScale; // 横へずらす速さ 2 m/s
    this.offset += Math.max(-dOff, Math.min(dOff, this.offsetTarget - this.offset));
    const [tx, tz] = this.target(pl);
    const [mx, mz] = toMachine(pl, tx, tz);
    const ld2 = Math.max(1, mx * mx + mz * mz);
    const kappa = (2 * mz) / ld2;
    const want = Math.max(-spec.wheels.steerMax, Math.min(spec.wheels.steerMax, (Math.atan(WHEELBASE * kappa) * 180) / Math.PI));
    if (want > c.steer + 0.7) k |= KEY.right;
    else if (want < c.steer - 0.7) k |= KEY.left;

    // --- ヘッダ：刈刃の前に立毛があれば下げる
    const wantDown = this.cropAhead(pl);
    if (wantDown === c.headerUp) k |= KEY.header;

    // --- 速さ
    const target = this.opts.speed ?? 5;
    if (this.opts.speed === undefined && !c.headerUp && h.knifeY < 0.5) {
      if (!c.loadHold) k |= KEY.hold;
    } else {
      if (c.loadHold) k |= KEY.hold;
      // 短く押して目標に合わせる（押す・離すを交互に）
      this.tap++;
      if (this.tap % 2 === 0) {
        if (c.vTarget < target - 0.2) k |= KEY.up;
        else if (c.vTarget > target + 0.2) k |= KEY.down;
      }
    }

    // --- カート
    const fill = (h.tank + h.inTransit) / BALANCE.tank.capacity;
    const cart = sim.cart;
    if (cart.state === 'idle' && fill >= (this.opts.callAt ?? 0.6)) k |= KEY.cart;
    // むずかしい：スパウトが荷台の上にあるときだけ出す（いないと地面にこぼれる）
    const wantAuger = sim.opts.difficulty === 'hard'
      ? cart.state === 'alongside' && cart.accepts(sim.combineView) && Math.abs(c.steer) < 10
      : cart.state === 'alongside' || c.augerOut;
    if (wantAuger !== c.augerOut) k |= KEY.auger;
    return k;
  }

  /** 刈刃の線の少し前（−0.5〜3.5 m）に立毛があるか */
  private cropAhead(pl: MachinePlace): boolean {
    const f = this.sim.map.field;
    const kx = this.sim.harvest.knifeX || 5.3;
    for (let a = -0.5; a <= 3.5; a += 0.5) {
      for (let b = -HW + 0.3; b <= HW - 0.3; b += 0.5) {
        const [X, Z] = toField(pl, kx + a, b);
        const i = Math.floor(X / f.cell);
        const kk = Math.floor(Z / f.cell);
        if (i < 0 || kk < 0 || i >= f.nx || kk >= f.nz) continue;
        if (isStanding(f.state[kk * f.nx + i])) return true;
      }
    }
    return false;
  }
}

export interface BotResult {
  score: number;
  ratio: number;
  rank: string;
  harvested: number;
  losses: { overflow: number; rotor: number; lodged: number; flatten: number; trample: number; spill: number; leftInTank: number };
  collisions: number;
  timeline: Array<[number, string]>;
}

/** ボットで 1 ラウンド遊ぶ */
export function runBot(sim: GameSim, opts: Partial<BotOptions> = {}): BotResult {
  const bot = new Bot(sim, opts);
  const timeline: Array<[number, string]> = [];
  let seen = 0;
  const NAMES: Record<string, string> = {
    tank70: 'タンク 70 %', cartCalled: 'カートを呼ぶ', cartArrived: 'カートが並走', cartFull: 'カートが満杯 → トラックへ',
    cartDumped: 'トラックに下ろす', cartNoLane: 'カートが待つ（左に通り道なし）', full: 'タンク満杯', collision: '衝突', timeUp: '時間切れ',
  };
  while (!sim.over && sim.steps < 60 * 60 * 30) {
    sim.step(bot.keys());
    for (; seen < sim.events.length; seen++) {
      const e = sim.events[seen];
      if (NAMES[e.kind]) timeline.push([e.t, NAMES[e.kind]]);
    }
  }
  const s = sim.harvest.stats;
  return {
    score: sim.truck,
    ratio: sim.ratio,
    rank: sim.rank,
    harvested: s.harvested,
    losses: { overflow: s.overflow, rotor: s.rotorLoss, lodged: s.lodgedLoss, flatten: s.flattenLoss, trample: sim.cart.trampleLoss, spill: sim.spill, leftInTank: sim.leftInTank },
    collisions: sim.collisions,
    timeline,
  };
}
