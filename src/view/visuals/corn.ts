/**
 * コーンヘッド（M5）。12 条・30 in。分草ポイント（スナウト）、ロウユニット（デッキプレート・スナッパーロール・
 * ギャザリングチェーン）、背板、トラフ、クロスオーガ。すべて collider の内側に収める。
 */
import { BoxGeometry, ExtrudeGeometry, Matrix4, Shape, Vector2, Vector3 } from 'three';
import { CONVEYING } from '../../model/conveying';
import { helixPoint } from '../../model/helix';
import type { PartDef } from '../../model/types';
import { spec } from '../../spec/spec';
import { VisualBuilder, v3 } from './builder';
import { range } from './body';

const ch = spec.cornHead;

export function cornBackVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'box') throw new Error(part.id);
  const [z0, z1] = range(part.shape.center[2], part.shape.size[2]);
  const [x0, x1] = ch.back.x;
  const [y0, y1] = ch.back.y;
  vb.boxRange([x0, x0 + 0.04], [y0, y1 - 0.1], [z0, z1], 'body');
  vb.cylinder(new Vector3(x0 + 0.06, y1 - 0.055, z0), new Vector3(x0 + 0.06, y1 - 0.055, z1), 0.055, 'body', 20);
  for (let z = z0 + 0.38; z < z1; z += ch.rowSpacing) vb.boxRange([x0 + 0.04, x1 - 0.01], [y0 + 0.05, y1 - 0.12], [z - 0.02, z + 0.02], 'frame');
}

export function cornTroughVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'box') throw new Error(part.id);
  const [z0, z1] = range(part.shape.center[2], part.shape.size[2]);
  const [x0, x1] = ch.trough.x;
  const [y0, y1] = ch.trough.y;
  vb.boxRange([x0, x1], [y0, y0 + 0.04], [z0, z1], 'frame');
  vb.boxRange([x1 - 0.04, x1], [y0, y1], [z0, z1], 'body');
}

/** クロスオーガ：左右のフライトが中央（フィーダの入口）へ寄せる。1 本の軸で +Z 回りに回るので、左右でフライトのねじれが逆。 */
export function cornAugerVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'cyl') throw new Error(part.id);
  const a = v3(part.shape.a);
  const b = v3(part.shape.b);
  const r = part.shape.radius;
  const u = b.clone().sub(a).normalize(); // +Z
  const c = a.clone().lerp(b, 0.5);
  const pitch = 0.4;
  vb.rig(
    { kind: 'spin', key: 'cornAuger', origin: c, axis: u, pitch: 2 * Math.PI, sign: CONVEYING.augerSign },
    (rv) => {
      rv.cylinder(a, b, 0.09, 'body', 20);
      const seg = new BoxGeometry(1, r - 0.1, 0.008);
      const ms: Matrix4[] = [];
      // 左半分（z < 0）は +Z（中央）へ、右半分は −Z（中央）へ送る：回るらせんなので進みは送る向きと逆（helix.ts）
      for (const [start, len, sendSign] of [[a, c.distanceTo(a) - 0.6, 1], [b, c.distanceTo(b) - 0.6, -1]] as const) {
        const adv = -sendSign * CONVEYING.augerSign * pitch; // 送る向き × 回転 から進みの符号を決める
        const n = Math.ceil((len / pitch) * 18);
        for (let i = 0; i < n; i++) {
          const th0 = (i / 18) * 2 * Math.PI;
          const th1 = ((i + 1) / 18) * 2 * Math.PI;
          // start から中央へ向かう向きに並べる（軸方向の位置は sendSign で決め、角度はらせんの式から）
          const s0 = (i / 18) * pitch;
          const s1 = ((i + 1) / 18) * pitch;
          const p0 = helixPoint(start.clone().addScaledVector(u, sendSign * s0), u, (r + 0.09) / 2, Math.sign(adv) * sendSign * th0, 0);
          const p1 = helixPoint(start.clone().addScaledVector(u, sendSign * s1), u, (r + 0.09) / 2, Math.sign(adv) * sendSign * th1, 0);
          const mid = p0.clone().lerp(p1, 0.5);
          const radial = mid.clone().sub(new Vector3(a.x, a.y, mid.z)).normalize(); // 軸（Z 方向）からの向き
          const x = p1.clone().sub(p0);
          const l = x.length();
          x.normalize();
          const zz = x.clone().cross(radial).normalize();
          const yy = zz.clone().cross(x).normalize();
          ms.push(new Matrix4().makeBasis(x, yy, zz).setPosition(mid).multiply(new Matrix4().makeScale(l, 1, 1)));
        }
      }
      rv.instances(seg, 'moving', ms);
      // 中央：フィーダへ押し込む指（パドル）
      for (let k = 0; k < 4; k++) {
        const p = helixPoint(c, u, (r + 0.09) / 2, (k * Math.PI) / 2, 0);
        const radial = p.clone().sub(c).normalize();
        rv.add(new BoxGeometry(0.9, r - 0.1, 0.02), 'moving', new Matrix4().makeBasis(u, radial, u.clone().cross(radial)).setPosition(p));
      }
    },
  );
}

/** 分草ポイント：上から見て先の尖った覆い（collider の傾いた箱のローカル座標で作る）。先端は注意色。 */
export function cornSnoutVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'box') throw new Error(part.id);
  const sh = part.shape;
  const [L, T, W] = sh.size;
  const m = new Matrix4().makeRotationZ(((sh.rotZ ?? 0) * Math.PI) / 180).setPosition(...sh.center);
  const plan = (len: number, half: number, nose: number) => {
    const shp = new Shape([
      new Vector2(-len / 2, -half),
      new Vector2(len / 2 - nose, -half),
      new Vector2(len / 2, 0),
      new Vector2(len / 2 - nose, half),
      new Vector2(-len / 2, half),
    ]);
    // XY の平面形を Z（厚み）へ押し出してから、厚みを Y に回す
    const g = new ExtrudeGeometry(shp, { depth: 1, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const body = plan(L, W / 2 - 0.005, 0.5);
  vb.add(body, 'body', m.clone().multiply(new Matrix4().makeTranslation(0, -T / 2, 0)).multiply(new Matrix4().makeScale(1, T * 0.7, 1)));
  const ridge = plan(L - 0.2, W / 4, 0.4);
  vb.add(ridge, 'body', m.clone().multiply(new Matrix4().makeTranslation(-0.1, T / 2 - T * 0.3, 0)).multiply(new Matrix4().makeScale(1, T * 0.3 - 0.002, 1)));
  const tip = plan(0.3, W / 2 - 0.02, 0.28);
  vb.add(tip, 'hazard', m.clone().multiply(new Matrix4().makeTranslation(L / 2 - 0.15, -T / 2 + 0.002, 0)).multiply(new Matrix4().makeScale(1, T * 0.7 + 0.001, 1)));
}

/** ロウユニット：デッキプレート 2 枚（間がストークの通り道）、スナッパーロール 2 本、ギャザリングチェーン（ラグ付き、後方へ）。 */
export function cornRowVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'box') throw new Error(part.id);
  const zc = part.shape.center[2];
  const [x0, x1] = ch.rowUnit.x;
  const [y0, y1] = ch.rowUnit.y;
  const hw = ch.rowUnit.halfWidth;
  // フレームとデッキプレート
  vb.boxRange([x0, x1], [y0, y0 + 0.06], [zc - hw, zc + hw], 'frame');
  for (const s of [-1, 1]) vb.boxRange([x0 + 0.05, x1 - 0.02], [y1 - 0.05, y1 - 0.035], [zc + s * 0.018, zc + s * (hw - 0.01)], 'steel');
  // スナッパーロール（デッキの下、前後方向）
  for (const s of [-1, 1]) vb.cylinder(new Vector3(x0 + 0.04, y0 + 0.11, zc + s * 0.04), new Vector3(x1 - 0.04, y0 + 0.11, zc + s * 0.04), 0.035, 'moving', 10);
  // ギャザリングチェーン：デッキの上をラグが後方へ（1.8 m/s）
  const pitch = 0.15;
  const lug = new BoxGeometry(0.03, 0.025, 0.05);
  const ms: Matrix4[] = [];
  for (const s of [-1, 1]) for (let x = x0 + 0.08; x < x1 - 0.08 - pitch; x += pitch) ms.push(new Matrix4().makeTranslation(x + pitch, y1 - 0.02, zc + s * 0.07));
  vb.rig({ kind: 'scroll', key: 'cornChain', dir: new Vector3(-1, 0, 0), pitch }, (rv) => rv.instances(lug, 'frame', ms));
}
