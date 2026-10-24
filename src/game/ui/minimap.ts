/**
 * ミニマップ（docs/game-design.md §7.1）。2D canvas に、北（−Z）を上・+X を右にして描く。
 * - 畑：立毛は収量で濃さを変える（濃いほど収量が高い）。刈り跡・押し倒し・倒れた小麦・作物なしで色を分ける。
 * - 障害物・水たまり・トラック・カート（経路と待つ場所）・コンバイン（刈幅の線）・ガイドライン。
 * - カートの通り道をふさいでいる格子を赤で出す（G-R-06）。
 * 畑の画像は重いので 0.3 秒に 1 回だけ作り直す。
 */
import { CUT, FLAT, LODGED, NONE, STANDING, toField } from '../../field/field';
import type { Guide } from '../guide';
import type { GameSim } from '../sim/game';
import { spec } from '../../spec/spec';

const COLORS = {
  headland: [104, 92, 64],
  standingLo: [150, 118, 52],
  standingHi: [92, 66, 22],
  cut: [176, 158, 112],
  flat: [196, 120, 92],
  lodged: [170, 108, 40],
  none: [104, 92, 64],
} as const;

export class Minimap {
  private img: ImageData | null = null;
  private bmp: HTMLCanvasElement = document.createElement('canvas');
  private lastBuild = -Infinity;
  private meanGrain = 1;

  constructor(private canvas: HTMLCanvasElement) {}

  /** 畑のセルの画像（1 セル ＝ 1 画素）を作る */
  private build(sim: GameSim) {
    const f = sim.map.field;
    if (!this.img || this.img.width !== f.nx || this.img.height !== f.nz) {
      this.img = new ImageData(f.nx, f.nz);
      this.bmp.width = f.nx;
      this.bmp.height = f.nz;
      let s = 0;
      let n = 0;
      for (let j = 0; j < f.grain.length; j++) if (f.state[j] !== NONE) { s += f.grain[j]; n++; }
      this.meanGrain = n ? s / n : 1;
    }
    const d = this.img.data;
    for (let k = 0; k < f.nz; k++) {
      for (let i = 0; i < f.nx; i++) {
        const j = k * f.nx + i;
        const st = f.state[j];
        let c: readonly number[];
        if (st === STANDING || st === LODGED) {
          // 収量の濃さ：平均の 0.7 倍 → 薄い、1.4 倍 → 濃い
          const t = Math.max(0, Math.min(1, (f.grain[j] / this.meanGrain - 0.7) / 0.7));
          const lo = st === LODGED ? COLORS.lodged : COLORS.standingLo;
          c = lo.map((v, q) => v + (COLORS.standingHi[q] - v) * t);
        } else if (st === CUT) c = COLORS.cut;
        else if (st === FLAT) c = COLORS.flat;
        else c = COLORS.none;
        const o = j * 4;
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = 255;
      }
    }
    this.bmp.getContext('2d')!.putImageData(this.img, 0, 0);
  }

  draw(sim: GameSim, now: number, guide: Guide | null, blockers: Array<[number, number]>) {
    const cv = this.canvas;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    if (now - this.lastBuild > 300) {
      this.lastBuild = now;
      this.build(sim);
    }
    const m = sim.map;
    const w = m.world;
    const W = cv.width;
    const H = cv.height;
    const s = Math.min(W / (w.x1 - w.x0), H / (w.z1 - w.z0));
    const ox = (W - (w.x1 - w.x0) * s) / 2 - w.x0 * s;
    const oz = (H - (w.z1 - w.z0) * s) / 2 - w.z0 * s;
    const P = (x: number, z: number): [number, number] => [ox + x * s, oz + z * s];
    ctx.clearRect(0, 0, W, H);
    // 枕地（柵の内側）
    ctx.fillStyle = `rgb(${COLORS.headland.join(',')})`;
    const [wx, wz] = P(w.x0, w.z0);
    ctx.fillRect(wx, wz, (w.x1 - w.x0) * s, (w.z1 - w.z0) * s);
    ctx.strokeStyle = '#8a7a63';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx + 0.5, wz + 0.5, (w.x1 - w.x0) * s - 1, (w.z1 - w.z0) * s - 1);
    // 畑
    ctx.imageSmoothingEnabled = false;
    const [fx, fz] = P(0, 0);
    ctx.drawImage(this.bmp, fx, fz, m.field.nx * m.field.cell * s, m.field.nz * m.field.cell * s);
    // 水たまり・障害物
    ctx.fillStyle = '#4d6b78';
    for (const wv of m.water) {
      ctx.beginPath();
      ctx.arc(...P(wv.x, wv.z), wv.r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1d2321';
    for (const o of m.obstacles) {
      ctx.beginPath();
      ctx.arc(...P(o.x, o.z), Math.max(2, o.r * s), 0, Math.PI * 2);
      ctx.fill();
    }
    // 通り道をふさいでいる格子（赤）
    ctx.fillStyle = 'rgba(240,128,107,0.9)';
    for (const [x, z] of blockers) {
      const [px, pz] = P(x - 0.5, z - 0.5);
      ctx.fillRect(px, pz, Math.max(2, s), Math.max(2, s));
    }
    // ガイドライン（点線）
    if (guide) {
      ctx.strokeStyle = 'rgba(232,238,236,0.85)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(...P(...guide.a));
      ctx.lineTo(...P(...guide.b));
      for (const q of guide.loop) ctx.lineTo(...P(...q));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // トラック
    const t = m.truck;
    this.box(ctx, P, t, -6.5, 8.8, -1.25, 1.25, '#b8bcb6');
    // カートの経路・待つ場所・カート
    const cart = sim.cart;
    if (cart.path && (cart.state === 'toCombine' || cart.state === 'waiting' || cart.state === 'toTruck')) {
      ctx.strokeStyle = '#E0AE4E';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(...P(cart.x, cart.z));
      for (const q of cart.path) ctx.lineTo(...P(...q));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (cart.state === 'waiting' && cart.waitPoint) {
      ctx.fillStyle = '#E0AE4E';
      const [px, pz] = P(...cart.waitPoint);
      ctx.beginPath();
      ctx.moveTo(px, pz - 7);
      ctx.lineTo(px + 6, pz - 4);
      ctx.lineTo(px, pz - 1);
      ctx.fill();
    }
    this.box(ctx, P, cart.place, -3, 9, -1.6, 1.6, '#7f9aa8');
    // コンバイン（本体と刈幅の線）
    const pl = sim.place;
    this.box(ctx, P, pl, spec.body.rear, 3.2, -1.97, 1.97, '#5CB3AD');
    ctx.strokeStyle = sim.headerDown ? '#ffffff' : '#5CB3AD';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...P(...toField(pl, 5.3, -spec.header.width / 2)));
    ctx.lineTo(...P(...toField(pl, 5.3, spec.header.width / 2)));
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  /** 機体座標の長方形を、圃場の位置・向きで塗る */
  private box(ctx: CanvasRenderingContext2D, P: (x: number, z: number) => [number, number], pl: { x: number; z: number; psi: number }, x0: number, x1: number, z0: number, z1: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const;
    pts.forEach(([a, b], i) => {
      const [px, pz] = P(...toField(pl, a, b));
      if (i === 0) ctx.moveTo(px, pz);
      else ctx.lineTo(px, pz);
    });
    ctx.closePath();
    ctx.fill();
  }
}
