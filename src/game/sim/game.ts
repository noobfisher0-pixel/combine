/**
 * 1 ラウンドのシミュレーション（docs/game-design.md §2・§8.1）。
 * 固定の刻み（実時間 1/60 s、ゲームの時計 GAME_DT）で進める。入力は刻みごとのビットで、記録して再生できる。
 * 同じマップ（シード・版）と同じ入力なら、同じ結果になる（tests/game.test.ts）。
 * G0：運転・刈り取り・押し倒し・取りこぼし・タンク・衝突・制限時間。排出とカートは G1。
 */
import { toMachine, type MachinePlace } from '../../field/field';
import { WORK_POSE } from '../../model/kinematics';
import type { Pose } from '../../model/types';
import { spec } from '../../spec/spec';
import { BALANCE, GAME_DT, type Difficulty } from '../balance';
import { fnv1a } from '../rand';
import type { GameMap } from '../map';
import { initialCombine, stepCombine, type CombineState } from './combine';
import { HarvestModel } from './harvest';

export interface GameOptions {
  difficulty: Difficulty;
  /** タンク＋搬送中が満杯になったら自動で止まる（かんたん・ふつう） */
  autoStop: boolean;
  /** 制限時間（ゲームの時計 s）。省略時は難易度から */
  roundTime?: number;
}

export type GameEvent = { t: number; kind: 'tank70' | 'tank90' | 'full' | 'autoStop' | 'collision' | 'timeUp' };

/** 機体の外形（衝突用、機体座標の長方形）：本体と、ヘッダ */
const BODY = { x0: spec.body.rear, x1: 3.2, z0: -1.97, z1: 1.97 };
const HEADER = { x0: 3.2, x1: 5.64, z0: -spec.header.width / 2, z1: spec.header.width / 2 };

export class GameSim {
  readonly map: GameMap;
  readonly opts: GameOptions;
  readonly roundTime: number;
  readonly combine: CombineState;
  readonly harvest: HarvestModel;
  pose: Pose;
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

  constructor(map: GameMap, opts: Partial<GameOptions> = {}) {
    this.map = map;
    this.opts = { difficulty: 'normal', autoStop: true, ...opts };
    this.roundTime = this.opts.roundTime ?? BALANCE.round[this.opts.difficulty];
    this.combine = initialCombine(map.start.x, map.start.z, map.start.psi);
    this.harvest = new HarvestModel(map.field, map.cropHeight);
    this.pose = this.makePose();
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

    const hold = c.loadHold ? h.speedForLoad(this.place, BALANCE.combine.loadHoldTarget) : null;
    const before = { x: c.x, z: c.z, psi: c.psi };
    stepCombine(c, keys, hold);
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
    if (this.opts.autoStop && fill >= 1 && !this.autoStopped && !c.headerUp) {
      // 止めるだけにする（ヘッダを上げながら惰性で進むと、刈刃が穂の上を通って押し倒してしまう）
      this.autoStopped = true;
      c.vTarget = 0;
      c.loadHold = false;
      this.emit('autoStop');
    }
    if (fill < 0.95) this.autoStopped = false;

    if (this.t >= this.roundTime - 1e-9) {
      this.over = true;
      c.v = 0;
      c.vTarget = 0;
      this.emit('timeUp');
    }
  }

  /** 状態の要約のハッシュ（決定性のテスト用） */
  hash(): number {
    const c = this.combine;
    const s = this.harvest.stats;
    const nums = [c.x, c.z, c.psi, c.v, c.steer, this.harvest.tank, s.harvested, s.overflow, s.rotorLoss, s.flattenLoss, s.cutCells, this.collisions];
    let text = nums.map((n) => n.toPrecision(12)).join(',');
    const st = this.map.field.state;
    let acc = 0;
    for (let i = 0; i < st.length; i++) acc = (Math.imul(acc, 31) + st[i]) | 0;
    text += `|${acc}`;
    return fnv1a(text);
  }
}
