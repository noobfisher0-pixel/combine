/**
 * 1 ラウンドのシミュレーション（docs/game-design.md §2・§8.1）。
 * 固定の刻み（実時間 1/60 s、ゲームの時計 GAME_DT）で進める。入力は刻みごとのビットで、記録して再生できる。
 * 同じマップ（シード・版）と同じ入力なら、同じ結果になる（tests/game.test.ts）。
 * G0：運転・刈り取り・押し倒し・取りこぼし・タンク・衝突・制限時間。
 * G1：排出オーガ、グレインカート（AI）、トラック、得点、時間切れの規則（§4.7）、ランク（§7.2）。
 */
import { toMachine, type MachinePlace } from '../../field/field';
import { WORK_POSE } from '../../model/kinematics';
import type { Pose } from '../../model/types';
import { spec } from '../../spec/spec';
import { BALANCE, GAME_DT, type Difficulty } from '../balance';
import { fnv1a } from '../rand';
import type { GameMap } from '../map';
import { Cart, type CartEvent, type CombineView } from './cart';
import { initialCombine, KEY, stepCombine, type CombineState } from './combine';
import { HarvestModel } from './harvest';

export interface GameOptions {
  difficulty: Difficulty;
  /** タンク＋搬送中が満杯になったら自動で止まる（かんたん・ふつう） */
  autoStop: boolean;
  /** タンク 70 % で自動でカートを呼ぶ（かんたん） */
  autoCall: boolean;
  /** 制限時間（ゲームの時計 s）。省略時は難易度から。Infinity で時間切れなし（チュートリアル） */
  roundTime?: number;
}

export type GameEvent = { t: number; kind: 'tank70' | 'tank90' | 'full' | 'autoStop' | 'collision' | 'timeUp' | 'spill' | 'noCart' | CartEvent };

export type Rank = 'S' | 'A' | 'B' | 'C';
/** ランクのしきい値（理論上の上限に対する割合、§7.2。G2 でボットから決め直す） */
export const RANKS: Array<[Rank, number]> = [['S', 0.85], ['A', 0.7], ['B', 0.55], ['C', 0]];
/** 理論上の上限で差し引く旋回の時間（角のループ 4 回、§5） */
const TURN_ALLOWANCE = 4 * 22;

/** 機体の外形（衝突用、機体座標の長方形）：本体と、ヘッダ */
const BODY = { x0: spec.body.rear, x1: 3.2, z0: -1.97, z1: 1.97 };
const HEADER = { x0: 3.2, x1: 5.64, z0: -spec.header.width / 2, z1: spec.header.width / 2 };

export class GameSim {
  readonly map: GameMap;
  readonly opts: GameOptions;
  readonly roundTime: number;
  readonly combine: CombineState;
  readonly harvest: HarvestModel;
  readonly cart: Cart;
  pose: Pose;
  /** トラックに入った量（ゲームの kg）＝ 得点 */
  truck = 0;
  /** 地面にこぼした量（むずかしい） */
  spill = 0;
  /** 時間切れの処理：最後に移した量、数えたカートの中身、残ったタンク */
  finalTransfer = 0;
  finalCart = 0;
  leftInTank = 0;
  /** 排出の流れ（このとき流れているか） */
  unloading = false;
  readonly upperBound: number;
  /** ゲームの時計 [s]、刻みの数 */
  t = 0;
  steps = 0;
  over = false;
  collisions = 0;
  readonly events: GameEvent[] = [];
  /** 入力の記録（刻みごと） */
  readonly inputs: number[] = [];
  private warned = new Set<string>();
  private autoStopped = false;
  private autoCalled = false;
  private cartEvSeen = 0;

  constructor(map: GameMap, opts: Partial<GameOptions> = {}) {
    this.map = map;
    const d = opts.difficulty ?? 'normal';
    this.opts = { difficulty: d, autoStop: d !== 'hard', autoCall: d === 'easy', ...opts };
    this.roundTime = this.opts.roundTime ?? BALANCE.round[this.opts.difficulty];
    this.combine = initialCombine(map.start.x, map.start.z, map.start.psi);
    this.harvest = new HarvestModel(map.field, map.cropHeight);
    this.cart = new Cart(map);
    this.pose = this.makePose();
    // 理論上の上限：旋回の時間を除いて、負荷率 100 % で刈り続けた穀粒が全部トラックへ（§7.2）
    const grainRate = (this.harvest.rotorCapacity / 3.6) / (1 + this.harvest.mogAtCut) * BALANCE.grainMult; // kg/s
    this.upperBound = Number.isFinite(this.roundTime) ? grainRate * Math.max(0, this.roundTime - TURN_ALLOWANCE) : Infinity;
  }

  get combineView(): CombineView {
    return { place: this.place, v: this.combine.v, steer: this.combine.steer };
  }

  /** 得点の割合（上限に対して）とランク */
  get ratio(): number {
    return Number.isFinite(this.upperBound) && this.upperBound > 0 ? this.truck / this.upperBound : 0;
  }
  get rank(): Rank {
    return RANKS.find(([, r]) => this.ratio >= r)![0];
  }

  /** 最後の受け渡しまでの目安 [s]：残り時間 − カートが並走できるまでの見込み */
  get lastHandoff(): number {
    const c = this.cart;
    const eta = c.state === 'alongside' ? 0 : c.state === 'idle' || c.state === 'dumping' || c.state === 'toTruck' ? c.etaHome + c.etaFromHome(this.combineView) : c.eta;
    return this.remaining - eta;
  }

  get place(): MachinePlace {
    return { x: this.combine.x, z: this.combine.z, psi: this.combine.psi };
  }
  get speedKmh(): number {
    return this.combine.v * 3.6;
  }
  get headerDown(): boolean {
    return this.combine.headerPos < 0.05;
  }
  get remaining(): number {
    return Math.max(0, this.roundTime - this.t);
  }

  private makePose(): Pose {
    const c = this.combine;
    return {
      ...WORK_POSE,
      headerAngle: this.harvest.headerAngle(c.headerPos),
      reelLift: this.harvest.reelLift,
      augerDeploy: spec.unload.deployRange[1] * c.augerPos,
      steer: c.steer,
    };
  }

  private emit(kind: GameEvent['kind']) {
    this.events.push({ t: this.t, kind });
  }

  /** 機体の外形が柵・障害物にかかるか */
  private hits(pl: MachinePlace): boolean {
    const w = this.map.world;
    for (const r of [BODY, HEADER]) {
      for (const [mx, mz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) {
        const c = Math.cos(pl.psi);
        const s = Math.sin(pl.psi);
        const X = pl.x + c * mx + s * mz;
        const Z = pl.z - s * mx + c * mz;
        if (X < w.x0 || X > w.x1 || Z < w.z0 || Z > w.z1) return true;
      }
    }
    for (const o of this.map.obstacles) {
      const [mx, mz] = toMachine(pl, o.x, o.z);
      for (const r of [BODY, HEADER]) {
        if (mx > r.x0 - o.r && mx < r.x1 + o.r && mz > r.z0 - o.r && mz < r.z1 + o.r) return true;
      }
    }
    return false;
  }

  step(keys: number) {
    if (this.over) return;
    this.inputs.push(keys);
    this.steps++;
    this.t = this.steps * GAME_DT;
    const c = this.combine;
    const h = this.harvest;

    const pressed = keys & ~c.prevKeys;
    if (pressed & (KEY.cart | KEY.cartForce)) this.cart.command((keys & KEY.cartForce) !== 0);
    const hold = c.loadHold ? h.speedForLoad(this.place, BALANCE.combine.loadHoldTarget) : null;
    const before = { x: c.x, z: c.z, psi: c.psi };
    stepCombine(c, keys, hold, this.map.inWater(c.x, c.z) ? 0.5 : 1);
    if (this.hits(this.place)) {
      c.x = before.x;
      c.z = before.z;
      c.psi = before.psi;
      c.v = 0;
      c.vTarget = 0;
      c.stun = BALANCE.combine.stunTime;
      this.collisions++;
      this.emit('collision');
    }
    this.pose = this.makePose();
    h.step(this.place, this.pose, c.v, Math.abs(c.v) * 3.6);

    // カート
    this.truck += this.cart.step(this.combineView);

    // 排出：オーガを振り出し、切れ角 ±12° 以内、スパウトが荷台の上 → カートへ。いなければ止まる（むずかしいはこぼれる）
    this.unloading = false;
    if (c.augerPos >= 1 && h.tank > 0) {
      const m = Math.min(h.tank, BALANCE.tank.unloadRate * GAME_DT);
      if (Math.abs(c.steer) <= 12 && this.cart.accepts(this.combineView)) {
        const into = Math.min(m, this.cart.room);
        h.tank -= into;
        this.cart.load += into;
        this.unloading = into > 0;
      } else if (this.opts.difficulty === 'hard') {
        h.tank -= m;
        this.spill += m;
        this.unloading = true;
        if (!this.warned.has('spill')) {
          this.warned.add('spill');
          this.emit('spill');
        }
      } else if (!this.warned.has('noCart')) {
        this.warned.add('noCart');
        this.emit('noCart');
      }
    } else {
      this.warned.delete('spill');
      this.warned.delete('noCart');
    }

    // タンクの警告と、満杯で自動停止（タンク＋搬送中で判定）
    const cap = BALANCE.tank.capacity;
    const fill = (h.tank + h.inTransit) / cap;
    for (const [lv, kind] of [[BALANCE.tank.warn[0], 'tank70'], [BALANCE.tank.warn[1], 'tank90']] as const) {
      if (fill >= lv && !this.warned.has(kind)) {
        this.warned.add(kind);
        this.emit(kind);
      }
      if (fill < lv - 0.05) this.warned.delete(kind);
    }
    if (h.tank >= cap - 1e-6 && !this.warned.has('full')) {
      this.warned.add('full');
      this.emit('full');
    } else if (h.tank < cap * 0.95) this.warned.delete('full');
    if (this.opts.autoCall && fill >= BALANCE.tank.warn[0] && !this.autoCalled && this.cart.state === 'idle') {
      this.autoCalled = true;
      this.cart.command(false);
    }
    if (fill < 0.5) this.autoCalled = false;
    if (this.opts.autoStop && fill >= 1 && !this.autoStopped && !c.headerUp) {
      // 止めるだけにする（ヘッダを上げながら惰性で進むと、刈刃が穂の上を通って押し倒してしまう）
      this.autoStopped = true;
      c.vTarget = 0;
      c.loadHold = false;
      this.emit('autoStop');
    }
    if (fill < 0.95) this.autoStopped = false;

    // カートの出来事（キーで呼んだ・帰したものを含む）を、この刻みの出来事に加える
    for (; this.cartEvSeen < this.cart.events.length; this.cartEvSeen++) this.emit(this.cart.events[this.cartEvSeen]);

    if (this.t >= this.roundTime - 1e-9) this.timeUp();
  }

  /**
   * 時間切れ（§4.7）：止める。並走の範囲にカートがいれば、タンクの中身を荷台に入るぶんだけ移す。
   * カートの中身は早送りでトラックへ運んだことにして全部数える。タンクに残った分は数えない。
   */
  private timeUp() {
    const c = this.combine;
    this.over = true;
    c.v = 0;
    c.vTarget = 0;
    const cart = this.cart;
    if (cart.state === 'alongside' && !cart.contact && cart.accepts(this.combineView)) {
      const m = Math.min(this.harvest.tank, cart.room);
      this.harvest.tank -= m;
      cart.load += m;
      this.finalTransfer = m;
    }
    this.finalCart = cart.load;
    this.truck += cart.load;
    cart.load = 0;
    this.leftInTank = this.harvest.tank + this.harvest.inTransit;
    this.emit('timeUp');
  }

  /** 状態の要約のハッシュ（決定性のテスト用） */
  hash(): number {
    const c = this.combine;
    const s = this.harvest.stats;
    const k = this.cart;
    const nums = [c.x, c.z, c.psi, c.v, c.steer, this.harvest.tank, s.harvested, s.overflow, s.rotorLoss, s.flattenLoss, s.cutCells, this.collisions, k.x, k.z, k.psi, k.load, this.truck, this.spill];
    let text = nums.map((n) => n.toPrecision(12)).join(',');
    const st = this.map.field.state;
    let acc = 0;
    for (let i = 0; i < st.length; i++) acc = (Math.imul(acc, 31) + st[i]) | 0;
    text += `|${acc}`;
    return fnv1a(text);
  }
}
