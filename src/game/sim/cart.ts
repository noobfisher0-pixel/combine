/**
 * グレインカート（トラクタ＋荷車）の AI（docs/game-design.md §4.4・§8.3）。
 *
 * - 位置の基準は荷台の中心。1 つの剛体（長さ 12 m：荷台の後端 −3 m 〜 トラクタの先端 +9 m、幅 3.2 m）として扱う。
 * - 状態：待機 → 向かう → 並走 → 帰る → 荷下ろし → 待機。左側に通り道がないときは「待つ」（行程の出口の枕地）。
 * - 経路は PassGrid の A*。なぞるのは pure pursuit（最小半径 9 m）。並走の区間は格子を使わず、目標点へ連続的に寄せる。
 * - コンバインの舵を先読みし、切れ角が 8° を超えるか、ヘッダの端が近いと横へ 1.5 m 退く。接触は柔らかく（押し出すだけ）。
 * - 通った所の立毛は踏み倒す（強行呼び出しでは作物を無視して進むので、多く踏む）。
 */
import { Vector3 } from 'three';
import { toField, toMachine, type MachinePlace, type Rect } from '../../field/field';
import { mountMatrices, UNLOAD_POSE } from '../../model/kinematics';
import { unloadElbow } from '../../model/parts';
import { spec } from '../../spec/spec';
import { BALANCE, GAME_DT } from '../balance';
import type { GameMap } from '../map';
import { PassGrid } from './grid';

export type CartState = 'idle' | 'toCombine' | 'waiting' | 'alongside' | 'toTruck' | 'dumping';
export type CartEvent = 'cartCalled' | 'cartNoLane' | 'cartArrived' | 'cartFull' | 'cartStuck' | 'cartDumped' | 'cartRecalled';

/** カートの外形（荷台の中心が原点、前が +x） */
export const CART_RECT: Rect = { x0: -3, x1: 9, z0: -1.6, z1: 1.6 };
/** 並走の範囲：スパウトが荷台の中心からこの範囲にあれば排出できる */
export const HOPPER_WINDOW = { along: 2.5, side: 1.2 };
/** コンバインの外形（衝突・経路の障害物用、機体座標） */
export const COMBINE_RECTS: Rect[] = [
  { x0: spec.body.rear, x1: 3.2, z0: -1.97, z1: 1.97 },
  { x0: 3.2, x1: 5.64, z0: -spec.header.width / 2, z1: spec.header.width / 2 },
];

/** 排出姿勢のスパウトの先端（機体座標） */
export const SPOUT: Vector3 = (() => {
  const u = spec.unload;
  const e = unloadElbow();
  return new Vector3(e[0] + u.tubeLength - u.spout.radius, e[1] - u.spout.drop, e[2]).applyMatrix4(mountMatrices(UNLOAD_POSE).auger);
})();

const SPEED = BALANCE.cart.speed / 3.6; // m/s
const ACCEL = 1.5;
const MIN_R = 9;
const LOOKAHEAD = 6;
const REPLAN = 2; // s
const STUCK_REPLAN = 5;
const STUCK_GIVEUP = 15;
const AVOID = 1.5;
/** 並走できるかを見るとき、カートの前をどこまで見るか [m] */
const LANE_AHEAD = 6;
/** 次の点がこれより大きく横・後ろなら、止まってその場で向きを変える（最小半径 9 m で大きく回ると作物に入るため） */
const PIVOT_ANGLE = (60 * Math.PI) / 180;
const PIVOT_RATE = (40 * Math.PI) / 180; // rad/s

export interface CombineView {
  place: MachinePlace;
  v: number; // m/s
  steer: number; // deg
}

export class Cart {
  x: number;
  z: number;
  psi: number;
  v = 0;
  state: CartState = 'idle';
  load = 0;
  force = false;
  /** 呼ばれている（荷下ろしの後にそのまま向かう） */
  called = false;
  path: Array<[number, number]> | null = null;
  private pathIdx = 0;
  private replanT = 0;
  private stuckT = 0;
  private progressRef: [number, number] = [0, 0];
  waitPoint: [number, number] | null = null;
  /** 並走の目標から横へ退いている量 [m] */
  avoid = 0;
  contact = false;
  /** 到着までの見込み [s]（ゲームの時計） */
  eta = 0;
  /** トラックへ戻るまでと、トラックからコンバインまでの見込み（最後の受け渡しの目安用） */
  get etaHome(): number {
    const d = Math.hypot(this.home.x - this.x, this.home.z - this.z);
    return this.state === 'dumping' ? this.load / BALANCE.cart.toTruckRate : this.state === 'toTruck' ? d / SPEED + this.load / BALANCE.cart.toTruckRate : 0;
  }
  /** トラックの横からコンバインの並走の位置まで（直線距離の 1.3 倍を経路の長さとみなす） */
  etaFromHome(c: CombineView): number {
    const t = this.target(c, 0);
    return (Math.hypot(t.x - this.home.x, t.z - this.home.z) * 1.3) / SPEED;
  }
  readonly events: CartEvent[] = [];
  readonly grid: PassGrid;
  readonly home: MachinePlace;
  /** 踏み倒した量（ゲームの kg）とセル数 */
  trampleLoss = 0;
  private laneBadT = 0;
  private noseT = 0;
  private clock = 0;
  private lastNoLane = -Infinity;
  private lastArrived = -Infinity;
  trampledCells = 0;
  waitTime = 0;

  constructor(private map: GameMap) {
    this.grid = new PassGrid(map);
    // トラックの横（+Z 側 5 m）に、トラックと同じ向きで待つ
    const t = map.truck;
    this.home = { x: t.x + Math.sin(t.psi) * 5, z: t.z + Math.cos(t.psi) * 5, psi: t.psi };
    this.x = this.home.x;
    this.z = this.home.z;
    this.psi = this.home.psi;
  }

  get place(): MachinePlace {
    return { x: this.x, z: this.z, psi: this.psi };
  }
  get room(): number {
    return BALANCE.cart.capacity - this.load;
  }

  /** E：呼ぶ／帰す。force：強行呼び出し */
  command(force: boolean) {
    if (this.state === 'idle' || this.state === 'toTruck' || this.state === 'dumping') {
      this.called = true;
      this.force = force;
      if (this.state === 'idle') this.go('toCombine');
      else if (this.state === 'toTruck' && this.load === 0) this.go('toCombine');
      this.events.push('cartCalled');
    } else {
      this.called = false;
      this.force = false;
      this.go('toTruck');
      this.events.push('cartRecalled');
    }
  }

  private go(s: CartState) {
    this.state = s;
    this.path = null;
    this.replanT = 0;
    this.stuckT = 0;
    this.progressRef = [this.x, this.z];
  }

  /** 荷台の中心を置く目標（並走の位置）。avoid のぶん左へ退く */
  target(c: CombineView, avoid = this.avoid): MachinePlace {
    const [X, Z] = toField(c.place, SPOUT.x, SPOUT.z - avoid);
    return { x: X, z: Z, psi: c.place.psi };
  }

  /** スパウト（機体座標の SPOUT）が荷台の上の範囲にあるか */
  accepts(c: CombineView): boolean {
    if (this.state !== 'alongside' || this.contact) return false;
    const [X, Z] = toField(c.place, SPOUT.x, SPOUT.z);
    const [mx, mz] = toMachine(this.place, X, Z);
    return Math.abs(mx) <= HOPPER_WINDOW.along && Math.abs(mz) <= HOPPER_WINDOW.side;
  }

  /**
   * 目標の位置にカートを置いたとき、下と前（LANE_AHEAD m）に濃い立毛・障害物がないか（並走できるか）。
   * 前も見るのは、カート自身が踏み倒した跡を「通れる」と見てしまい、立毛の中を進み続けないようにするため
   */
  laneOk(t: MachinePlace): boolean {
    const g = this.grid;
    for (let a = CART_RECT.x0; a <= CART_RECT.x1 + LANE_AHEAD; a += 1) {
      for (let b = CART_RECT.z0; b <= CART_RECT.z1; b += 0.8) {
        const [X, Z] = toField(t, a, b);
        const [i, k] = g.cellOf(X, Z);
        if (!g.inside(i, k)) return false;
        const raw = g.raw[g.idx(i, k)];
        if (raw === 2 || (raw === 1 && !this.force)) return false;
      }
    }
    return true;
  }

  /** 並走の位置で通り道をふさいでいる格子の中心（ミニマップで赤く出す、G-R-06） */
  laneBlockers(c: CombineView): Array<[number, number]> {
    const t = this.target(c, 0);
    const g = this.grid;
    const out = new Map<number, [number, number]>();
    for (let a = CART_RECT.x0; a <= CART_RECT.x1 + LANE_AHEAD; a += 1) {
      for (let b = CART_RECT.z0; b <= CART_RECT.z1; b += 0.8) {
        const [X, Z] = toField(t, a, b);
        const [i, k] = g.cellOf(X, Z);
        if (!g.inside(i, k)) continue;
        const j = g.idx(i, k);
        if (g.raw[j] === 1 || g.raw[j] === 2) out.set(j, g.center(i, k));
      }
    }
    return [...out.values()];
  }

  /** 今の行程の出口：コンバインの前方で作物の範囲を出た点の 8 m 先の、左側（スパウトの側） */
  private exitPoint(c: CombineView): [number, number] {
    const pl = c.place;
    const fx = Math.cos(pl.psi);
    const fz = -Math.sin(pl.psi);
    let s = 0;
    for (; s < 300; s += 1) if (!this.map.inCrop(pl.x + fx * s, pl.z + fz * s)) break;
    const ex = pl.x + fx * (s + 8);
    const ez = pl.z + fz * (s + 8);
    // 左 ＝ 右（sin, cos）の反対。スパウトの横の距離だけ左へ
    const side = -SPOUT.z;
    return [ex - Math.sin(pl.psi) * side, ez - Math.cos(pl.psi) * side];
  }

  private rebuild(c: CombineView) {
    this.grid.rebuild(this.force, COMBINE_RECTS.map((rect) => ({ place: c.place, rect })));
  }

  private plan(c: CombineView): void {
    this.rebuild(c);
    const g = this.grid;
    let goal: [number, number] | null = null;
    if (this.state === 'toTruck') {
      goal = g.nearestFree(this.home.x, this.home.z);
    } else {
      const t = this.target(c, 0);
      if (this.laneOk(t)) {
        // 並走の位置の 10 m 後ろ（コンバインの進む向きの後ろ）へ向かい、そこから寄せる
        const [sx, sz] = toField(c.place, SPOUT.x - 10, SPOUT.z - AVOID);
        goal = g.nearestFree(sx, sz);
        if (this.state === 'waiting') this.state = 'toCombine';
        this.waitPoint = null;
      } else {
        if (this.state !== 'waiting') this.noLane();
        this.state = 'waiting';
        const [wx, wz] = this.exitPoint(c);
        goal = g.nearestFree(wx, wz);
        this.waitPoint = goal ? g.center(goal[0], goal[1]) : null;
      }
    }
    this.path = goal ? g.findPath([this.x, this.z], goal) : null;
    this.pathIdx = 0;
    this.eta = this.path ? this.pathLength() / SPEED : 0;
  }

  private pathLength(): number {
    if (!this.path) return 0;
    let len = 0;
    let p: [number, number] = [this.x, this.z];
    for (let i = this.pathIdx; i < this.path.length; i++) {
      len += Math.hypot(this.path[i][0] - p[0], this.path[i][1] - p[1]);
      p = this.path[i];
    }
    return len;
  }

  /** 経路をなぞる（pure pursuit）。終点に着いたら true */
  private follow(): boolean {
    const path = this.path;
    if (!path || path.length === 0) {
      this.brake();
      return false;
    }
    // pathIdx ＝ いまなぞっている区間の終点。区間への射影が終点を越えたら次の区間へ
    for (;;) {
      if (this.pathIdx === 0) this.pathIdx = 1;
      if (this.pathIdx >= path.length) break;
      const a = path[this.pathIdx - 1];
      const b = path[this.pathIdx];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = len > 0 ? ((this.x - a[0]) * (b[0] - a[0]) + (this.z - a[1]) * (b[1] - a[1])) / (len * len) : 1;
      if (t < 1 || this.pathIdx >= path.length - 1) break;
      this.pathIdx++;
    }
    const goal = path[path.length - 1];
    const distGoal = Math.hypot(goal[0] - this.x, goal[1] - this.z);
    if (distGoal < 4) {
      this.brake();
      return true;
    }
    const [tx, tz] = this.lookahead(path);
    const [mx, mz] = toMachine(this.place, tx, tz);
    // 鼻先（トラクタの前）が濃い立毛・障害物に入るなら、止まってその場で経路の向きへ回る
    // （経路は荷台の中心で作るので、長い車体の前が出ることがある）。3 秒たっても出られなければ、少し踏んで進む
    if (this.noseBlocked() && this.noseT < 3) {
      this.noseT += GAME_DT;
      this.accel(0);
      const b = Math.atan2(mz, mx);
      if (this.v < 0.5 && Math.abs(b) > 0.05) this.psi -= Math.sign(b) * Math.min(Math.abs(b), PIVOT_RATE * GAME_DT);
      this.move();
      return distGoal < 15;
    }
    if (!this.noseBlocked()) this.noseT = 0;
    const bearing = Math.atan2(mz, mx); // > 0 で右
    if (Math.abs(bearing) > PIVOT_ANGLE) {
      // 次の点が大きく後ろ：止まってその場で向きを変える（大きく回ると作物に入るため。ゲームの割り切り）
      this.accel(0);
      if (this.v < 0.5) {
        const r = PIVOT_RATE * GAME_DT;
        this.psi -= Math.sign(bearing) * Math.min(Math.abs(bearing), r);
      }
      this.move();
      return false;
    }
    const ld = Math.max(1, Math.hypot(mx, mz));
    let kappa = (2 * mz) / (ld * ld); // > 0 で右（+z）へ
    kappa = Math.max(-1 / MIN_R, Math.min(1 / MIN_R, kappa));
    // 曲がりがきついほど遅く
    const vt = Math.min(SPEED * this.slow(), Math.sqrt(2 * ACCEL * distGoal), Math.abs(bearing) > 0.6 ? 2.5 : SPEED);
    this.accel(vt);
    this.psi -= kappa * this.v * GAME_DT;
    this.move();
    this.eta = this.pathLength() / SPEED;
    return false;
  }

  /** トラクタの前の 3 点（左・中・右）の少し先が、濃い立毛（強行呼び出しでなければ）か障害物・柵か */
  private noseBlocked(): boolean {
    if (this.v < -0.1) return false;
    const g = this.grid;
    for (const b of [CART_RECT.z0, 0, CART_RECT.z1]) {
      const [X, Z] = toField(this.place, CART_RECT.x1 + 0.8, b);
      const [i, k] = g.cellOf(X, Z);
      if (!g.inside(i, k)) return true;
      const raw = g.raw[g.idx(i, k)];
      if (raw === 2 || (raw === 1 && !this.force)) return true;
    }
    return false;
  }

  /** 経路の上で、今の位置の射影から LOOKAHEAD 先の点（pure pursuit の目標） */
  private lookahead(path: Array<[number, number]>): [number, number] {
    const i = Math.min(this.pathIdx, path.length - 1);
    const a = path[Math.max(0, i - 1)];
    const b = path[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = len > 0 ? ((this.x - a[0]) * (b[0] - a[0]) + (this.z - a[1]) * (b[1] - a[1])) / (len * len) : 1;
    t = Math.max(0, Math.min(1, t));
    let px = a[0] + (b[0] - a[0]) * t;
    let pz = a[1] + (b[1] - a[1]) * t;
    let rest = LOOKAHEAD;
    for (let j = i; j < path.length; j++) {
      const q = path[j];
      const d = Math.hypot(q[0] - px, q[1] - pz);
      if (d >= rest) return [px + ((q[0] - px) * rest) / d, pz + ((q[1] - pz) * rest) / d];
      rest -= d;
      px = q[0];
      pz = q[1];
    }
    return [px, pz];
  }

  /** 水たまりの中は半分の速さ（§6） */
  private slow(): number {
    return this.map.inWater(this.x, this.z) ? 0.5 : 1;
  }

  private accel(vt: number) {
    const a = ACCEL * GAME_DT;
    this.v += Math.max(-a * 2, Math.min(a, vt - this.v));
  }
  private brake() {
    this.accel(0);
    this.move();
  }
  private move() {
    this.x += Math.cos(this.psi) * this.v * GAME_DT;
    this.z -= Math.sin(this.psi) * this.v * GAME_DT;
  }

  /** 並走：目標点（荷台の中心をスパウトの下）へ連続的に寄せる */
  private alongside(c: CombineView) {
    const pl = c.place;
    // 舵の先読み・ヘッダの端との距離で退く
    const [hx, hz] = toMachine(this.place, ...toField(pl, 5.64, -spec.header.width / 2));
    const headerNear = hx > CART_RECT.x0 - 2.5 && hx < CART_RECT.x1 + 2.5 && Math.abs(hz) < 1.6 + 2.5;
    const wantAvoid = Math.abs(c.steer) > 8 || (headerNear && Math.abs(hz) < 1.6 + 1.2) ? AVOID : 0;
    this.avoid += Math.max(-1 * GAME_DT, Math.min(1.5 * GAME_DT, wantAvoid - this.avoid));
    const t = this.target(c);
    const cvx = Math.cos(pl.psi) * c.v;
    const cvz = -Math.sin(pl.psi) * c.v;
    const ex = t.x - this.x;
    const ez = t.z - this.z;
    let rvx = 0.9 * ex;
    let rvz = 0.9 * ez;
    const rl = Math.hypot(rvx, rvz);
    if (rl > 3) {
      rvx *= 3 / rl;
      rvz *= 3 / rl;
    }
    let vx = cvx + rvx;
    let vz = cvz + rvz;
    const sp = Math.hypot(vx, vz);
    const cap = (SPEED + 1) * this.slow();
    if (sp > cap) {
      vx *= cap / sp;
      vz *= cap / sp;
    }
    this.x += vx * GAME_DT;
    this.z += vz * GAME_DT;
    this.v = Math.hypot(vx, vz);
    // 向きはコンバインに合わせる（30°/s まで）
    const dpsi = wrap(pl.psi - this.psi);
    const r = (30 * Math.PI) / 180 * GAME_DT;
    this.psi += Math.max(-r, Math.min(r, dpsi));
  }

  /** 接触：カートの外形がコンバインの外形に重なっていたら、コンバインの左へ押し出す */
  private resolveContact(c: CombineView) {
    this.contact = false;
    for (let it = 0; it < 15 && this.overlapsCombine(c); it++) {
      this.contact = true;
      this.x -= Math.sin(c.place.psi) * 0.2;
      this.z -= Math.cos(c.place.psi) * 0.2;
    }
  }

  overlapsCombine(c: CombineView): boolean {
    // カートの外形の点（周上）がコンバインの長方形に入るか、その逆
    const pts: Array<[number, number]> = [];
    for (let a = CART_RECT.x0; a <= CART_RECT.x1 + 1e-9; a += 1.5) for (const b of [CART_RECT.z0, CART_RECT.z1]) pts.push(toField(this.place, a, b));
    for (const [X, Z] of pts) {
      const [mx, mz] = toMachine(c.place, X, Z);
      for (const r of COMBINE_RECTS) if (mx >= r.x0 && mx <= r.x1 && mz >= r.z0 && mz <= r.z1) return true;
    }
    for (const r of COMBINE_RECTS) {
      for (const [a, b] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x1, (r.z0 + r.z1) / 2]]) {
        const [X, Z] = toField(c.place, a, b);
        const [mx, mz] = toMachine(this.place, X, Z);
        if (mx >= CART_RECT.x0 && mx <= CART_RECT.x1 && mz >= CART_RECT.z0 && mz <= CART_RECT.z1) return true;
      }
    }
    return false;
  }

  /** 「通り道がない」の知らせは 10 秒に 1 回まで */
  private noLane() {
    if (this.clock - this.lastNoLane < 10) return;
    this.lastNoLane = this.clock;
    this.events.push('cartNoLane');
  }

  /** 1 刻み。返り値：トラックへ下ろした量（ゲームの kg） */
  step(c: CombineView): number {
    this.clock += GAME_DT;
    let dumped = 0;
    const was = [this.x, this.z];
    switch (this.state) {
      case 'idle':
        this.v = 0;
        break;
      case 'toCombine':
      case 'waiting': {
        this.replanT -= GAME_DT;
        if (this.replanT <= 0 || !this.path) {
          this.replanT = REPLAN;
          this.plan(c);
        }
        if (this.state === 'waiting') this.waitTime += GAME_DT;
        const arrived = this.follow();
        if (this.state === 'toCombine') {
          const t = this.target(c, 0);
          const near = Math.hypot(t.x - this.x, t.z - this.z) < 14;
          if ((near || arrived) && this.laneOk(t)) {
            this.state = 'alongside';
            this.avoid = AVOID;
            this.path = null;
            if (this.clock - this.lastArrived > 10) this.events.push('cartArrived');
            this.lastArrived = this.clock;
          }
        }
        break;
      }
      case 'alongside': {
        const t = this.target(c, 0);
        if (Math.hypot(t.x - this.x, t.z - this.z) > 30) {
          this.go('toCombine');
          break;
        }
        // 通り道がない状態が 2 秒続いたら待つ（角のループの途中などで、ちらつかないように）
        if (!this.laneOk(t) && !this.force) this.laneBadT += GAME_DT;
        else this.laneBadT = 0;
        if (this.laneBadT > 2) {
          this.laneBadT = 0;
          this.go('waiting');
          this.noLane();
          break;
        }
        this.alongside(c);
        if (this.room <= 1) {
          this.events.push('cartFull');
          this.go('toTruck');
        }
        break;
      }
      case 'toTruck': {
        if (!this.path) this.plan(c);
        if (this.follow()) {
          this.state = 'dumping';
          this.v = 0;
        }
        break;
      }
      case 'dumping': {
        const m = Math.min(this.load, BALANCE.cart.toTruckRate * GAME_DT);
        this.load -= m;
        dumped = m;
        if (this.load <= 1e-6) {
          this.load = 0;
          this.events.push('cartDumped');
          if (this.called) this.go('toCombine');
          else this.state = 'idle';
        }
        break;
      }
    }
    if (this.state !== 'idle' && this.state !== 'dumping') this.resolveContact(c);
    else this.contact = false;

    // 進めなくなったら作り直す、それでも駄目ならトラックへ戻る
    if (this.state === 'toCombine' || this.state === 'toTruck' || (this.state === 'waiting' && this.path)) {
      const moved = Math.hypot(this.x - this.progressRef[0], this.z - this.progressRef[1]);
      const atGoal = this.state === 'waiting' && this.path && this.pathIdx >= this.path.length - 1;
      if (moved > 2 || atGoal) {
        this.stuckT = 0;
        this.progressRef = [this.x, this.z];
      } else {
        this.stuckT += GAME_DT;
        if (this.stuckT > STUCK_GIVEUP && this.state !== 'toTruck') {
          this.events.push('cartStuck');
          this.called = false;
          this.go('toTruck');
        } else if (this.stuckT > STUCK_REPLAN && this.stuckT - GAME_DT <= STUCK_REPLAN) {
          this.replanT = 0;
          this.path = null;
        }
      }
    }

    // 通った所の立毛を踏む
    if (Math.hypot(this.x - was[0], this.z - was[1]) > 1e-6) {
      const f = this.map.field;
      f.flattenUnder(this.place, CART_RECT, 0, -this.psi, (idx) => {
        this.trampledCells++;
        this.trampleLoss += f.grain[idx] * BALANCE.grainMult;
      });
    }
    return dumped;
  }
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
