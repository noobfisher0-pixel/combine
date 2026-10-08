import { BoxGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import type { PartDef } from '../../model/types';
import { spec } from '../../spec/spec';
import { VisualBuilder, v3 } from './builder';

/**
 * タイヤ（R1W 相当の V 字ラグ）とリム。軸は collider の a（内側）→ b（外側）。
 * ラグ先端が collider の半径に一致する。
 */
export function wheelVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'cyl') throw new Error(part.id);
  const w = part.id.startsWith('wheel.front') ? spec.wheels.front : spec.wheels.rear;
  const a = v3(part.shape.a);
  const b = v3(part.shape.b);
  const R = part.shape.radius;
  const hw = w.width / 2 - 0.008;
  const rIn = w.rimRadius;
  // ラグは平らな箱なので、接線方向の端が collider の円からはみ出さない高さに抑える
  const ang = (32 * Math.PI) / 180;
  const t = 0.075;
  const L = (hw * 0.92 - (t / 2) * Math.sin(ang)) / Math.cos(ang);
  const e = (L * Math.sin(ang) + t * Math.cos(ang)) / 2;
  const lugTop = Math.sqrt(R * R - e * e);
  const lugH = R * 0.04;
  const rC = lugTop - lugH; // ラグを除いた外径

  // タイヤ断面（半径, 軸方向）。a を 0、b を w.width とする座標で書いてから中央に寄せる
  const c = w.width / 2;
  const tire: Array<[number, number]> = [
    [rIn, c - hw * 0.86],
    [rIn + 0.07, c - hw],
    [rC - 0.16, c - hw],
    [rC - 0.06, c - hw * 0.94],
    [rC - 0.01, c - hw * 0.8],
    [rC, c - hw * 0.55],
    [rC, c + hw * 0.55],
    [rC - 0.01, c + hw * 0.8],
    [rC - 0.06, c + hw * 0.94],
    [rC - 0.16, c + hw],
    [rIn + 0.07, c + hw],
    [rIn, c + hw * 0.86],
  ];
  vb.lathe(tire.reverse(), a, b, 'rubber', 64);

  // リム：外周の帯、ディッシュ（外側寄り）、ハブ
  vb.lathe(
    [
      [rIn - 0.04, c - hw * 0.84],
      [rIn, c - hw * 0.84],
      [rIn, c + hw * 0.84],
      [rIn - 0.04, c + hw * 0.84],
    ].reverse() as Array<[number, number]>,
    a, b, 'rim', 48,
  );
  vb.lathe(
    [
      [0.14, c + hw * 0.2],
      [rIn - 0.035, c + hw * 0.2],
      [rIn - 0.035, c + hw * 0.27],
      [0.14, c + hw * 0.27],
    ].reverse() as Array<[number, number]>,
    a, b, 'rim', 40,
  );
  const dir = b.clone().sub(a).normalize();
  vb.cylinder(a.clone().addScaledVector(dir, c + hw * 0.1), a.clone().addScaledVector(dir, c + hw * 0.55), 0.15, 'steel', 24);

  // ラグ：左右半分に互い違いの V 字。ローカル座標は Y = 車軸、XZ = 半径方向
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  const toWorld = new Matrix4().compose(a.clone().addScaledVector(dir, c), q, new Vector3(1, 1, 1));
  const lug = new BoxGeometry(lugH, L, t);
  const mats: Matrix4[] = [];
  const N = w.lugs;
  for (let i = 0; i < N; i++) {
    for (const side of [-1, 1] as const) {
      const theta = ((i + (side > 0 ? 0.5 : 0)) / N) * Math.PI * 2;
      const axial = side * (hw * 0.92 - (L * Math.cos(ang) + t * Math.sin(ang)) / 2);
      const rot = new Matrix4().makeRotationY(-theta).multiply(new Matrix4().makeRotationX(side * ang));
      const pos = new Vector3((rC + lugH / 2) * Math.cos(theta), axial, (rC + lugH / 2) * Math.sin(theta));
      mats.push(toWorld.clone().multiply(new Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(rot)));
    }
  }
  vb.instances(lug, 'rubber', mats);
}
