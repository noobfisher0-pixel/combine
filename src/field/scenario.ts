/**
 * 収穫シナリオ（design §16.6・§21、M6）。100 m × 50 m の小麦の圃場を、往復して刈る。
 *
 * - 時間はすべて工程の時間。固定の刻み DT で進めるので、画面とテストで同じ結果になる（乱数のシードも固定）。
 * - 機体は経路（Path）に沿って走り、オペレータの操作（ヘッダの上げ下げ・リール位置・排出）は規則で決める。
 * - 刈った量は 2 段の遅れ（ヘッダ・フィーダ → 脱穀・選別 → タンク）でタンクに入る。
 *   段ごとの負荷率は、ロータに入る量と §16.7 の能力から計算する。
 * - W-7：刈刃が通った幅に刈り残しがないこと、機体（車輪・本体・ヘッダ）が立っている作物を押し倒さないこと。
 * - W-8：タンクが満杯で止まらないこと（運搬車が刈り跡の側を走れる行程で、走りながら排出する）。
 */
import { Vector3 } from 'three';
import { place } from '../collision/check';
import { cutHeight, harvestReport, headerAngleForCut, mogFromCut, suggestedReelLift, tankCapacity, type Check, type HarvestReport } from '../model/harvest';
import { HEADER_MOUNTS, mountMatrices, UNLOAD_POSE, WORK_POSE } from '../model/kinematics';
import { headerLowestY } from '../model/limits';
import { ACTUATOR_RATES, approachPose } from '../model/machine';
import { buildParts, unloadElbow } from '../model/parts';
import type { Pose } from '../model/types';
import { spec } from '../spec/spec';
import { defaultFieldOptions, FLAT, toField, WheatField, type MachinePlace, type Rect } from './field';
import { Path, steerFor, uTurn, type Segment } from './path';

export interface ScenarioParams {
  speed: number; // km/h（作物の中）
  yield: number; // t/ha
  cropHeight: number; // m
  cutHeight: number; // m
  overlap: number; // m（負なら行程の間にすき間）
  roundTrips: number; // 往復数（1 往復 = 2 行程）
  startTank: number; // 0〜1
  unloadAt: number; // 0〜1
  reelIndex: number;
  seed: number;
}

export function defaultScenarioParams(): ScenarioParams {
  const f = spec.field;
  return {
    speed: 5,
    yield: spec.crop.wheat.yield,
    cropHeight: spec.crop.wheat.height,
    cutHeight: f.cutHeight,
    overlap: f.overlap,
    roundTrips: 1,
    startTank: f.startTank,
    unloadAt: f.unloadAt,
    reelIndex: 1.2,
    seed: 7,
  };
}

/** 工程の時間の刻み [s] */
export const DT = 0.05;
/** ヘッダ・フィーダの遅れ、脱穀・選別からタンクまでの遅れ（一次遅れの時定数、s） */
const TAU_HEADER = 2;
const TAU_SEPARATOR = 4;

export interface UnloadEvent {
  start: number;
  end: number;
  kg: number;
  moving: boolean;
  reason: string;
}

export interface StagePeak {
  id: string;
  name: string;
  peak: number;
  avg: number;
}

export interface ScenarioReport {
  done: boolean;
  aborted: string | null;
  time: number;
  distance: number;
  passes: number;
  areaHa: number;
  harvestedKg: number;
  deliveredKg: number;
  unloadedKg: number;
  tankStartKg: number;
  tankEndKg: number;
  capacityKg: number;
  overflowKg: number;
  overlapM2: number;
  fieldRate: number; // ha/h（旋回を含む）
  unloads: UnloadEvent[];
  unloadWait: number; // 排出したいのに運搬車が入れなかった時間 [s]
  stoppedFull: number; // 満杯で止まっていた時間 [s]
  peaks: StagePeak[];
  w7: {
    zRange: [number, number];
    uncut: number;
    strips: Array<[number, number]>;
    flattened: number;
    flattenedByBody: number;
    flattenedByHeader: number;
    headerInside: boolean;
    dividerAhead: boolean;
    ok: boolean;
  };
  base: HarvestReport;
  checks: Check[];
  tankSeries: Array<[number, number]>;
  log: Array<[number, string]>;
}

const kmh = (v: number) => v / 3.6;

export class HarvestScenario {
  readonly params: ScenarioParams;
  readonly field: WheatField;
  readonly path: Path;
  /** 行程の中心線（圃場の Z） */
  readonly passCenters: number[];
  readonly capacityKg = tankCapacity() * spec.crop.wheat.testWeight;

  // 走行
  s = 0;
  t = 0;
  v = 0; // m/s
  place: MachinePlace & { kappa: number; pass: number };
  pose: Pose;
  private target: Pose;
  readonly cutAngle: number;
  readonly reelLift: number;
  /** 刈刃の線（機体座標の x）。姿勢で変わる */
  knifeX = 0;
  knifeY = 0;
  headerDown = false;

  // 質量
  tankMass: number;
  private hb = { total: 0, grain: 0 };
  private sb = 0;
  harvested = 0;
  delivered = 0;
  unloaded = 0;
  overflow = 0;
  /** 画面の作物フロー用：刈った量（なめらかにした値、kg/s、穀粒＋MOG） */
  feedKgS = 0;
  rotorKgS = 0;
  grainKgS = 0;

  // 排出
  unloadReq = false;
  laneClear = true;
  unloadFlowing = false;
  private cur: UnloadEvent | null = null;
  readonly unloads: UnloadEvent[] = [];
  unloadWait = 0;
  stoppedFull = 0;
  private stuck = 0;

  // 記録
  cutCells = 0;
  overlapCells = 0;
  flattenedByBody = 0;
  flattenedByHeader = 0;
  readonly tankSeries: Array<[number, number]> = [];
  readonly log: Array<[number, string]> = [];
  private peak: Record<string, number> = {};
  private loadSum: Record<string, number> = {};
  private cuttingTime = 0;
  done = false;
  aborted: string | null = null;

  private acc = 0;
  private prevKnife: [[number, number], [number, number]] | null = null;
  private lastPass = -1;
  private readonly base: HarvestReport;
  private readonly bodyRects: Array<Rect & { bottom: number }>;
  private readonly lane: Rect;
  private readonly headerBack: number;
  private readonly lowestCache = new Map<number, number>();
  private readonly hw = spec.header.width / 2;
  readonly headerInside: boolean;
  readonly dividerAhead: boolean;
  readonly spoutTip: Vector3;

  constructor(params: Partial<ScenarioParams> = {}) {
    this.params = { ...defaultScenarioParams(), ...params };
    const p = this.params;
    const f = spec.field;
    this.field = new WheatField({ ...defaultFieldOptions(), cropHeight: p.cropHeight, yield: p.yield, seed: p.seed });

    // 刈高さ・リール：作業姿勢から
    this.cutAngle = headerAngleForCut(p.cutHeight, WORK_POSE) ?? 0;
    const cutPose: Pose = { ...WORK_POSE, headerAngle: this.cutAngle };
    const cond = { yield: p.yield, cropHeight: p.cropHeight, speed: p.speed, reelIndex: p.reelIndex };
    this.reelLift = suggestedReelLift(cutPose, cond);
    const workPose: Pose = { ...cutPose, reelLift: this.reelLift };
    this.base = harvestReport(workPose, cond);

    // 部品の足跡：ヘッダ以外で、下端が作物の高さより低いもの
    const parts = buildParts();
    const placed = place(parts, workPose);
    this.bodyRects = placed
      .filter((q) => !HEADER_MOUNTS.has(q.part.mount) && q.box.min[1] < p.cropHeight + 0.3)
      .map((q) => ({ x0: q.box.min[0], x1: q.box.max[0], z0: q.box.min[2], z1: q.box.max[2], bottom: q.box.min[1] }));
    const header = placed.filter((q) => HEADER_MOUNTS.has(q.part.mount));
    this.headerBack = Math.min(...header.map((q) => q.box.min[0]));
    this.headerInside = header.every((q) => Math.max(Math.abs(q.box.min[2]), Math.abs(q.box.max[2])) <= this.hw + 1e-6);
    const divider = header.filter((q) => q.part.id.startsWith('header.divider'));
    this.dividerAhead = divider.length > 0 && divider.every((q) => q.box.max[0] > spec.header.cutterbar.x[1]);

    // 運搬車の通り道：排出姿勢のスパウトの下、機体と並んで走る長さ
    const u = spec.unload;
    const elbow = unloadElbow();
    this.spoutTip = new Vector3(elbow[0] + u.tubeLength - u.spout.radius, elbow[1] - u.spout.drop, elbow[2]).applyMatrix4(mountMatrices(UNLOAD_POSE).auger);
    const c = f.cart;
    this.lane = { x0: this.spoutTip.x - c.length / 2, x1: this.spoutTip.x + c.length / 2 + 3, z0: this.spoutTip.z - c.halfWidth, z1: this.spoutTip.z + c.halfWidth };

    // 経路：1 行程目は左端（Z = 0）を 0.1 m はみ出して刈り、以後は 刈幅 − 重なり ずつ右へ
    const W = spec.header.width;
    const step = W - p.overlap;
    const n = Math.max(1, Math.round(p.roundTrips * 2));
    this.passCenters = Array.from({ length: n }, (_, i) => this.hw - 0.1 + i * step);
    const knife0 = spec.header.cutterbar.x[1] - 0.1;
    const lowerTime = Math.abs(f.raisedHeaderAngle - this.cutAngle) / ACTUATOR_RATES.headerAngle;
    const lead = f.headerLead + kmh(p.speed) * lowerTime;
    const rear = -spec.body.rear; // 前車軸から機体の後端まで
    const outX = Math.max(rear + f.runOut, knife0 + lead); // 旋回を始める・終える位置（作物の端から）
    const R = f.turnRadius;
    const segs: Segment[] = [];
    const L = f.length;
    const startX = -(knife0 + lead + 6);
    for (let i = 0; i < n; i++) {
      const fwd = i % 2 === 0; // +X へ
      const from = i === 0 ? startX : fwd ? -outX : L + outX;
      const to = i === n - 1 ? (fwd ? L + rear + f.runOut + 2 : -(rear + f.runOut + 2)) : fwd ? L + outX : -outX;
      segs.push({ length: Math.abs(to - from), kappa: 0, pass: i + 1 });
      if (i < n - 1) {
        // 次の行程は +Z 側。+X へ走っているときは右、−X へ走っているときは左
        segs.push(...uTurn(step, R, fwd ? 1 : -1));
      }
    }
    this.path = new Path({ x: startX, z: this.passCenters[0], psi: 0 }, segs);
    this.place = this.path.at(0);
    this.pose = { ...WORK_POSE, headerAngle: f.raisedHeaderAngle, reelLift: this.reelLift };
    this.target = { ...this.pose };
    this.tankMass = p.startTank * this.capacityKg;
    this.v = kmh(p.speed);
    this.updateKnife();
    this.tankSeries.push([0, this.tankMass / this.capacityKg]);
  }

  get tankStartKg() {
    return this.params.startTank * this.capacityKg;
  }

  private updateKnife() {
    const m = mountMatrices(this.pose).header;
    const k = new Vector3(spec.header.cutterbar.x[1] - 0.1, spec.header.cutterbar.y[0], 0).applyMatrix4(m);
    this.knifeX = k.x;
    this.knifeY = cutHeight(this.pose);
  }

  private headerLowest(): number {
    const key = Math.round(this.pose.headerAngle * 4) / 4;
    let y = this.lowestCache.get(key);
    if (y === undefined) {
      y = headerLowestY({ ...this.pose, headerAngle: key });
      this.lowestCache.set(key, y);
    }
    return y;
  }

  private inCrop(X: number, Z: number, margin: number): boolean {
    const f = this.field;
    return X > -margin && X < f.length + margin && Z > -margin && Z < f.width + margin;
  }

  /** 工程の時間 dt だけ進める（固定の刻みで） */
  advance(dt: number, maxSteps = 2000) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && !this.done && n < maxSteps) {
      this.acc -= DT;
      this.step();
      n++;
    }
    if (this.done) this.acc = 0;
  }

  runToEnd(limit = 3600): ScenarioReport {
    while (!this.done && this.t < limit) this.step();
    return this.report();
  }

  private say(text: string) {
    this.log.push([this.t, text]);
  }

  step() {
    if (this.done) return;
    const p = this.params;
    const f = spec.field;
    const field = this.field;
    this.t += DT;

    // --- オペレータ：ヘッダ（刈刃が作物の手前 lead に来たら下ろし、作物を出たら上げる）
    const kc = toField(this.place, this.knifeX, 0);
    const lowerTime = Math.abs(f.raisedHeaderAngle - this.cutAngle) / ACTUATOR_RATES.headerAngle;
    const lead = f.headerLead + kmh(p.speed) * lowerTime;
    const ahead = toField(this.place, this.knifeX + lead, 0);
    const down = this.inCrop(kc[0], kc[1], 0.3) || this.inCrop(ahead[0], ahead[1], 0);
    if (down !== this.headerDown) this.say(down ? 'ヘッダを下げる' : 'ヘッダを上げる');
    this.headerDown = down;
    this.target.headerAngle = down ? this.cutAngle : f.raisedHeaderAngle;
    this.target.reelLift = this.reelLift;
    this.target.steer = Math.max(-spec.wheels.steerMax, Math.min(spec.wheels.steerMax, steerFor(this.place.kappa)));

    // --- 排出：タンクが unloadAt を超えたら運搬車を呼び、空になるまで出す。運搬車の通り道に作物があれば待つ
    if (!this.unloadReq && this.tankMass >= p.unloadAt * this.capacityKg - 1e-6 && this.tankMass > 1) {
      this.unloadReq = true;
      this.say('運搬車を呼ぶ');
    }
    this.laneClear = !field.anyStanding(this.place, this.lane);
    this.target.augerDeploy = this.unloadReq && this.laneClear ? spec.unload.deployRange[1] : 0;
    if (this.unloadReq && !this.laneClear) this.unloadWait += DT;

    this.pose = approachPose(this.pose, this.target, DT);
    this.updateKnife();

    // --- 速度：作物の中は作業速度、枕地は旋回速度。満杯で刈れないときは止まる
    const full = this.tankMass >= this.capacityKg - 1e-6;
    let vt = kmh(this.place.pass > 0 ? p.speed : f.turnSpeed);
    if (full && this.headerDown) {
      vt = 0;
      this.stoppedFull += DT;
      this.stuck += DT;
      if (this.stuck < DT * 1.5) this.say('タンクが満杯で停止');
    } else this.stuck = 0;
    vt = Math.min(vt, Math.sqrt(2 * f.accel * Math.max(0, this.path.total - this.s)));
    const dv = f.accel * DT;
    this.v = Math.max(0, this.v + Math.max(-dv, Math.min(dv, vt - this.v)));
    this.s = Math.min(this.path.total, this.s + this.v * DT);
    this.place = this.path.at(this.s);
    if (this.place.pass !== this.lastPass) {
      this.say(this.place.pass > 0 ? `行程 ${this.place.pass}` : '枕地で旋回');
      this.lastPass = this.place.pass;
    }

    // --- 刈り取り：刈刃の線が通った四角形
    const a1 = toField(this.place, this.knifeX, -this.hw);
    const b1 = toField(this.place, this.knifeX, this.hw);
    let grain = 0;
    const heading = -this.place.psi;
    if (this.prevKnife && this.knifeY < p.cropHeight + 0.3) {
      const knifeY = this.knifeY;
      const headLen = spec.crop.wheat.headLength;
      const r = field.sweepCut(
        this.prevKnife[0], this.prevKnife[1], a1, b1,
        (idx) => knifeY < field.height[idx] - headLen,
        knifeY,
        Math.max(1, this.place.pass),
        (idx) => {
          // 穂に届かない高さで作物に当たる：押し倒す
          if (knifeY < field.height[idx]) {
            field.state[idx] = FLAT;
            field.flatDir[idx] = heading;
            this.flattenedByHeader++;
            field.version++;
          }
        },
      );
      grain = r.grain;
      this.cutCells += r.cells;
      this.overlapCells += r.overlap;
    }
    this.prevKnife = [a1, b1];

    // --- 押し倒し：本体・車輪、ヘッダ（刈刃より後ろ）
    for (const r of this.bodyRects) this.flattenedByBody += field.flattenUnder(this.place, r, r.bottom, heading);
    const hl = this.headerLowest();
    if (hl < p.cropHeight + 0.2) {
      this.flattenedByHeader += field.flattenUnder(this.place, { x0: this.headerBack, x1: this.knifeX - 0.05, z0: -this.hw, z1: this.hw }, hl, heading);
    }

    // --- 質量：ヘッダ・フィーダ → 脱穀・選別 → タンク
    const mog = mogFromCut(this.knifeY);
    this.harvested += grain;
    this.hb.total += grain * (1 + mog);
    this.hb.grain += grain;
    const k1 = DT / TAU_HEADER;
    const outT = this.hb.total * k1;
    const outG = this.hb.grain * k1;
    this.hb.total -= outT;
    this.hb.grain -= outG;
    this.sb += outG;
    const toTank = this.sb * (DT / TAU_SEPARATOR);
    this.sb -= toTank;
    this.delivered += toTank;
    this.tankMass += toTank;
    if (this.tankMass > this.capacityKg) {
      this.overflow += this.tankMass - this.capacityKg;
      this.tankMass = this.capacityKg;
    }
    this.feedKgS += ((grain * (1 + mog)) / DT - this.feedKgS) * (DT / 0.4);
    this.rotorKgS = outT / DT;
    this.grainKgS = outG / DT;

    // 負荷率（刈っている間）
    if (this.rotorKgS > 0.05) {
      this.cuttingTime += DT;
      for (const st of this.base.stages) {
        if (st.id === 'unload') continue;
        const load = (st.id === 'shoe' || st.id === 'elevator' ? this.grainKgS : this.rotorKgS) * 3.6;
        const ratio = load / st.capacity;
        this.peak[st.id] = Math.max(this.peak[st.id] ?? 0, ratio);
        this.loadSum[st.id] = (this.loadSum[st.id] ?? 0) + ratio * DT;
      }
    }

    // --- 排出の流れ
    const flowing = this.unloadReq && this.laneClear && this.pose.augerDeploy >= 90 && this.tankMass > 0;
    if (flowing) {
      const m = Math.min(this.tankMass, spec.unload.rate * spec.crop.wheat.testWeight * DT);
      this.tankMass -= m;
      this.unloaded += m;
      if (!this.cur) {
        this.cur = { start: this.t, end: this.t, kg: 0, moving: this.v > 0.1, reason: '' };
        this.say('排出開始');
      }
      this.cur.kg += m;
      this.cur.end = this.t;
      if (this.tankMass <= 1) {
        this.tankMass = Math.max(0, this.tankMass);
        this.unloadReq = false;
      }
    } else if (this.cur && (!this.unloadReq || !this.laneClear)) {
      this.cur.reason = this.unloadReq ? '運搬車の通り道に作物' : 'タンクが空';
      this.unloads.push(this.cur);
      this.say(`排出終了（${this.cur.reason}）`);
      this.cur = null;
    }
    this.unloadFlowing = flowing;

    if (Math.floor(this.t + 1e-9) !== Math.floor(this.t - DT + 1e-9)) this.tankSeries.push([+this.t.toFixed(2), this.tankMass / this.capacityKg]);

    // --- 終わり
    if (this.stuck > 60) {
      this.aborted = 'タンクが満杯のまま 60 秒止まった（排出できる場所がない）';
      this.finish();
    } else if (this.s >= this.path.total - 1e-6 && this.v === 0 && this.hb.total + this.sb < 0.5 && !this.unloadFlowing) {
      this.finish();
    }
  }

  private finish() {
    if (this.cur) {
      this.cur.reason = '終了';
      this.unloads.push(this.cur);
      this.cur = null;
    }
    this.done = true;
    this.say(this.aborted ? `中断：${this.aborted}` : '終了');
  }

  report(): ScenarioReport {
    const field = this.field;
    const cellA = field.cell * field.cell;
    const z0 = 0;
    const z1 = Math.min(field.width, this.passCenters[this.passCenters.length - 1] + this.hw);
    const { count: uncut, strips } = field.uncutIn(0, field.length, z0, z1);
    const flattened = field.counts().flat;
    const w7ok = uncut === 0 && flattened === 0 && this.headerInside && this.dividerAhead;
    const names = Object.fromEntries(this.base.stages.map((s) => [s.id, s.name]));
    const peaks: StagePeak[] = this.base.stages
      .filter((s) => s.id !== 'unload')
      .map((s) => ({ id: s.id, name: names[s.id], peak: this.peak[s.id] ?? 0, avg: this.cuttingTime > 0 ? (this.loadSum[s.id] ?? 0) / this.cuttingTime : 0 }));
    const maxPeak = peaks.reduce((a, b) => (a.peak > b.peak ? a : b));
    const areaHa = (this.cutCells * cellA) / 10000;
    const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
    const unloadTime = this.unloads.reduce((a, u) => a + (u.end - u.start), 0);
    const checks: Check[] = this.base.checks.map((c) =>
      c.id === 'W-4'
        ? { ...c, ok: c.ok && maxPeak.peak <= 1, detail: `${c.detail}。実走の負荷率のピーク ${pct(maxPeak.peak)}（${maxPeak.name}）` }
        : c,
    );
    const stripText = strips.length ? `。残った帯 ${strips.map(([a, b]) => `Z ${a.toFixed(2)}〜${b.toFixed(2)} m`).slice(0, 3).join('、')}` : '';
    checks.push({
      id: 'W-7',
      name: '刈り残し・押し倒し',
      ok: w7ok,
      detail:
        `刈った幅（Z 0〜${z1.toFixed(1)} m）の刈り残し ${uncut} セル${stripText}。押し倒し ${flattened} セル（本体・車輪 ${this.flattenedByBody}、ヘッダ ${this.flattenedByHeader}）。` +
        `ヘッダの部品は刈幅 ±${this.hw.toFixed(3)} m の内側に${this.headerInside ? '収まる' : '収まらない'}、デバイダの先端は刈刃より${this.dividerAhead ? '前' : '後ろ'}`,
    });
    checks.push({
      id: 'W-8',
      name: '排出の段取り',
      ok: !this.aborted && this.stoppedFull === 0 && this.overflow === 0,
      detail:
        `排出 ${this.unloads.length} 回・計 ${unloadTime.toFixed(0)} 秒（${this.unloads.filter((u) => u.moving).length} 回は走りながら）。` +
        `満杯で停止 ${this.stoppedFull.toFixed(0)} 秒、運搬車を待った時間 ${this.unloadWait.toFixed(0)} 秒` +
        (this.aborted ? `。中断：${this.aborted}` : ''),
    });
    return {
      done: this.done,
      aborted: this.aborted,
      time: this.t,
      distance: this.s,
      passes: this.passCenters.length,
      areaHa,
      harvestedKg: this.harvested,
      deliveredKg: this.delivered,
      unloadedKg: this.unloaded,
      tankStartKg: this.tankStartKg,
      tankEndKg: this.tankMass,
      capacityKg: this.capacityKg,
      overflowKg: this.overflow,
      overlapM2: this.overlapCells * cellA,
      fieldRate: this.t > 0 ? areaHa / (this.t / 3600) : 0,
      unloads: [...this.unloads],
      unloadWait: this.unloadWait,
      stoppedFull: this.stoppedFull,
      peaks,
      w7: { zRange: [z0, z1], uncut, strips, flattened, flattenedByBody: this.flattenedByBody, flattenedByHeader: this.flattenedByHeader, headerInside: this.headerInside, dividerAhead: this.dividerAhead, ok: w7ok },
      base: this.base,
      checks,
      tankSeries: [...this.tankSeries],
      log: [...this.log],
    };
  }

  /** 状態の数（テスト・画面用） */
  standingLeft(): number {
    return this.field.counts().standing;
  }
}

