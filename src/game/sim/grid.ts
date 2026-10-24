/**
 * カートが通れる場所の格子と経路探索（docs/game-design.md §4.4・§8.3）。
 *
 * - 1 m 格子。格子の中の立毛（刈れるセル）が 30 % 以上なら「作物で通れない」。孤立した少しの株は踏んで通る。
 * - 柵の外・障害物・コンバインの外形も通れない。
 * - カートの中心は、通れない格子から clearance（カートの半幅 1.6 m ＋ 余裕 0.6 m）以上離れていなければならない。
 *   距離はチェビシェフではなく 8 近傍の面取り距離（chamfer 3-4）で近似する。
 * - A*（8 近傍）で格子の中心を結ぶ経路を作り、見通しのきく点を飛ばして短くする。
 */
import { isStanding, toField, type MachinePlace, type Rect, type WheatField } from '../../field/field';
import type { GameMap } from '../map';

export const GRID = 1; // m
export const CROP_DENSITY = 0.3;
export const CLEARANCE = 2.2; // m

export class PassGrid {
  readonly nx: number;
  readonly nz: number;
  readonly x0: number;
  readonly z0: number;
  /** 0 = 通れる、1 = 作物、2 = 障害物・柵・コンバイン */
  readonly raw: Uint8Array;
  /** 通れない格子までの距離 [m]（面取り距離の近似） */
  readonly dist: Float32Array;

  constructor(private map: GameMap) {
    const w = map.world;
    this.x0 = w.x0;
    this.z0 = w.z0;
    this.nx = Math.ceil((w.x1 - w.x0) / GRID);
    this.nz = Math.ceil((w.z1 - w.z0) / GRID);
    this.raw = new Uint8Array(this.nx * this.nz);
    this.dist = new Float32Array(this.nx * this.nz);
  }

  idx(i: number, k: number) {
    return k * this.nx + i;
  }
  cellOf(X: number, Z: number): [number, number] {
    return [Math.floor((X - this.x0) / GRID), Math.floor((Z - this.z0) / GRID)];
  }
  center(i: number, k: number): [number, number] {
    return [this.x0 + (i + 0.5) * GRID, this.z0 + (k + 0.5) * GRID];
  }
  inside(i: number, k: number) {
    return i >= 0 && k >= 0 && i < this.nx && k < this.nz;
  }

  /** 立毛の密度（0〜1）。作物の範囲の外は 0 */
  density(X: number, Z: number, field: WheatField = this.map.field): number {
    const c = field.cell;
    const i0 = Math.floor(X / c);
    const k0 = Math.floor(Z / c);
    const n = Math.max(1, Math.round(GRID / c));
    let st = 0;
    for (let k = k0; k < k0 + n; k++) {
      for (let i = i0; i < i0 + n; i++) {
        if (i < 0 || k < 0 || i >= field.nx || k >= field.nz) continue;
        if (isStanding(field.state[k * field.nx + i])) st++;
      }
    }
    return st / (n * n);
  }

  /**
   * 格子を作り直す。ignoreCrop：強行呼び出し（作物を無視する）。
   * blockers：機体座標の長方形と機体の位置（コンバインの外形）
   */
  rebuild(ignoreCrop: boolean, blockers: Array<{ place: MachinePlace; rect: Rect }> = []) {
    const { nx, nz, raw, dist } = this;
    const field = this.map.field;
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const X = this.x0 + i * GRID;
        const Z = this.z0 + k * GRID;
        raw[k * nx + i] = !ignoreCrop && this.density(X, Z, field) >= CROP_DENSITY ? 1 : 0;
      }
    }
    // 柵：外周の 1 列
    for (let i = 0; i < nx; i++) raw[i] = raw[(nz - 1) * nx + i] = 2;
    for (let k = 0; k < nz; k++) raw[k * nx] = raw[k * nx + nx - 1] = 2;
    for (const o of this.map.obstacles) this.stamp(o.x, o.z, o.r);
    for (const b of blockers) this.stampRect(b.place, b.rect);
    // 面取り距離（3-4）：2 回の走査
    const INF = 1e9;
    for (let j = 0; j < raw.length; j++) dist[j] = raw[j] ? 0 : INF;
    const a = GRID;
    const d = GRID * 1.4;
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const j = k * nx + i;
        let v = dist[j];
        if (i > 0) v = Math.min(v, dist[j - 1] + a);
        if (k > 0) {
          v = Math.min(v, dist[j - nx] + a);
          if (i > 0) v = Math.min(v, dist[j - nx - 1] + d);
          if (i < nx - 1) v = Math.min(v, dist[j - nx + 1] + d);
        }
        dist[j] = v;
      }
    }
    for (let k = nz - 1; k >= 0; k--) {
      for (let i = nx - 1; i >= 0; i--) {
        const j = k * nx + i;
        let v = dist[j];
        if (i < nx - 1) v = Math.min(v, dist[j + 1] + a);
        if (k < nz - 1) {
          v = Math.min(v, dist[j + nx] + a);
          if (i < nx - 1) v = Math.min(v, dist[j + nx + 1] + d);
          if (i > 0) v = Math.min(v, dist[j + nx - 1] + d);
        }
        dist[j] = v;
      }
    }
  }

  private stamp(X: number, Z: number, r: number) {
    const [i0, k0] = this.cellOf(X - r, Z - r);
    const [i1, k1] = this.cellOf(X + r, Z + r);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) if (this.inside(i, k)) this.raw[this.idx(i, k)] = 2;
  }

  private stampRect(pl: MachinePlace, r: Rect) {
    const pts = [toField(pl, r.x0, r.z0), toField(pl, r.x1, r.z0), toField(pl, r.x1, r.z1), toField(pl, r.x0, r.z1)];
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const [i0, k0] = this.cellOf(Math.min(...xs), Math.min(...zs));
    const [i1, k1] = this.cellOf(Math.max(...xs), Math.max(...zs));
    const c = Math.cos(pl.psi);
    const s = Math.sin(pl.psi);
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        if (!this.inside(i, k)) continue;
        const [X, Z] = this.center(i, k);
        const dx = X - pl.x;
        const dz = Z - pl.z;
        const mx = c * dx - s * dz;
        const mz = s * dx + c * dz;
        if (mx >= r.x0 - 0.5 && mx <= r.x1 + 0.5 && mz >= r.z0 - 0.5 && mz <= r.z1 + 0.5) this.raw[this.idx(i, k)] = 2;
      }
    }
  }

  /** カートの中心を置けるか */
  free(i: number, k: number): boolean {
    return this.inside(i, k) && this.dist[this.idx(i, k)] >= CLEARANCE - 1e-6;
  }

  /** (X, Z) にいちばん近い、置ける格子（なければ null） */
  nearestFree(X: number, Z: number, maxR = 40): [number, number] | null {
    const [ci, ck] = this.cellOf(X, Z);
    for (let r = 0; r <= maxR; r++) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (let k = ck - r; k <= ck + r; k++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(k - ck)) !== r || !this.free(i, k)) continue;
          const d = (i - ci) ** 2 + (k - ck) ** 2;
          if (d < bd) {
            bd = d;
            best = [i, k];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * A*：from（今いる場所、置けなくてもよい）から to（置ける格子）へ。経路の点（圃場座標）を返す。見つからなければ null
   */
  findPath(from: [number, number], to: [number, number]): Array<[number, number]> | null {
    const { nx, nz } = this;
    const [si, sk] = this.cellOf(from[0], from[1]);
    const [ti, tk] = to;
    if (!this.inside(si, sk) || !this.free(ti, tk)) return null;
    const n = nx * nz;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const s = this.idx(si, sk);
    const t = this.idx(ti, tk);
    const h = (j: number) => {
      const i = j % nx;
      const k = (j - i) / nx;
      const dx = Math.abs(i - ti);
      const dz = Math.abs(k - tk);
      return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * GRID;
    };
    g[s] = 0;
    heap.push(s, h(s));
    let found = false;
    while (heap.size > 0) {
      const j = heap.pop();
      if (closed[j]) continue;
      closed[j] = 1;
      if (j === t) {
        found = true;
        break;
      }
      const i = j % nx;
      const k = (j - i) / nx;
      // 出発点が置けない場所（作物のそばなど）でも、置ける格子へ抜けられるようにする
      const startArea = this.dist[j] < CLEARANCE && g[j] < 6;
      for (let dk = -1; dk <= 1; dk++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dk) continue;
          const ii = i + di;
          const kk = k + dk;
          if (!this.inside(ii, kk)) continue;
          const jj = this.idx(ii, kk);
          if (closed[jj]) continue;
          if (!this.free(ii, kk) && !(startArea && this.raw[jj] !== 2)) continue;
          const ng = g[j] + (di && dk ? 1.414 : 1) * GRID;
          if (ng < g[jj]) {
            g[jj] = ng;
            came[jj] = j;
            heap.push(jj, ng + h(jj));
          }
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let j = t; j !== -1; j = came[j]) cells.push(j);
    cells.reverse();
    const pts = cells.map((j) => this.center(j % nx, Math.floor(j / nx)));
    return this.simplify([from, ...pts.slice(1)]);
  }

  /** 見通しのきく点を飛ばす（間の格子がすべて置けるなら直線で結ぶ） */
  private simplify(pts: Array<[number, number]>): Array<[number, number]> {
    if (pts.length <= 2) return pts;
    const out: Array<[number, number]> = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !this.lineFree(pts[a], pts[b], a === 0)) b--;
      out.push(pts[b]);
      a = b;
    }
    return out;
  }

  private lineFree(p: [number, number], q: [number, number], fromStart: boolean): boolean {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n = Math.ceil(len / (GRID * 0.5));
    for (let s = 1; s < n; s++) {
      const t = s / n;
      const [i, k] = this.cellOf(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t);
      if (fromStart && t * len < 6) continue;
      if (!this.free(i, k)) return false;
    }
    return true;
  }
}

/** 二分ヒープ（優先度の小さい順） */
class MinHeap {
  private keys: number[] = [];
  private pri: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(k: number, p: number) {
    const keys = this.keys;
    const pri = this.pri;
    let i = keys.length;
    keys.push(k);
    pri.push(p);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (pri[par] <= p) break;
      keys[i] = keys[par];
      pri[i] = pri[par];
      i = par;
    }
    keys[i] = k;
    pri[i] = p;
  }
  pop(): number {
    const keys = this.keys;
    const pri = this.pri;
    const top = keys[0];
    const k = keys.pop()!;
    const p = pri.pop()!;
    if (keys.length > 0) {
      let i = 0;
      const n = keys.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= p) break;
        keys[i] = keys[c];
        pri[i] = pri[c];
        i = c;
      }
      keys[i] = k;
      pri[i] = p;
    }
    return top;
  }
}
