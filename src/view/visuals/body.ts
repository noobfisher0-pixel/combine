import { BoxGeometry, CylinderGeometry, Matrix4, Vector3 } from 'three';
import type { PartDef } from '../../model/types';
import { spec } from '../../spec/spec';
import { VisualBuilder, alongMatrix, v3 } from './builder';

const box = (p: PartDef) => {
  if (p.shape.kind !== 'box') throw new Error(p.id);
  return p.shape;
};
const range = (c: number, s: number) => [c - s / 2, c + s / 2] as const;

/** 側板：地の板＋扉の継ぎ目（暗色の細い帯）＋アクセントの帯。 */
export function panelVisual(part: PartDef, vb: VisualBuilder) {
  const sh = box(part);
  const [x0, x1] = range(sh.center[0], sh.size[0]);
  const [y0, y1] = range(sh.center[1], sh.size[1]);
  const [z0, z1] = range(sh.center[2], sh.size[2]);
  const outward = sh.center[2] < 0 ? -1 : 1;
  const zFace = outward < 0 ? z0 : z1;
  const zIn = zFace - outward * 0.004; // 表面の 4 mm 内側から外へ 4 mm 出す帯
  const zOut = zFace + outward * 0.004;
  if (part.id === 'panel.engineHood') {
    // フード：板と前後方向のリブ
    vb.boxRange([x0, x1], [y0, y0 + 0.04], [z0, z1], 'accent');
    for (let i = -4; i <= 4; i++) vb.boxRange([x0 + 0.1, x1 - 0.1], [y0 + 0.04, y1], [i * 0.25 - 0.02, i * 0.25 + 0.02], 'frame');
    return;
  }
  vb.boxRange([x0, x1], [y0, y1], [z0, z1], 'body');

  if (part.id.startsWith('panel.lower')) {
    for (const x of [0.2, -0.85, -1.9]) vb.boxRange([x - 0.008, x + 0.008], [y0 + 0.1, y1 - 0.25], [zIn, zOut], 'frame');
    vb.boxRange([x0 + 0.02, x1 - 0.02], [2.18, 2.26], [zIn, zOut], 'accent');
  } else if (part.id.startsWith('panel.rear')) {
    for (let i = 0; i < 6; i++) {
      const y = y0 + 0.25 + i * 0.12;
      vb.boxRange([x0 + 0.5, x1 - 0.4], [y, y + 0.04], [zIn, zOut], 'frame');
    }
    vb.boxRange([x0 + 0.02, x0 + 0.14], [y1 - 0.25, y1 - 0.12], [zIn, zOut], 'lamp');
  } else if (part.id.startsWith('panel.engine')) {
    if (outward < 0) {
      for (let i = 0; i < 7; i++) {
        const y = y0 + 0.2 + i * 0.1;
        vb.boxRange([x1 - 0.35, x1 - 1.35], [y, y + 0.035], [zIn, zOut], 'frame');
      }
    }
    vb.boxRange([x0 + 0.02, x1 - 0.02], [y1 - 0.06, y1 - 0.02], [zIn, zOut], 'accent');
  }
}

/** グレインタンク：側壁・前後壁・V 底・上縁。中は空にして断面で中が見えるようにする。 */
export function tankVisual(_part: PartDef, vb: VisualBuilder) {
  const tk = spec.tank;
  const [xf, xr] = tk.x;
  const [yb, yt] = tk.y;
  const hw = tk.halfWidth;
  const t = 0.04;
  const yv = yb + tk.vBottom.depth;
  const trough = tk.vBottom.troughWidth / 2;
  // 側壁（V 底の上から上縁まで）
  for (const s of [-1, 1]) vb.boxRange([xf, xr], [yv, yt], [s * hw, s * (hw - t)], 'body');
  // 前後壁（V 字の断面）
  const wall: Array<[number, number]> = [[-hw, yt], [-hw, yv], [-trough, yb], [trough, yb], [hw, yv], [hw, yt]];
  vb.extrudeZY(wall, xf - t, xf, 'body');
  vb.extrudeZY(wall, xr, xr + t, 'body');
  // V 底の斜面
  for (const s of [-1, 1]) {
    const slope: Array<[number, number]> = [[s * hw, yv], [s * trough, yb], [s * trough, yb + t], [s * (hw - t), yv]];
    vb.extrudeZY(s < 0 ? slope : [...slope].reverse(), xr, xf, 'body');
  }
  vb.boxRange([xf - t, xr + t], [yb, yb + t], [-trough, trough], 'body');
  // 上縁の補強（オフホワイト）
  for (const s of [-1, 1]) vb.boxRange([xf, xr], [yt - 0.06, yt], [s * (hw - 0.001), s * (hw - t - 0.02)], 'accent');
  for (const x of [xf, xr]) vb.boxRange([x, x + (x === xf ? -t - 0.02 : t + 0.02)], [yt - 0.06, yt], [-hw, hw], 'accent');
}

export function flapVisual(part: PartDef, vb: VisualBuilder) {
  const sh = box(part);
  vb.box(sh.center, sh.size, 'accent');
}

export function ladderVisual(part: PartDef, vb: VisualBuilder) {
  const sh = box(part);
  const rot = new Matrix4().makeRotationZ(((sh.rotZ ?? 0) * Math.PI) / 180).setPosition(...sh.center);
  const [len, wid, thick] = sh.size;
  // ローカル X = 昇降方向、Y = 横木の方向、Z = 厚み
  for (const s of [-1, 1]) vb.add(new BoxGeometry(len, 0.04, thick), 'frame', rot.clone().multiply(new Matrix4().makeTranslation(0, s * (wid / 2 - 0.02), 0)));
  for (let x = -len / 2 + 0.2; x < len / 2 - 0.1; x += 0.3) {
    vb.add(new BoxGeometry(0.035, wid - 0.06, thick * 0.6), 'steel', rot.clone().multiply(new Matrix4().makeTranslation(x, 0, 0)));
  }
}

export function mirrorVisual(part: PartDef, vb: VisualBuilder) {
  const sh = box(part);
  const [z0, z1] = range(sh.center[2], sh.size[2]);
  const [y0, y1] = range(sh.center[1], sh.size[1]);
  const outer = Math.abs(z0) > Math.abs(z1) ? z0 : z1;
  const inner = outer === z0 ? z1 : z0;
  const x = sh.center[0];
  // 腕と鏡
  vb.cylinder(new Vector3(x, y1 - 0.04, inner), new Vector3(x, y1 - 0.04, outer - Math.sign(outer) * 0.1), 0.012, 'frame', 10);
  vb.boxRange([x - 0.025, x + 0.025], [y0, y1], [outer, outer - Math.sign(outer) * 0.18], 'frame');
}

export function gpsVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'cyl') throw new Error(part.id);
  const a = v3(part.shape.a);
  const r = part.shape.radius;
  vb.cylinder(a, a.clone().add(new Vector3(0, 0.02, 0)), r, 'frame', 32);
  // 低いドーム（球を縦につぶす）
  const dome = new CylinderGeometry(r * 0.55, r * 0.95, 0.055, 32);
  vb.add(dome, 'accent', new Matrix4().makeTranslation(a.x, a.y + 0.02 + 0.0275, a.z));
}

export function exhaustVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'cyl') throw new Error(part.id);
  const a = v3(part.shape.a);
  const b = v3(part.shape.b);
  vb.cylinder(a, b.clone().add(new Vector3(0, -0.04, 0)), part.shape.radius * 0.8, 'frame', 20);
  vb.cylinder(b.clone().add(new Vector3(0, -0.04, 0)), b, part.shape.radius, 'frame', 20);
}

export function screenVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'cyl') throw new Error(part.id);
  const a = v3(part.shape.a);
  const b = v3(part.shape.b);
  const r = part.shape.radius;
  vb.cylinder(a, a.clone().lerp(b, 0.5), r, 'frame', 48);
  vb.lathe([[r * 0.92, 0.5], [r, 0.5], [r, 1], [r * 0.92, 1]].map(([rr, t]) => [rr, t * a.distanceTo(b)]) as Array<[number, number]>, a, b, 'steel', 48);
  const depth = a.distanceTo(b) * 0.5;
  const mid = a.clone().lerp(b, 0.75);
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI;
    const d = new Vector3(Math.cos(th), Math.sin(th), 0).multiplyScalar(r * 0.9);
    vb.add(new BoxGeometry(0.03, 2 * d.length(), depth), 'steel', alongMatrix(mid.clone().sub(d), mid.clone().add(d)));
  }
  vb.cylinder(a.clone().lerp(b, 0.5), b, 0.09, 'steel', 20);
}

/** フィーダハウス：本体（やや小さめ）＋側面のリブ。ローカル X = フィーダの軸方向。 */
export function feederVisual(part: PartDef, vb: VisualBuilder) {
  const sh = box(part);
  const m = new Matrix4().makeRotationZ(((sh.rotZ ?? 0) * Math.PI) / 180).setPosition(...sh.center);
  const [L, H, W] = sh.size;
  vb.add(new BoxGeometry(L, H - 0.02, W - 0.06), 'body', m);
  for (let i = 0; i < 4; i++) {
    const x = -L / 2 + 0.3 + i * ((L - 0.6) / 3);
    for (const s of [-1, 1]) vb.add(new BoxGeometry(0.06, H - 0.04, 0.03), 'frame', m.clone().multiply(new Matrix4().makeTranslation(x, 0, s * (W / 2 - 0.015))));
  }
  // 上面のアクセント帯
  vb.add(new BoxGeometry(L - 0.2, 0.01, W - 0.3), 'accent', m.clone().multiply(new Matrix4().makeTranslation(0, H / 2 - 0.005, 0)));
}

export function faceVisual(part: PartDef, vb: VisualBuilder) {
  const sh = box(part);
  const [x0, x1] = range(sh.center[0], sh.size[0]);
  const [y0, y1] = range(sh.center[1], sh.size[1]);
  const [z0, z1] = range(sh.center[2], sh.size[2]);
  vb.boxRange([x0, x1 - 0.04], [y0, y1], [z0, z1], 'frame');
  // 上部のサドル（ヘッダを掛けるフック）
  vb.boxRange([x1 - 0.04, x1], [y1 - 0.12, y1], [z0 + 0.1, z1 - 0.1], 'steel');
}

export { range };
