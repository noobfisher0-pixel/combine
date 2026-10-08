import { BoxGeometry, Matrix4, Vector3 } from 'three';
import type { PartDef } from '../../model/types';
import { spec } from '../../spec/spec';
import { VisualBuilder } from './builder';

/**
 * キャブ：床台・柱・前傾した前面ガラス・側面と後面のガラス・屋根（オフホワイト）・作業灯・座席。
 * すべて collider の箱（x −0.45〜1.55、y 2.40〜3.90、z ±0.94）の内側に置く。
 */
export function cabVisual(_part: PartDef, vb: VisualBuilder) {
  const c = spec.cab;
  const [xr, xf] = c.x;
  const [yb, yt] = c.y;
  const hw = c.halfWidth;
  const yFloor = yb + 0.15;
  const yRoof = yt - 0.17;
  const glassBottomFront = new Vector3(xf - 0.24, yFloor, 0);
  const glassTopFront = new Vector3(xf - 0.05, yRoof, 0);

  // 床台（下部の箱）
  vb.boxRange([xr + 0.03, xf - 0.2], [yb, yFloor], [-hw + 0.04, hw - 0.04], 'frame');
  // 屋根：ひさしのある板と、その上のふくらみ
  vb.boxRange([xr, xf], [yRoof, yRoof + 0.07], [-hw, hw], 'accent');
  vb.boxRange([xr + 0.08, xf - 0.12], [yRoof + 0.07, yt - 0.01], [-hw + 0.08, hw - 0.08], 'accent');
  // 作業灯（ひさしの前縁に 4 灯）
  for (const z of [-0.65, -0.25, 0.25, 0.65]) vb.boxRange([xf - 0.06, xf - 0.005], [yRoof + 0.01, yRoof + 0.06], [z - 0.09, z + 0.09], 'lamp');
  // ビーコン（屋根後方の左右）
  for (const z of [-0.7, 0.7]) vb.cylinder(new Vector3(xr + 0.2, yt - 0.01, z), new Vector3(xr + 0.2, yt - 0.11, z), 0.05, 'hazard', 16);

  // 柱：前は前傾、後ろは垂直
  const postT = 0.07;
  for (const s of [-1, 1]) {
    const z = s * (hw - 0.06);
    const a = glassBottomFront.clone().setZ(z);
    const b = glassTopFront.clone().setZ(z);
    const len = a.distanceTo(b);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    vb.add(new BoxGeometry(len, postT, postT), 'frame', new Matrix4().makeRotationZ(ang).setPosition(a.clone().add(b).multiplyScalar(0.5)));
    vb.boxRange([xr + 0.03, xr + 0.03 + postT], [yFloor, yRoof], [z - postT / 2, z + postT / 2], 'frame');
  }
  // 前面ガラス（前傾した 1 枚）
  {
    const a = glassBottomFront;
    const b = glassTopFront;
    const len = a.distanceTo(b);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    vb.add(new BoxGeometry(len, 0.015, 2 * (hw - 0.1)), 'glass', new Matrix4().makeRotationZ(ang).setPosition(a.clone().add(b).multiplyScalar(0.5)), false);
  }
  // 側面ガラス（前が斜めの台形）
  for (const s of [-1, 1]) {
    const z0 = s * (hw - 0.075);
    const z1 = s * (hw - 0.06);
    vb.extrudeXY(
      [[xr + 0.1, yFloor + 0.02], [glassBottomFront.x - 0.03, yFloor + 0.02], [glassTopFront.x - 0.05, yRoof - 0.02], [xr + 0.1, yRoof - 0.02]],
      Math.min(z0, z1), Math.max(z0, z1), 'glass',
    );
  }
  // 後面：下半分は板、上半分はガラス
  vb.boxRange([xr + 0.03, xr + 0.06], [yFloor, yFloor + 0.55], [-hw + 0.1, hw - 0.1], 'body');
  vb.boxRange([xr + 0.04, xr + 0.055], [yFloor + 0.55, yRoof - 0.03], [-hw + 0.1, hw - 0.1], 'glass');

  // 座席・コンソール・ハンドル
  const sx = xr + 0.75;
  vb.boxRange([sx - 0.25, sx + 0.25], [yFloor + 0.35, yFloor + 0.45], [-0.25, 0.25], 'frame');
  vb.boxRange([sx - 0.3, sx - 0.22], [yFloor + 0.45, yFloor + 1.05], [-0.24, 0.24], 'frame');
  vb.boxRange([sx - 0.1, sx + 0.1], [yFloor, yFloor + 0.35], [-0.15, 0.15], 'steel');
  vb.boxRange([sx - 0.1, sx + 0.45], [yFloor + 0.45, yFloor + 0.62], [0.32, 0.5], 'frame');
  vb.cylinder(new Vector3(xf - 0.55, yFloor, 0), new Vector3(xf - 0.62, yFloor + 0.7, 0), 0.035, 'frame', 12);
  vb.cylinder(new Vector3(xf - 0.6, yFloor + 0.72, 0), new Vector3(xf - 0.65, yFloor + 0.76, 0), 0.17, 'frame', 24);
}
