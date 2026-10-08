/**
 * 収穫の成立チェック（design §16、段階 1）。W-1〜W-6 を数式で判定する。
 * 能力の値の多くは PAMI の実測からの逆算による推定（docs/research/06-capacity.md）。
 */
import { Vector3 } from 'three';
import { spec, type Spec } from '../spec/spec';
import { mountMatrices, poseRanges } from './kinematics';
import { LIMITS } from './machine';
import type { Pose } from './types';

const deg = (d: number) => (d * Math.PI) / 180;

export interface CropConditions {
  yield: number; // t/ha
  cropHeight: number; // m
  speed: number; // km/h
  reelIndex: number;
  /** 省略時は刈高さから推定（PAMI の試験：刈高さを上げると MOG が減る） */
  mogRatio?: number;
}

export function defaultConditions(s: Spec = spec): CropConditions {
  return { yield: s.crop.wheat.yield, cropHeight: s.crop.wheat.height, speed: 5, reelIndex: 1.2 };
}

/** グレインタンクの容量（延長フラップ展開・平らに満たす）[m³] */
export function tankCapacity(s: Spec = spec): number {
  const tk = s.tank;
  const L = Math.abs(tk.x[0] - tk.x[1]);
  const W = tk.halfWidth * 2;
  const H = tk.y[1] - tk.y[0];
  const body = W * L * H - ((W - tk.vBottom.troughWidth) / 2) * tk.vBottom.depth * L;
  const f = tk.flap;
  const rise = f.height * Math.cos(deg(f.openDeg - 90));
  const flare = f.height * Math.sin(deg(f.openDeg - 90));
  return body + L * W * rise + (2 * (L + W) * rise * flare) / 2;
}

/** 分離グレート（ロータ下側の後半）の面積 [m²] */
export function separationArea(s: Spec = spec): number {
  const t = s.thresher;
  const rotorRear = t.rotor.front[0] - t.rotor.length * Math.cos(deg(t.rotor.slopeDeg));
  const grateLength = t.concave.x[1] - rotorRear;
  return (t.cage.wrapDeg / 360) * Math.PI * 2 * t.cage.innerRadius * grateLength;
}

/** 選別面積（チャッファ＋延長部＋シーブ）[m²] */
export function cleaningArea(s: Spec = spec): number {
  const sh = s.shoe;
  return (sh.chaffer.length + sh.chaffer.extension + sh.sieve.length) * sh.halfWidth * 2;
}

/** 刈刃（ナイフの線）の高さ [m] */
export function cutHeight(pose: Pose, s: Spec = spec): number {
  const m = mountMatrices(pose, s).header;
  return new Vector3(s.header.cutterbar.x[1] - 0.1, s.header.cutterbar.y[0], 0).applyMatrix4(m).y;
}

/** 刈高さ c を得るフィーダ角（二分探索、刈高さは角度に対して単調増加） */
export function headerAngleForCut(c: number, base: Pose, s: Spec = spec): number | null {
  const [lo, hi] = poseRanges(s).headerAngle;
  const f = (a: number) => cutHeight({ ...base, headerAngle: a }, s) - c;
  if (f(lo) > 0 || f(hi) < 0) return null;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (f(m) < 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** 刈高さから MOG/穀粒 を推定（PAMI 系の試験：低刈り 1.20、+15 cm で 0.85、+30 cm で 0.64） */
export function mogFromCut(c: number): number {
  const pts: Array<[number, number]> = [[0.1, 1.2], [0.25, 0.85], [0.4, 0.64]];
  if (c <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (c <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((c - x0) * (y1 - y0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

export interface Stage {
  id: 'feeder' | 'rotor' | 'shoe' | 'machine' | 'elevator' | 'unload';
  name: string;
  capacity: number; // t/h
  load: number; // t/h
  /** この段が能力いっぱいになる地速 [km/h] */
  limitSpeed: number;
  basis: string;
}

export interface Check {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
}

export interface HarvestReport {
  cut: number;
  mog: number;
  grain: number; // t/h
  total: number; // t/h
  stages: Stage[];
  maxSpeed: number;
  bottleneck: Stage;
  fillMinutes: number;
  unloadSeconds: number;
  checks: Check[];
}

export function harvestReport(pose: Pose, c: CropConditions, s: Spec = spec): HarvestReport {
  const w = s.crop.wheat;
  const cap = s.capacity;
  const width = s.header.width;
  const cut = cutHeight(pose, s);
  const mog = c.mogRatio ?? mogFromCut(cut);
  const v = Math.max(c.speed, 1e-6);
  const grain = (c.yield * width * v) / 10; // t/ha × m × km/h → t/h
  const total = grain * (1 + mog);
  const tw = w.testWeight / 1000; // t/m³

  const mk = (id: Stage['id'], name: string, capacity: number, load: number, basis: string): Stage => ({
    id, name, capacity, load, limitSpeed: (v * capacity) / load, basis,
  });
  const sep = separationArea(s);
  const clean = cleaningArea(s);
  const stages: Stage[] = [
    mk('feeder', 'フィーダ', cap.feederPerWidth * s.feeder.width, total, `幅 ${s.feeder.width} m × ${cap.feederPerWidth} t/h/m（実証の下限）`),
    mk('rotor', '脱穀・分離（ロータ）', cap.rotorLoad.nominal * sep * 3.6, total, `分離面積 ${sep.toFixed(2)} m² × ${cap.rotorLoad.nominal} kg/s/m²（推定）`),
    mk('shoe', '選別（シュー）', cap.shoeGrainLoad.nominal * clean * 3.6, grain, `選別面積 ${clean.toFixed(2)} m² × 穀粒 ${cap.shoeGrainLoad.nominal} kg/s/m²（推定）`),
    mk('machine', '機械全体（Class 8 の実績）', cap.machineTotal.nominal, total, `損失 1% の総量 ${cap.machineTotal.range[0]}〜${cap.machineTotal.range[1]} t/h（推定）`),
    mk('elevator', 'クリーングレインエレベータ', cap.elevator, grain, '大型機の実績 135 t/h 以上'),
    mk('unload', '排出オーガ', s.unload.rate * 3600 * tw, grain, `${s.unload.rate * 1000} L/s`),
  ];
  const bottleneck = stages.reduce((a, b) => (a.limitSpeed < b.limitSpeed ? a : b));
  const maxSpeed = bottleneck.limitSpeed;

  const tankT = tankCapacity(s) * tw;
  const fillMinutes = (tankT / grain) * 60;
  const unloadSeconds = tankCapacity(s) / s.unload.rate;

  const headBottom = c.cropHeight - w.headLength;
  const reelChecks = reelReach(pose, c, s);
  const reelMaxSpeed = ((LIMITS.reelRpmMax * Math.PI * 2 * s.header.reel.radius) / 60 / c.reelIndex) * 3.6;
  const cutOk = cut >= w.stubbleRange[0] - 0.005 && cut <= Math.min(w.stubbleRange[1], headBottom - 0.1);
  const checks: Check[] = [
    {
      id: 'W-1', name: '刈高さ',
      ok: cutOk,
      detail: `刈高さ ${(cut * 100).toFixed(0)} cm（推奨 ${w.stubbleRange[0] * 100}〜${w.stubbleRange[1] * 100} cm、穂の下端 ${(headBottom * 100).toFixed(0)} cm より 10 cm 以上下）`,
    },
    {
      id: 'W-2', name: 'リールの届き',
      ok: reelChecks.current,
      detail: `タイン下端 ${(reelChecks.tineLow * 100).toFixed(0)} cm、目標 ${(reelChecks.zone[0] * 100).toFixed(0)}〜${(reelChecks.zone[1] * 100).toFixed(0)} cm（作物の上から 1/3〜1/2）${reelChecks.current ? '' : reelChecks.adjustable ? '。リール上下の調整で届く' : '。調整範囲では届かない'}`,
    },
    {
      id: 'W-3', name: 'リールの周速比',
      ok: c.speed <= reelMaxSpeed,
      detail: `周速比 ${c.reelIndex.toFixed(2)} で上限 ${LIMITS.reelRpmMax} rpm に達する地速 ${reelMaxSpeed.toFixed(1)} km/h`,
    },
    {
      id: 'W-4', name: '処理量の釣り合い',
      ok: c.speed <= maxSpeed + 1e-9,
      detail: `投入 ${total.toFixed(0)} t/h（穀粒 ${grain.toFixed(0)}、MOG/穀粒 ${mog.toFixed(2)}）。最大速度 ${maxSpeed.toFixed(1)} km/h（${bottleneck.name}）`,
    },
    {
      id: 'W-5', name: 'タンクと排出',
      ok: unloadSeconds / 60 <= fillMinutes * cap.unloadToFillMax,
      detail: `満杯まで ${fillMinutes.toFixed(1)} 分、排出 ${unloadSeconds.toFixed(0)} 秒（比 ${((unloadSeconds / 60 / fillMinutes) * 100).toFixed(0)}%、上限 ${cap.unloadToFillMax * 100}%）`,
    },
    {
      id: 'W-6', name: '散布幅',
      ok: cap.spreadWidth >= width,
      detail: `わらの散布幅 ${cap.spreadWidth} m ≥ 作業幅 ${width.toFixed(2)} m`,
    },
  ];
  return { cut, mog, grain, total, stages, maxSpeed, bottleneck, fillMinutes, unloadSeconds, checks };
}

/** W-2：リールのタイン下端が、作物の上から 1/3〜1/2 の高さに来るか（現在の設定／リール上下の調整範囲で） */
export function reelReach(pose: Pose, c: CropConditions, s: Spec = spec) {
  const cut = cutHeight(pose, s);
  const h = c.cropHeight;
  const zone: [number, number] = [h - (h - cut) / 2, h - (h - cut) / 3];
  const low = (lift: number) => {
    const m = mountMatrices({ ...pose, reelLift: lift }, s).reel;
    return new Vector3(s.header.reel.x, s.header.reel.y, 0).applyMatrix4(m).y - s.header.reel.radius;
  };
  const tineLow = low(pose.reelLift);
  const [l0, l1] = s.header.reel.liftRange;
  const range = [low(l0), low(l1)];
  const adjustable = range[0] <= zone[1] + 1e-6 && range[1] >= zone[0] - 1e-6;
  const current = tineLow >= zone[0] - 1e-6 && tineLow <= zone[1] + 1e-6;
  return { zone, tineLow, adjustable, current };
}

/** W-2 の推奨リール位置：目標の中央にタイン下端が来るリール上下（範囲内に収める） */
export function suggestedReelLift(pose: Pose, c: CropConditions, s: Spec = spec): number {
  const r = reelReach(pose, c, s);
  const target = (r.zone[0] + r.zone[1]) / 2;
  const [l0, l1] = s.header.reel.liftRange;
  return Math.min(l1, Math.max(l0, pose.reelLift + (target - r.tineLow)));
}
