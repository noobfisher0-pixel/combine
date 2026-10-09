/**
 * 小麦の圃場（design §16.5、M6）。0.25 m 角のセルごとに草丈・穀粒の量・状態を持つ。
 *
 * 圃場座標：X ＝ 長辺（0〜length）、Z ＝ 短辺（0〜width）、Y 上。three と同じ右手系。
 * 機体の位置は前車軸中心 (x, z) と向き psi（Y 軸回り）。機体座標 → 圃場座標は
 *   X = x + cos(psi)·mx + sin(psi)·mz,  Z = z − sin(psi)·mx + cos(psi)·mz
 * （psi = 0 で機体の前 = +X、右 = +Z）。
 */
import { spec } from '../spec/spec';

/** セルの状態 */
export const STANDING = 0;
export const CUT = 1;
export const FLAT = 2; // 機体に押し倒された（刈れない）

export interface FieldOptions {
  length: number;
  width: number;
  cell: number;
  cropHeight: number; // m（平均）
  yield: number; // t/ha（平均）
  heightNoise: number;
  yieldNoise: number;
  seed: number;
}

export function defaultFieldOptions(): FieldOptions {
  const f = spec.field;
  const w = spec.crop.wheat;
  return { length: f.length, width: f.width, cell: f.cell, cropHeight: w.height, yield: w.yield, heightNoise: f.heightNoise, yieldNoise: f.yieldNoise, seed: 7 };
}

export interface MachinePlace {
  x: number;
  z: number;
  psi: number;
}

/** 機体座標の点 (mx, mz) を圃場座標へ */
export function toField(m: MachinePlace, mx: number, mz: number): [number, number] {
  const c = Math.cos(m.psi);
  const s = Math.sin(m.psi);
  return [m.x + c * mx + s * mz, m.z - s * mx + c * mz];
}

/** 圃場座標の点を機体座標へ */
export function toMachine(m: MachinePlace, X: number, Z: number): [number, number] {
  const c = Math.cos(m.psi);
  const s = Math.sin(m.psi);
  const dx = X - m.x;
  const dz = Z - m.z;
  return [c * dx - s * dz, s * dx + c * dz];
}

/** 機体座標の長方形（x0 < x1, z0 < z1） */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** なめらかな 2 次元のゆらぎ（波長 6〜25 m の正弦の和、およそ −1〜1） */
function smoothNoise(r: () => number): (X: number, Z: number) => number {
  const waves = Array.from({ length: 5 }, () => {
    const lambda = 6 + r() * 19;
    const a = r() * Math.PI * 2;
    return { kx: (Math.cos(a) * 2 * Math.PI) / lambda, kz: (Math.sin(a) * 2 * Math.PI) / lambda, ph: r() * Math.PI * 2 };
  });
  const norm = 1 / Math.sqrt(waves.length / 2);
  return (X, Z) => waves.reduce((s, w) => s + Math.sin(w.kx * X + w.kz * Z + w.ph), 0) * norm * 0.5;
}

export class WheatField {
  readonly nx: number;
  readonly nz: number;
  readonly cell: number;
  readonly length: number;
  readonly width: number;
  /** 草丈（地面から穂先、m） */
  readonly height: Float32Array;
  /** 穀粒の量（kg/セル） */
  readonly grain: Float32Array;
  readonly state: Uint8Array;
  /** 刈り株の高さ（刈ったときの刈刃の高さ、m） */
  readonly stubble: Float32Array;
  /** 倒れた向き（圃場座標の角度、rad） */
  readonly flatDir: Float32Array;
  /** 刈った行程の番号（1〜、重なりの判定用） */
  readonly cutTag: Uint8Array;
  /** 状態が変わるたびに増える（描画の更新判定） */
  version = 0;
  readonly totalGrain: number;
  readonly opts: FieldOptions;

  constructor(o: FieldOptions = defaultFieldOptions()) {
    this.opts = o;
    this.cell = o.cell;
    this.length = o.length;
    this.width = o.width;
    this.nx = Math.round(o.length / o.cell);
    this.nz = Math.round(o.width / o.cell);
    const n = this.nx * this.nz;
    this.height = new Float32Array(n);
    this.grain = new Float32Array(n);
    this.state = new Uint8Array(n);
    this.stubble = new Float32Array(n);
    this.flatDir = new Float32Array(n);
    this.cutTag = new Uint8Array(n);
    const r = rng(o.seed);
    const hN = smoothNoise(r);
    const yN = smoothNoise(r);
    const perCell = (o.yield * 0.1) * o.cell * o.cell; // t/ha → kg/m²
    let sum = 0;
    for (let k = 0; k < this.nz; k++) {
      for (let i = 0; i < this.nx; i++) {
        const [X, Z] = this.center(i, k);
        const idx = k * this.nx + i;
        this.height[idx] = o.cropHeight + o.heightNoise * hN(X, Z) + (r() - 0.5) * 0.03;
        const g = perCell * (1 + o.yieldNoise * yN(X, Z) * 2) * (0.9 + r() * 0.2);
        this.grain[idx] = g;
        sum += g;
      }
    }
    // 圃場全体の平均が指定の収量になるようにそろえる
    const scale = (perCell * n) / sum;
    for (let j = 0; j < n; j++) this.grain[j] *= scale;
    this.totalGrain = perCell * n;
  }

  center(i: number, k: number): [number, number] {
    return [(i + 0.5) * this.cell, (k + 0.5) * this.cell];
  }

  counts(): { standing: number; cut: number; flat: number } {
    let standing = 0;
    let cut = 0;
    let flat = 0;
    for (const s of this.state) {
      if (s === STANDING) standing++;
      else if (s === CUT) cut++;
      else flat++;
    }
    return { standing, cut, flat };
  }

  /** 圃場座標の範囲にかかるセルの添字の範囲（はみ出しは切る） */
  private range(minX: number, maxX: number, minZ: number, maxZ: number) {
    const c = this.cell;
    return {
      i0: Math.max(0, Math.floor(minX / c - 0.5)),
      i1: Math.min(this.nx - 1, Math.ceil(maxX / c - 0.5)),
      k0: Math.max(0, Math.floor(minZ / c - 0.5)),
      k1: Math.min(this.nz - 1, Math.ceil(maxZ / c - 0.5)),
    };
  }

  /**
   * 刈刃の線が (a0,b0) から (a1,b1) へ動いたときに通った四角形の中のセルを刈る。
   * canCut(idx) が false のセルは刈らずに onMiss(idx) を呼ぶ（穂に届かない・押し倒すなどの判定は呼び出し側）。
   * tag は行程の番号。戻り値：刈った穀粒 [kg]、刈ったセル数、ほかの行程ですでに刈ってあったセル数（重なり）。
   */
  sweepCut(
    a0: [number, number], b0: [number, number], a1: [number, number], b1: [number, number],
    canCut: (idx: number) => boolean, stubble: number, tag: number, onMiss?: (idx: number) => void,
  ): { grain: number; cells: number; overlap: number } {
    const poly = [a0, b0, b1, a1];
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    const { i0, i1, k0, k1 } = this.range(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
    let grain = 0;
    let cells = 0;
    let overlap = 0;
    if (i0 > i1 || k0 > k1) return { grain, cells, overlap };
    // 四角形の向き（頂点の並びの符号）
    let area = 0;
    for (let j = 0; j < 4; j++) {
      const p = poly[j];
      const q = poly[(j + 1) % 4];
      area += p[0] * q[1] - q[0] * p[1];
    }
    if (Math.abs(area) < 1e-9) return { grain, cells, overlap };
    const sg = Math.sign(area);
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        const X = (i + 0.5) * this.cell;
        const Z = (k + 0.5) * this.cell;
        let inside = true;
        for (let j = 0; j < 4 && inside; j++) {
          const p = poly[j];
          const q = poly[(j + 1) % 4];
          const cr = (q[0] - p[0]) * (Z - p[1]) - (q[1] - p[1]) * (X - p[0]);
          if (cr * sg < 0) inside = false;
        }
        if (!inside) continue;
        const idx = k * this.nx + i;
        const st = this.state[idx];
        if (st === CUT) {
          if (this.cutTag[idx] !== tag) overlap++;
          continue;
        }
        if (st !== STANDING) continue;
        if (!canCut(idx)) {
          onMiss?.(idx);
          continue;
        }
        this.state[idx] = CUT;
        this.stubble[idx] = stubble;
        this.cutTag[idx] = tag;
        grain += this.grain[idx];
        cells++;
      }
    }
    if (cells > 0) this.version++;
    return { grain, cells, overlap };
  }

  /** 機体座標の長方形の下にあるセルを列挙する（圃場の外は除く） */
  forEachUnder(m: MachinePlace, r: Rect, fn: (idx: number) => void) {
    const corners = [toField(m, r.x0, r.z0), toField(m, r.x1, r.z0), toField(m, r.x1, r.z1), toField(m, r.x0, r.z1)];
    const xs = corners.map((p) => p[0]);
    const zs = corners.map((p) => p[1]);
    if (Math.max(...xs) < 0 || Math.min(...xs) > this.length || Math.max(...zs) < 0 || Math.min(...zs) > this.width) return;
    const { i0, i1, k0, k1 } = this.range(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        const [mx, mz] = toMachine(m, (i + 0.5) * this.cell, (k + 0.5) * this.cell);
        if (mx < r.x0 || mx > r.x1 || mz < r.z0 || mz > r.z1) continue;
        fn(k * this.nx + i);
      }
    }
  }

  /** 立っている作物を押し倒す（下端の高さ bottom が草丈より低い部品の下だけ）。倒したセル数を返す */
  flattenUnder(m: MachinePlace, r: Rect, bottom: number, dir: number): number {
    let n = 0;
    this.forEachUnder(m, r, (idx) => {
      if (this.state[idx] !== STANDING || this.height[idx] <= bottom) return;
      this.state[idx] = FLAT;
      this.flatDir[idx] = dir;
      n++;
    });
    if (n > 0) this.version++;
    return n;
  }

  /** 長方形の下に立っている作物があるか */
  anyStanding(m: MachinePlace, r: Rect): boolean {
    let found = false;
    this.forEachUnder(m, r, (idx) => {
      if (this.state[idx] === STANDING) found = true;
    });
    return found;
  }

  /** Z の範囲 [z0, z1]・X の範囲 [x0, x1] の中に残っている（立っている）セルの数と、残っている Z の帯 */
  uncutIn(x0: number, x1: number, z0: number, z1: number): { count: number; strips: Array<[number, number]> } {
    const { i0, i1, k0, k1 } = this.range(x0, x1, z0, z1);
    let count = 0;
    const strips: Array<[number, number]> = [];
    for (let k = k0; k <= k1; k++) {
      const Z = (k + 0.5) * this.cell;
      if (Z < z0 || Z > z1) continue;
      let row = 0;
      for (let i = i0; i <= i1; i++) {
        const X = (i + 0.5) * this.cell;
        if (X < x0 || X > x1) continue;
        if (this.state[k * this.nx + i] === STANDING) row++;
      }
      count += row;
      if (row > 0) {
        const last = strips[strips.length - 1];
        const lo = k * this.cell;
        if (last && Math.abs(last[1] - lo) < 1e-6) last[1] = lo + this.cell;
        else strips.push([lo, lo + this.cell]);
      }
    }
    return { count, strips };
  }
}
