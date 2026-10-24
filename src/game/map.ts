/**
 * ゲームのマップ（docs/game-design.md §5「標準マップ」・§6）。
 *
 * 座標は M6 の圃場座標と同じ（X・Z、Y 上）。作物の範囲の外接長方形を (0,0)〜(length,width) に置き、
 * その外側に枕地（headland）、さらに外側に柵（world）。
 *
 * 2 段に分ける：
 * - planMap：シードから形・障害物・収量の高い場所・倒れた小麦・水たまり・トラックを決める（軽い。1,000 シードを検査できる）。
 * - buildMap：計画からセル（WheatField）を作る。
 * 生成は整数のハッシュと四則演算・平方根だけで行う（三角関数を使わない、G-R-13）。
 */
import { WheatField, type CellSample, type MachinePlace } from '../field/field';
import { spec } from '../spec/spec';
import { BALANCE, BALANCE_VERSION, type Difficulty } from './balance';
import { fnv1a, fractalNoise, mulberry32 } from './rand';

export interface Obstacle {
  kind: 'pole' | 'rock' | 'tree';
  x: number;
  z: number;
  r: number;
}
export interface Circle {
  x: number;
  z: number;
  r: number;
}
export type Shape = 'rect' | 'L' | 'trapezoid' | 'notch';
export const SHAPE_NAMES: Record<Shape, string> = { rect: '長方形', L: 'L 字', trapezoid: '台形', notch: '角の欠けた長方形' };

export interface MapPlan {
  version: number;
  seed: string;
  difficulty: Difficulty;
  shape: Shape;
  /** 作物の範囲の外接長方形 */
  length: number;
  width: number;
  /** 作物の範囲（多角形、頂点の並び） */
  polygon: Array<[number, number]>;
  area: number; // m²
  obstacles: Obstacle[];
  hotspots: Array<Circle & { gain: number }>;
  lodged: Array<Circle & { dir: number }>;
  water: Circle[];
  truck: MachinePlace;
  start: MachinePlace;
  /** 検査に通らず作り直した回数。10 回で駄目なら標準マップ（fallback） */
  attempt: number;
  fallback: boolean;
}

export interface GameMap extends MapPlan {
  headland: number;
  /** 柵の内側（圃場座標） */
  world: { x0: number; z0: number; x1: number; z1: number };
  inCrop: (X: number, Z: number) => boolean;
  inWater: (X: number, Z: number) => boolean;
  cropHeight: number;
  yield: number; // t/ha（本物の値。ゲームの重さはこれに grainMult を掛ける）
  field: WheatField;
}

/** 生成の決まり（§6） */
export const MAP_RULES = {
  length: [90, 140] as const,
  width: [55, 90] as const,
  area: [5000, 12600] as const, // m²（0.5〜1.26 ha）
  spacing: 14, // m：障害物どうし・障害物と作物の縁の「すき間」（外周どうし）。刈幅 12.19 m より広く、間を通れる
  truckFromCorner: [20, 60] as const,
  obstacles: { easy: [0, 0], normal: [0, 3], hard: [2, 6] } as const,
  maxAttempts: 10,
};

// ------------------------------------------------------------ 幾何（四則演算と平方根だけ）

export function pointInPolygon(poly: Array<[number, number]>, X: number, Z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > Z !== zj > Z && X < ((xj - xi) * (Z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
}

/** 点から多角形の辺までの最短距離 */
export function distanceToEdges(poly: Array<[number, number]>, X: number, Z: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((X - ax) * dx + (Z - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - X;
    const pz = az + dz * t - Z;
    best = Math.min(best, Math.sqrt(px * px + pz * pz));
  }
  return best;
}

const inCircle = (c: Circle, X: number, Z: number, pad = 0) => (X - c.x) ** 2 + (Z - c.z) ** 2 <= (c.r + pad) ** 2;

// ------------------------------------------------------------ 計画

function startPlace(): MachinePlace {
  // 回り刈りの 1 辺目：左端（Z = 0）を 0.1 m はみ出し、+X へ。左は圃場の外。作物の端の 8 m 手前から
  return { x: -8, z: spec.header.width / 2 - 0.1, psi: 0 };
}

/** 標準マップ：作物の範囲 120 m × 70 m の長方形、障害物なし、収量のゆらぎ ±25 %、トラックは角から 40 m（§5） */
export function standardPlan(seed = 'standard', difficulty: Difficulty = 'normal'): MapPlan {
  const length = 120;
  const width = 70;
  const polygon: Array<[number, number]> = [[0, 0], [length, 0], [length, width], [0, width]];
  return {
    version: BALANCE_VERSION, seed, difficulty, shape: 'rect', length, width, polygon, area: length * width,
    obstacles: [], hotspots: [], lodged: [], water: [],
    truck: { x: -10, z: -20, psi: 0 }, start: startPlace(), attempt: 0, fallback: false,
  };
}

/** シードから 1 回分の計画を作る（検査はしない） */
function draft(seed: string, difficulty: Difficulty, attempt: number): MapPlan {
  const h = fnv1a(`${BALANCE_VERSION}:${difficulty}:${seed}${attempt ? `#${attempt}` : ''}`);
  const r = mulberry32(h);
  const range = (a: number, b: number) => a + (b - a) * r();
  const pick = <T>(xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(r() * xs.length))];

  const shapes: Shape[] = difficulty === 'easy' ? ['rect', 'trapezoid'] : ['rect', 'L', 'trapezoid', 'notch'];
  const shape = pick(shapes);
  let length = 0;
  let width = 0;
  let polygon: Array<[number, number]> = [];
  for (let tries = 0; tries < 30; tries++) {
    length = Math.round(range(...MAP_RULES.length));
    width = Math.round(range(...MAP_RULES.width));
    const L = length;
    const W = width;
    if (shape === 'rect') polygon = [[0, 0], [L, 0], [L, W], [0, W]];
    else if (shape === 'L') {
      const cw = Math.round(L * range(0.3, 0.45));
      const ch = Math.round(W * range(0.3, 0.45));
      polygon = [[0, 0], [L, 0], [L, W - ch], [L - cw, W - ch], [L - cw, W], [0, W]];
    } else if (shape === 'trapezoid') {
      const a = Math.round(L * range(0.1, 0.25));
      polygon = [[0, 0], [L, 0], [L - a, W], [0, W]];
    } else {
      const n = Math.round(range(15, 25));
      polygon = [[0, 0], [L, 0], [L, W], [n, W], [0, W - n]];
    }
    const area = polygonArea(polygon);
    if (area >= MAP_RULES.area[0] && area <= MAP_RULES.area[1]) break;
  }
  const inside = (X: number, Z: number) => pointInPolygon(polygon, X, Z);
  const randomInside = (margin: number): [number, number] | null => {
    for (let i = 0; i < 100; i++) {
      const X = range(0, length);
      const Z = range(0, width);
      if (inside(X, Z) && distanceToEdges(polygon, X, Z) >= margin) return [X, Z];
    }
    return null;
  };

  // 障害物：作物の縁とのすき間 14 m 以上、おたがいのすき間 14 m 以上（刈幅より広く、間を通れる）
  const obstacles: Obstacle[] = [];
  const [nMin, nMax] = MAP_RULES.obstacles[difficulty];
  const nObs = nMin + Math.floor(r() * (nMax - nMin + 1));
  const kinds: Array<Obstacle['kind']> = difficulty === 'hard' ? ['pole', 'rock', 'tree'] : ['pole', 'rock'];
  const RADIUS = { pole: 0.3, rock: 0.6, tree: 2 } as const;
  for (let i = 0; i < nObs; i++) {
    const kind = pick(kinds);
    const rad = RADIUS[kind];
    for (let t = 0; t < 50; t++) {
      const p = randomInside(MAP_RULES.spacing + rad);
      if (!p) break;
      if (obstacles.every((o) => Math.sqrt((o.x - p[0]) ** 2 + (o.z - p[1]) ** 2) >= MAP_RULES.spacing + o.r + rad)) {
        obstacles.push({ kind, x: p[0], z: p[1], r: rad });
        break;
      }
    }
  }

  // 収量の高い場所 2〜4 か所（＋30〜50 %）
  const hotspots: MapPlan['hotspots'] = [];
  const nHot = 2 + Math.floor(r() * 3);
  for (let i = 0; i < nHot; i++) {
    const p = randomInside(4);
    if (p) hotspots.push({ x: p[0], z: p[1], r: range(8, 15), gain: range(0.3, 0.5) });
  }

  // むずかしい：倒れた小麦 1〜3 か所、水たまり 1〜2 か所
  const lodged: MapPlan['lodged'] = [];
  const water: Circle[] = [];
  if (difficulty === 'hard') {
    const nL = 1 + Math.floor(r() * 3);
    for (let i = 0; i < nL; i++) {
      const p = randomInside(8);
      if (p) lodged.push({ x: p[0], z: p[1], r: range(5, 9), dir: range(0, 6.283185307179586) });
    }
    const nW = 1 + Math.floor(r() * 2);
    for (let i = 0; i < nW; i++) {
      for (let t = 0; t < 30; t++) {
        const p = randomInside(10);
        if (!p) break;
        const wr = range(4, 7);
        if (obstacles.every((o) => Math.sqrt((o.x - p[0]) ** 2 + (o.z - p[1]) ** 2) >= MAP_RULES.spacing + o.r + wr)) {
          water.push({ x: p[0], z: p[1], r: wr });
          break;
        }
      }
    }
  }

  // トラック：下側の枕地の道、作物の左下の角から 20〜60 m
  const truck: MachinePlace = { x: Math.min(length + 10, range(...MAP_RULES.truckFromCorner)), z: -18, psi: 0 };

  return {
    version: BALANCE_VERSION, seed, difficulty, shape, length, width, polygon, area: polygonArea(polygon),
    obstacles, hotspots, lodged, water, truck, start: startPlace(), attempt, fallback: false,
  };
}

/** 計画の検査（§6）。違反の説明の一覧（空なら合格） */
export function checkPlan(p: MapPlan): string[] {
  const bad: string[] = [];
  const hl = BALANCE.map.headland;
  if (p.area < MAP_RULES.area[0] - 1e-6 || p.area > MAP_RULES.area[1] + 1e-6) bad.push(`面積 ${p.area.toFixed(0)} m²`);
  if (p.length < MAP_RULES.length[0] || p.length > MAP_RULES.length[1] || p.width < MAP_RULES.width[0] || p.width > MAP_RULES.width[1]) bad.push('外接長方形の大きさ');
  p.obstacles.forEach((o, i) => {
    if (!pointInPolygon(p.polygon, o.x, o.z)) bad.push(`障害物 ${i} が作物の外`);
    if (distanceToEdges(p.polygon, o.x, o.z) - o.r < MAP_RULES.spacing - 1e-6) bad.push(`障害物 ${i} が縁に近い`);
    p.obstacles.forEach((q, j) => {
      if (j > i && Math.sqrt((o.x - q.x) ** 2 + (o.z - q.z) ** 2) - o.r - q.r < MAP_RULES.spacing - 1e-6) bad.push(`障害物 ${i}・${j} が近い`);
    });
    if (Math.sqrt((o.x - p.truck.x) ** 2 + (o.z - p.truck.z) ** 2) < MAP_RULES.spacing) bad.push(`障害物 ${i} がトラックに近い`);
  });
  for (const pl of [p.truck, p.start]) {
    if (pointInPolygon(p.polygon, pl.x, pl.z)) bad.push('トラックか開始位置が作物の中');
    if (pl.x < -hl + 5 || pl.x > p.length + hl - 5 || pl.z < -hl + 5 || pl.z > p.width + hl - 5) bad.push('トラックか開始位置が柵に近い');
  }
  // 1 辺目（下の辺）は全長にわたって作物（開始の向きで刈り始められる）
  if (!pointInPolygon(p.polygon, 1, 1) || !pointInPolygon(p.polygon, p.length - 1, 1)) bad.push('下の辺が欠けている');
  return bad;
}

/** シードと難易度から計画を作る。検査に通らなければシードに番号を付けて作り直し、10 回で駄目なら標準マップ */
export function planMap(seed: string, difficulty: Difficulty = 'normal'): MapPlan {
  for (let attempt = 0; attempt < MAP_RULES.maxAttempts; attempt++) {
    const p = draft(seed, difficulty, attempt);
    if (checkPlan(p).length === 0) return p;
  }
  return { ...standardPlan(seed, difficulty), fallback: true, attempt: MAP_RULES.maxAttempts };
}

// ------------------------------------------------------------ セルを作る

export function buildMap(p: MapPlan): GameMap {
  const hl = BALANCE.map.headland;
  const h = fnv1a(`${p.version}:${p.difficulty}:${p.seed}:${p.attempt}`);
  const yieldN = fractalNoise(h ^ 0x1234, [25, 12]);
  const heightN = fractalNoise(h ^ 0x5678, [18]);
  const inCrop = (X: number, Z: number) => pointInPolygon(p.polygon, X, Z);
  const inWater = (X: number, Z: number) => p.water.some((w) => inCircle(w, X, Z));
  const wheat = spec.crop.wheat;
  const sample = (X: number, Z: number): CellSample => {
    const crop = inCrop(X, Z) && !p.obstacles.some((o) => inCircle(o, X, Z, 0.5)) && !inWater(X, Z);
    let f = 1 + 0.25 * yieldN(X, Z);
    for (const s of p.hotspots) {
      const d2 = ((X - s.x) ** 2 + (Z - s.z) ** 2) / (s.r * s.r);
      if (d2 < 1) f += s.gain * (1 - d2) * (1 - d2);
    }
    const lod = p.lodged.find((l) => inCircle(l, X, Z));
    return { crop, height: wheat.height + 0.05 * heightN(X, Z), yieldFactor: Math.max(0.3, f), lodged: !!lod, lodgedDir: lod?.dir };
  };
  const field = new WheatField({
    length: p.length, width: p.width, cell: BALANCE.map.cell, cropHeight: wheat.height, yield: wheat.yield,
    heightNoise: 0, yieldNoise: 0, seed: h, sample, jitter: mulberry32(h ^ 0x9abc),
  });
  return {
    ...p,
    headland: hl,
    world: { x0: -hl, z0: -hl, x1: p.length + hl, z1: p.width + hl },
    inCrop,
    inWater,
    cropHeight: wheat.height,
    yield: wheat.yield,
    field,
  };
}

export function standardMap(seed = 'standard'): GameMap {
  return buildMap(standardPlan(seed));
}

export function generateMap(seed: string, difficulty: Difficulty = 'normal'): GameMap {
  return buildMap(planMap(seed, difficulty));
}

/** 今日のマップのシード（UTC の日付、G-R-13） */
export function dailySeed(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
