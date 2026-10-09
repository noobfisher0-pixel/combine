/**
 * 作物フロー（design §7、M4）。物理シミュレーションはせず、部品ごとに決めた経路に沿って粒子を流す。
 *
 * - 経路の点は「その区間を運ぶ部品のマウント」の座標で持ち、毎フレームその姿勢で変換する。
 *   ヘッダを昇降・チルトすれば、ヘッダ上の粒子も一緒に動く。
 * - 粒子 1 個は一定の質量を表す（流れごとに MASS_PER_PARTICLE）。発生量は「ロータに入った量」から決めるので、
 *   刈るのをやめると、経路の長さぶん遅れて穀粒も止まる。
 * - 時間はすべて工程の時間（実時間 × 再生倍率）。重力も同じ時間で効く（§6.3）。
 * 描画から切り離した計算なので、tests/flow.test.ts で質量の釣り合いと追従を確かめる。
 */
import { Matrix4, Vector3 } from 'three';
import { mountMatrices } from '../model/kinematics';
import { cutHeight, mogFromCut, tankCapacity } from '../model/harvest';
import { helixPoint } from '../model/helix';
import { unloadElbow } from '../model/parts';
import type { MountId, Pose } from '../model/types';
import { spec } from '../spec/spec';

export type FlowId = 'crop' | 'straw' | 'grain' | 'chaff' | 'tailings' | 'unload';
export const FLOWS: FlowId[] = ['crop', 'straw', 'grain', 'chaff', 'tailings', 'unload'];

/** 粒子 1 個が表す質量 [kg]。粒子数の上限内に収まるように選んだ表示上の値 */
export const MASS_PER_PARTICLE: Record<FlowId, number> = {
  crop: 0.05,
  straw: 0.04,
  grain: 0.04,
  chaff: 0.015,
  tailings: 0.04,
  unload: 0.3,
};

/** 流れごとの粒子数の上限（合計 8,000、design §7.2） */
export const MAX_PARTICLES: Record<FlowId, number> = {
  crop: 2000,
  straw: 1800,
  grain: 2600,
  chaff: 800,
  tailings: 200,
  unload: 600,
};

export interface FlowInputs {
  pose: Pose;
  engineOn: boolean;
  headerOn: boolean;
  separatorOn: boolean;
  unloadOn: boolean;
  groundSpeed: number; // km/h
  yield: number; // t/ha
  cropHeight: number; // m
  mogRatio?: number; // 省略時は刈高さから
  draperSide: number; // m/s
  draperCenter: number; // m/s
  elevator: number; // m/s
  /** 作物を取り込むか（コーンヘッドのときは小麦の流れを止める） */
  intake?: boolean;
}

interface Waypoint {
  mount: MountId;
  /** 粒子ごとの値（z0 など）からマウント座標の点を作る */
  p: (q: Particle) => [number, number, number];
}

type Stage =
  | { kind: 'path'; pts: Waypoint[]; speed: (i: FlowInputs) => number }
  | { kind: 'helix' } // ロータの周り（わら）
  | { kind: 'fall'; floor: (q: Particle) => number; next: 'slide' | 'trough' | 'ground' | 'pile' }
  | { kind: 'slide' } // シューの上を後ろへ（穀粒）
  | { kind: 'ground' };

interface Particle {
  flow: FlowId;
  route: Stage[];
  stage: number;
  seg: number;
  s: number;
  z0: number;
  side: number;
  xd: number; // 穀粒がシューを落ちる位置
  theta: number;
  pos: Vector3;
  vel: Vector3;
  age: number;
  spin: number; // 見た目の向き（0〜1）
}

const G = 9.81;
const deg = (d: number) => (d * Math.PI) / 180;

// ------------------------------------------------------------ 形から決まる高さ

const sh = spec.shoe;
const t5 = Math.tan(deg(sh.chaffer.slopeDeg));
/** シューの上面の高さ（x の位置で、パン・前段チャッファ・チャッファ・延長部のどれか） */
function shoeTop(x: number): number {
  if (x >= sh.chaffer.front[0] + 0.0) return sh.pan.y + sh.pan.t / 2;
  return sh.chaffer.front[1] + (sh.chaffer.front[0] - x) * t5 + sh.chaffer.t / 2;
}
const PAN_START = sh.frontChaffer.x[0]; // −0.55：ここより後ろはルーバー（下へ抜けられる）
const SHOE_REAR = sh.chaffer.front[0] - (sh.chaffer.length + sh.chaffer.extension) * Math.cos(deg(sh.chaffer.slopeDeg));
const TROUGH_Y = sh.cleanGrainAuger.y + 0.04;

const rotorFront = new Vector3(spec.thresher.rotor.front[0], spec.thresher.rotor.front[1], 0);
const rotorRearX = spec.thresher.rotor.front[0] - spec.thresher.rotor.length * Math.cos(deg(spec.thresher.rotor.slopeDeg));
const rotorRearY = spec.thresher.rotor.front[1] + spec.thresher.rotor.length * Math.sin(deg(spec.thresher.rotor.slopeDeg));
const rotorAxis = new Vector3(rotorRearX, rotorRearY, 0).sub(rotorFront).normalize();
const ROTOR_LEN = spec.thresher.rotor.length;
const axisY = (x: number) => spec.thresher.rotor.front[1] + (spec.thresher.rotor.front[0] - x) * Math.tan(deg(spec.thresher.rotor.slopeDeg));

// ------------------------------------------------------------ 経路

const clampCenter = (z: number) => Math.sign(z) * Math.min(Math.abs(z), 0.95);
const cut = spec.header.cutterbar;

const CROP: Stage[] = [
  {
    kind: 'path',
    speed: (i) => Math.max(1.0, i.draperSide * 0.6),
    pts: [
      { mount: 'header', p: (q) => [cut.x[1] - 0.12, cut.y[1] + 0.02, q.z0] },
      { mount: 'header', p: (q) => [4.55, 0.24, q.z0] },
    ],
  },
  { kind: 'path', speed: (i) => i.draperSide, pts: [
    { mount: 'header', p: (q) => [4.55, 0.24, q.z0] },
    { mount: 'header', p: (q) => [4.55, 0.24, clampCenter(q.z0)] },
  ] },
  { kind: 'path', speed: (i) => i.draperCenter, pts: [
    { mount: 'header', p: (q) => [4.55, 0.24, clampCenter(q.z0)] },
    { mount: 'header', p: (q) => [3.5, 0.26, clampCenter(q.z0) * 0.6] },
    { mount: 'header', p: (q) => [3.22, 0.55, clampCenter(q.z0) * 0.45] },
  ] },
  // フィーダ：下送りで床の上を後上方へ（チェーン 3 m/s）
  { kind: 'path', speed: () => 3, pts: [
    { mount: 'feeder', p: (q) => [3.0, 0.53, clampCenter(q.z0) * 0.45] },
    { mount: 'feeder', p: (q) => [1.1, 1.6, clampCenter(q.z0) * 0.45] },
    { mount: 'body', p: (q) => [0.62, 1.8, clampCenter(q.z0) * 0.15] },
    { mount: 'body', p: () => [rotorFront.x, rotorFront.y, 0] },
  ] },
];

const STRAW: Stage[] = [
  { kind: 'helix' },
  { kind: 'path', speed: () => 6, pts: [
    { mount: 'body', p: (q) => [rotorRearX - 0.05, rotorRearY + 0.1, q.z0 * 0.3] },
    { mount: 'body', p: (q) => [spec.thresher.beater.x + 0.05, spec.thresher.beater.y + 0.2, q.z0 * 0.4] },
    { mount: 'body', p: (q) => [-3.35, 1.75, q.z0 * 0.5] },
    { mount: 'body', p: (q) => [spec.residue.chopper.x + 0.05, spec.residue.chopper.y + 0.3, q.z0 * 0.5] },
    { mount: 'body', p: (q) => [spec.residue.chopper.x - 0.3, spec.residue.chopper.y - 0.2, q.z0 * 0.5] },
    { mount: 'body', p: (q) => [spec.residue.strawSpreader.x + 0.1, spec.residue.strawSpreader.y + 0.12, q.side * spec.residue.strawSpreader.z] },
  ] },
  { kind: 'fall', floor: () => 0.02, next: 'ground' },
  { kind: 'ground' },
];

const GRAIN: Stage[] = [
  { kind: 'fall', floor: (q) => shoeTop(q.pos.x), next: 'slide' },
  { kind: 'slide' },
  { kind: 'fall', floor: () => TROUGH_Y, next: 'trough' },
  { kind: 'path', speed: () => 0.6, pts: [
    { mount: 'body', p: (q) => [q.xd, TROUGH_Y, q.z0] },
    { mount: 'body', p: (q) => [sh.cleanGrainAuger.x, TROUGH_Y, q.z0] },
    { mount: 'body', p: () => [sh.cleanGrainAuger.x, TROUGH_Y, sh.cleanGrainAuger.z[1] - 0.05] },
  ] },
  { kind: 'path', speed: (i) => i.elevator, pts: [
    { mount: 'body', p: () => [sh.elevator.x + 0.08, sh.elevator.y[0] + 0.08, sh.elevator.z] },
    { mount: 'body', p: () => [sh.elevator.x + 0.08, sh.elevator.y[1] - 0.06, sh.elevator.z] },
    { mount: 'body', p: () => [spec.tank.bubbleUp.x, spec.tank.bubbleUp.y[0] + 0.05, spec.tank.bubbleUp.z] },
    { mount: 'body', p: () => [spec.tank.bubbleUp.x, spec.tank.bubbleUp.y[1], spec.tank.bubbleUp.z] },
  ] },
  { kind: 'fall', floor: () => Number.NaN, next: 'pile' }, // 床はタンクの山の高さ（system が決める）
];

const CHAFF: Stage[] = [
  { kind: 'path', speed: () => 4.5, pts: [
    { mount: 'body', p: (q) => [q.xd, shoeTop(q.xd) + 0.05, q.z0] },
    { mount: 'body', p: (q) => [SHOE_REAR - 0.1, shoeTop(SHOE_REAR) + 0.12, q.z0] },
    { mount: 'body', p: (q) => [-2.95, 1.0, q.z0 * 0.6] },
    { mount: 'body', p: (q) => [spec.residue.chaffSpreader.x, spec.residue.chaffSpreader.y + 0.04, q.side * spec.residue.chaffSpreader.z] },
  ] },
  { kind: 'fall', floor: () => 0.02, next: 'ground' },
  { kind: 'ground' },
];

const TAILINGS: Stage[] = [
  { kind: 'path', speed: () => 0.8, pts: [
    { mount: 'body', p: (q) => [q.xd, shoeTop(q.xd) + 0.02, q.z0] },
    { mount: 'body', p: (q) => [sh.tailingsAuger.x, sh.tailingsAuger.y + 0.04, q.z0] },
    { mount: 'body', p: () => [sh.tailingsAuger.x, sh.tailingsAuger.y + 0.04, sh.tailingsAuger.z[1] - 0.05] },
  ] },
  { kind: 'path', speed: (i) => i.elevator, pts: [
    { mount: 'body', p: () => [sh.tailingsReturn.x, sh.tailingsReturn.y[0] + 0.05, sh.tailingsReturn.z] },
    { mount: 'body', p: () => [sh.tailingsReturn.x, sh.tailingsReturn.y[1] - 0.04, sh.tailingsReturn.z] },
    // リスレッシャから グレインパンの前部へ投げ返す
    { mount: 'body', p: () => [-0.25, sh.pan.y + 0.18, 0.6] },
  ] },
];

const UNLOAD: Stage[] = [
  { kind: 'fall', floor: () => 0.02, next: 'ground' },
  { kind: 'ground' },
];

// ------------------------------------------------------------ 本体

export interface FlowStats {
  count: Record<FlowId, number>;
  tankMass: number; // kg
  tankCapacityMass: number; // kg
  delivered: number; // タンクに入った穀粒の累計 [kg]
  unloaded: number; // 排出した累計 [kg]
  cutting: boolean;
}

export class FlowSystem {
  readonly particles: Record<FlowId, Particle[]> = { crop: [], straw: [], grain: [], chaff: [], tailings: [], unload: [] };
  private acc: Record<FlowId, number> = { crop: 0, straw: 0, grain: 0, chaff: 0, tailings: 0, unload: 0 };
  private rand: () => number;
  tankMass = 0;
  delivered = 0;
  unloaded = 0;
  cutting = false;
  readonly tankCapacityMass = tankCapacity() * spec.crop.wheat.testWeight;
  private mats: Record<MountId, Matrix4> = mountMatrices({ headerAngle: 0, faceTilt: 0, lateralTilt: 0, reelLift: 0, reelSlide: 0, augerDeploy: 0, flaps: 0, steer: 0 });

  constructor(seed = 1) {
    // 乱数のシードを固定できるようにする（テストとスクリーンショットを決定的にする）
    let x = seed >>> 0 || 1;
    this.rand = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return ((x >>> 0) % 1_000_000) / 1_000_000;
    };
  }

  stats(): FlowStats {
    const count = Object.fromEntries(FLOWS.map((f) => [f, this.particles[f].length])) as Record<FlowId, number>;
    return { count, tankMass: this.tankMass, tankCapacityMass: this.tankCapacityMass, delivered: this.delivered, unloaded: this.unloaded, cutting: this.cutting };
  }

  /** 山の上面の高さ（タンクの中の穀粒の量から。V 底は省き、平らな箱として計算） */
  pileTopY(): number {
    const tk = spec.tank;
    const area = Math.abs(tk.x[0] - tk.x[1]) * tk.halfWidth * 2;
    const vol = this.tankMass / spec.crop.wheat.testWeight;
    return tk.y[0] + 0.04 + vol / area;
  }

  private spawn(flow: FlowId, init: Partial<Particle>, route: Stage[]): Particle | null {
    const list = this.particles[flow];
    if (list.length >= MAX_PARTICLES[flow]) return null;
    const q: Particle = {
      flow, route, stage: 0, seg: 0, s: 0,
      z0: 0, side: this.rand() < 0.5 ? -1 : 1, xd: 0, theta: 0,
      pos: new Vector3(), vel: new Vector3(), age: 0, spin: this.rand(),
      ...init,
    };
    list.push(q);
    return q;
  }

  /** dt = 工程の時間 [s] */
  update(dt: number, inp: FlowInputs) {
    if (dt <= 0) return;
    this.mats = mountMatrices(inp.pose);
    const on = inp.engineOn;
    const sep = on && inp.separatorOn;
    const header = on && inp.headerOn;
    const r = this.rand;
    const hw = spec.header.width / 2 - 0.3;

    // --- 刈り取り：ヘッダが作物の高さより下にあり、走っているとき
    const cutH = cutHeight(inp.pose);
    const mog = inp.mogRatio ?? mogFromCut(cutH);
    this.cutting = inp.intake !== false && header && sep && inp.groundSpeed > 0 && cutH < inp.cropHeight - 0.05;
    if (this.cutting) {
      const grainKgS = (inp.yield * 1000 * spec.header.width * (inp.groundSpeed / 3.6)) / 10000; // t/ha → kg/m²
      const totalKgS = grainKgS * (1 + mog);
      this.acc.crop += (totalKgS * dt) / MASS_PER_PARTICLE.crop;
      while (this.acc.crop >= 1) {
        this.acc.crop -= 1;
        this.spawn('crop', { z0: (r() * 2 - 1) * hw }, CROP);
      }
    }

    // --- 移動
    const rotorIn = { mass: 0 };
    this.step('crop', dt, inp, header && sep, (q) => {
      rotorIn.mass += MASS_PER_PARTICLE.crop;
      void q;
    });

    // --- ロータに入った量から、わら・穀粒・籾殻・2 番を出す
    if (rotorIn.mass > 0) {
      const g = rotorIn.mass / (1 + mog);
      const m = rotorIn.mass - g;
      this.acc.grain += (g * 0.95) / MASS_PER_PARTICLE.grain;
      this.acc.tailings += (g * 0.05) / MASS_PER_PARTICLE.tailings;
      this.acc.straw += (m * 0.8) / MASS_PER_PARTICLE.straw;
      this.acc.chaff += (m * 0.2) / MASS_PER_PARTICLE.chaff;
    }
    while (this.acc.straw >= 1) {
      this.acc.straw -= 1;
      this.spawn('straw', { z0: r() * 2 - 1, theta: r() * Math.PI * 2 }, STRAW);
    }
    while (this.acc.grain >= 1) {
      this.acc.grain -= 1;
      // コンケーブ（前 1 m）で 7 割、分離グレートで 3 割が落ちる
      const x = r() < 0.7
        ? spec.thresher.concave.x[0] + (spec.thresher.concave.x[1] - spec.thresher.concave.x[0]) * r()
        : spec.thresher.concave.x[1] + (Math.max(rotorRearX, SHOE_REAR + 0.1) - spec.thresher.concave.x[1]) * r();
      const phi = (r() * 2 - 1) * deg(60);
      const pos = new Vector3(x, axisY(x) - 0.42 * Math.cos(phi), 0.42 * Math.sin(phi));
      this.spawn('grain', { pos, vel: new Vector3(0, -0.6, 0), z0: pos.z }, GRAIN);
    }
    while (this.acc.chaff >= 1) {
      this.acc.chaff -= 1;
      const xd = sh.chaffer.front[0] - r() * sh.chaffer.length;
      this.spawn('chaff', { xd, z0: (r() * 2 - 1) * (sh.halfWidth - 0.1) }, CHAFF);
    }
    while (this.acc.tailings >= 1) {
      this.acc.tailings -= 1;
      const xd = SHOE_REAR + r() * sh.chaffer.extension;
      this.spawn('tailings', { xd, z0: (r() * 2 - 1) * (sh.halfWidth - 0.15) }, TAILINGS);
    }

    this.step('straw', dt, inp, sep);
    this.step('grain', dt, inp, sep);
    this.step('chaff', dt, inp, sep);
    this.step('tailings', dt, inp, sep, (q) => {
      // 2 番はグレインパンの前部に戻って、穀粒としてもう一度流れる
      this.spawn('grain', { pos: q.pos.clone(), vel: new Vector3(0.5, 0, 0), z0: q.pos.z }, GRAIN);
    });

    // --- 排出：オーガを 90° 以上振り出して排出 ON、タンクに穀粒があるとき
    const unloading = on && inp.unloadOn && inp.pose.augerDeploy >= 90 && this.tankMass > 0;
    if (unloading) {
      const rate = spec.unload.rate * spec.crop.wheat.testWeight; // kg/s
      const m = Math.min(this.tankMass, rate * dt);
      this.tankMass -= m;
      this.unloaded += m;
      this.acc.unload += m / MASS_PER_PARTICLE.unload;
      const u = spec.unload;
      const elbow = unloadElbow();
      const tip = new Vector3(elbow[0] + u.tubeLength - u.spout.radius, elbow[1] - u.spout.drop, elbow[2]).applyMatrix4(this.mats.auger);
      while (this.acc.unload >= 1) {
        this.acc.unload -= 1;
        const jitter = new Vector3((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12);
        this.spawn('unload', { pos: tip.clone().add(jitter), vel: new Vector3((r() - 0.5) * 0.3, -1.5, (r() - 0.5) * 0.3) }, UNLOAD);
      }
    }
    this.step('unload', dt, inp, true);
  }

  /** 流れ 1 つ分の粒子を進める。経路の終わりに着いた粒子は onEnd を呼んで消す。 */
  private step(flow: FlowId, dt: number, inp: FlowInputs, running: boolean, onEnd?: (q: Particle) => void) {
    const list = this.particles[flow];
    const keep: Particle[] = [];
    const a = new Vector3();
    const b = new Vector3();
    for (const q of list) {
      q.age += dt;
      let alive = true;
      let budget = dt;
      // 1 フレームで複数の区間を進むことがあるので、時間を使い切るまで回す
      for (let guard = 0; guard < 8 && budget > 0 && alive; guard++) {
        const st = q.route[q.stage];
        if (!st) {
          onEnd?.(q);
          alive = false;
          break;
        }
        if (st.kind === 'ground') {
          // 地面に落ちた粒子は地速で後ろへ流れ、しばらくして消える
          q.pos.x -= (inp.engineOn ? inp.groundSpeed / 3.6 : 0) * budget;
          if (q.age > 6 || q.pos.x < -25) alive = false;
          budget = 0;
          break;
        }
        if (!running && st.kind !== 'fall') {
          budget = 0;
          break;
        }
        if (st.kind === 'path') {
          const v = st.speed(inp);
          let dist = v * budget;
          budget = 0;
          while (alive) {
            if (q.seg >= st.pts.length - 1) {
              q.stage++;
              q.seg = 0;
              q.s = 0;
              budget = v > 0 ? dist / v : 0;
              break;
            }
            this.wp(st.pts[q.seg], q, a);
            this.wp(st.pts[q.seg + 1], q, b);
            const len = a.distanceTo(b);
            if (q.s + dist < len) {
              q.s += dist;
              q.pos.copy(a).lerp(b, len > 0 ? q.s / len : 1);
              break;
            }
            dist -= len - q.s;
            q.seg++;
            q.s = 0;
            q.pos.copy(b);
          }
        } else if (st.kind === 'helix') {
          // ロータの周りを回りながら後ろへ（約 9 周、滞留約 2.5 秒）
          const turns = 9;
          const total = ROTOR_LEN - spec.thresher.impellerLength;
          const along = (total / 2.5) * budget;
          q.s += along;
          q.theta += ((turns * 2 * Math.PI) / total) * along;
          const pt = helixPoint(rotorFront.clone().addScaledVector(rotorAxis, spec.thresher.impellerLength + q.s), rotorAxis, spec.thresher.strawPathRadius, q.theta, 0);
          q.pos.copy(pt);
          budget = 0;
          if (q.s >= total) {
            q.stage++;
            q.seg = 0;
            q.s = 0;
          }
        } else if (st.kind === 'fall') {
          if (q.vel.lengthSq() === 0 && q.stage > 0) {
            // 前の区間の終わりから投げ出す：わら・籾殻は後方へ扇形、穀粒は落とすだけ
            if (flow === 'straw' || flow === 'chaff') {
              const ang = (this.rand() * 2 - 1) * deg(60) * (flow === 'chaff' ? 1.2 : 1);
              const sp = flow === 'straw' ? 7 : 5;
              q.vel.set(-Math.cos(ang) * sp, 0.8, Math.sin(ang) * sp + q.side * 1.5);
            } else if (flow === 'grain') {
              q.vel.set(-0.6, 0.4, -0.5 * Math.sign(q.pos.z || 1));
            }
          }
          q.vel.y -= G * budget;
          q.pos.addScaledVector(q.vel, budget);
          let floor = st.floor(q);
          if (Number.isNaN(floor)) floor = this.pileTopY();
          budget = 0;
          if (q.pos.y <= floor) {
            q.pos.y = floor;
            if (st.next === 'pile') {
              this.tankMass = Math.min(this.tankCapacityMass, this.tankMass + MASS_PER_PARTICLE[flow]);
              this.delivered += MASS_PER_PARTICLE[flow];
              alive = false;
              break;
            }
            q.vel.set(0, 0, 0);
            q.stage++;
            q.seg = 0;
            q.s = 0;
            if (st.next === 'slide') {
              // シュー上で下へ抜ける位置：ルーバーのある前段チャッファの始まり（板のグレインパンの後ろ）から
              // チャッファの後端の手前までのどこか。前ほど多く抜ける
              const start = Math.min(q.pos.x, PAN_START);
              const back = SHOE_REAR + 0.05;
              q.xd = start - Math.pow(this.rand(), 1.6) * (start - back);
            }
            if (st.next === 'trough') q.xd = q.pos.x;
          }
        } else if (st.kind === 'slide') {
          // シューの振動で後ろへ送られ、xd で下へ抜ける
          q.pos.x -= 0.4 * budget;
          q.pos.y = shoeTop(q.pos.x) + 0.01;
          budget = 0;
          if (q.pos.x <= q.xd) {
            q.stage++;
            q.vel.set(0, -0.3, 0);
          }
        }
      }
      if (alive) keep.push(q);
    }
    this.particles[flow] = keep;
  }

  private wp(w: Waypoint, q: Particle, out: Vector3) {
    const [x, y, z] = w.p(q);
    return out.set(x, y, z).applyMatrix4(this.mats[w.mount]);
  }

  /** テスト・操作用 */
  setTankMass(kg: number) {
    this.tankMass = Math.max(0, Math.min(this.tankCapacityMass, kg));
  }
  clear() {
    for (const f of FLOWS) this.particles[f] = [];
    for (const f of FLOWS) this.acc[f] = 0;
  }
}
