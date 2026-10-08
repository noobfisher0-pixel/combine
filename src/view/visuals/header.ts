import { BoxGeometry, CylinderGeometry, Matrix4, Vector3 } from 'three';
import type { PartDef } from '../../model/types';
import { spec } from '../../spec/spec';
import { VisualBuilder, alongMatrix, v3 } from './builder';
import { range } from './body';

const h = spec.header;

export function headerBackVisual(_part: PartDef, vb: VisualBuilder) {
  const [x0, x1] = h.backplate.x;
  const [y0, y1] = h.backplate.y;
  const hw = h.width / 2;
  vb.boxRange([x0, x0 + 0.04], [y0, y1 - 0.12], [-hw, hw], 'body');
  // 上端の横パイプ
  vb.cylinder(new Vector3(x0 + 0.1, y1 - 0.065, -hw), new Vector3(x0 + 0.1, y1 - 0.065, hw), 0.06, 'body', 24);
  // 背板の縦リブ
  for (let z = -hw + 0.4; z < hw; z += 1.2) vb.boxRange([x0 + 0.04, x1 - 0.02], [y0 + 0.05, y1 - 0.13], [z - 0.025, z + 0.025], 'frame');
  // 中央の開口（フィードドラムへの入口）の縁取り
  vb.boxRange([x0 + 0.04, x0 + 0.07], [y0 + 0.15, y0 + 0.75], [-1.0, -0.94], 'accent');
  vb.boxRange([x0 + 0.04, x0 + 0.07], [y0 + 0.15, y0 + 0.75], [0.94, 1.0], 'accent');
}

/** デッキ：骨組み＋左右のドレーパーベルト＋中央ベルト＋白いスラット。 */
export function headerDeckVisual(_part: PartDef, vb: VisualBuilder) {
  const [x0, x1] = h.deck.x;
  const [y0, y1] = h.deck.y;
  const hw = h.width / 2;
  vb.boxRange([x0, x1], [y0, y0 + 0.07], [-hw, hw], 'frame');
  const yb = y0 + 0.07;
  const beltTop = yb + 0.045;
  // 左右のベルト（中央 ±1.0 から端まで）、中央ベルト
  for (const s of [-1, 1]) vb.boxRange([x0 + 0.08, x1 - 0.05], [yb, beltTop], [s * 1.02, s * (hw - 0.08)], 'rubber');
  vb.boxRange([x0 + 0.02, x1 - 0.4], [yb, beltTop], [-0.98, 0.98], 'rubber');
  // 白いスラット。左右のベルトは中央へ（z 方向）、中央ベルトは後方へ（−x 方向）流れる
  const slat = new BoxGeometry(x1 - x0 - 0.2, 0.012, 0.035);
  const sidePitch = 0.33;
  for (const s of [-1, 1]) {
    const mats: Matrix4[] = [];
    for (let z = 1.02 + sidePitch + 0.01; z < hw - 0.15; z += sidePitch) mats.push(new Matrix4().makeTranslation((x0 + x1) / 2 + 0.015, beltTop + 0.006, s * z));
    vb.rig({ kind: 'scroll', key: 'draperSide', dir: new Vector3(0, 0, -s), pitch: sidePitch }, (r) => r.instances(slat, 'accent', mats));
  }
  const cslat = new BoxGeometry(0.035, 0.012, 1.9);
  const centerPitch = 0.3;
  const cm: Matrix4[] = [];
  for (let x = x0 + 0.15 + centerPitch; x < x1 - 0.45; x += centerPitch) cm.push(new Matrix4().makeTranslation(x, beltTop + 0.006, 0));
  vb.rig({ kind: 'scroll', key: 'draperCenter', dir: new Vector3(-1, 0, 0), pitch: centerPitch }, (r) => r.instances(cslat, 'accent', cm));
  // デッキの上面の縁（ベルトの前の板）
  vb.boxRange([x1 - 0.05, x1], [y0 + 0.04, y1 - 0.03], [-hw, hw], 'frame');
}

/** カッターバー：バーとナイフガード（76 mm ピッチ）。 */
export function cutterbarVisual(_part: PartDef, vb: VisualBuilder) {
  const [x0, x1] = h.cutterbar.x;
  const [y0, y1] = h.cutterbar.y;
  const hw = h.width / 2;
  vb.boxRange([x0, x0 + 0.1], [y0 + 0.01, y1], [-hw, hw], 'frame');
  // ガード：前へ尖った三角柱（押し出し）をインスタンスで並べる
  const guard = new CylinderGeometry(0.0, 0.03, x1 - x0 - 0.1, 3);
  guard.rotateZ(-Math.PI / 2); // 先端を +X に
  const mats: Matrix4[] = [];
  const pitch = 0.0762;
  for (let z = -hw + pitch / 2; z < hw - pitch / 4; z += pitch) {
    mats.push(new Matrix4().makeTranslation(x0 + 0.1 + (x1 - x0 - 0.1) / 2, y0 + 0.03, z).multiply(new Matrix4().makeScale(1, 0.7, 1)));
  }
  vb.instances(guard, 'steel', mats);

  // ナイフ（左右 2 本、逆位相）。ガードの上を z 方向に ±38 mm 往復する
  const amp = 0.038;
  const section = new CylinderGeometry(0.0, 0.034, 0.12, 3);
  section.rotateZ(-Math.PI / 2);
  section.scale(1, 0.15, 1);
  const kx = x1 - 0.07;
  const ky = y0 + 0.052;
  for (const side of [-1, 1] as const) {
    const ks: Matrix4[] = [];
    for (let z = 0.06; z < hw - 0.05 - amp; z += pitch) ks.push(new Matrix4().makeTranslation(kx, ky, side * z));
    vb.rig(
      { kind: 'oscillate', key: 'knife', dir: new Vector3(0, 0, 1), amplitude: amp, phase: side > 0 ? Math.PI : 0, pitch },
      (r) => r.instances(section, 'steel', ks),
      (r) => r.box([kx, ky, side * (hw / 2)], [0.12, 0.008, hw - 0.12], 'blur', 0, false),
    );
  }
}

export function endShieldVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'box') throw new Error(part.id);
  const [z0, z1] = range(part.shape.center[2], part.shape.size[2]);
  const [x0, x1] = h.endShield.x;
  const [y0, y1] = h.endShield.y;
  // 横から見て、後ろが高く前へ下がる形
  vb.extrudeXY([[x0, y0], [x1, y0], [x1, y0 + 0.15], [x0 + 0.6, y1], [x0, y1]], z0, z1, 'body');
}

export function dividerVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'box') throw new Error(part.id);
  const [z0, z1] = range(part.shape.center[2], part.shape.size[2]);
  const [x0, x1] = h.divider.x;
  const [y0, y1] = h.divider.y;
  // 先の尖った分草板。先端は注意色
  vb.extrudeXY([[x0, y0], [x1 - 0.12, y0], [x1, y0 + 0.08], [x0 + 0.1, y1], [x0, y1]], z0, z1, 'body');
  vb.extrudeXY([[x1 - 0.14, y0 + 0.01], [x1 - 0.005, y0 + 0.08], [x1 - 0.14, y0 + 0.17]], z0 + 0.005, z1 - 0.005, 'hazard');
}

export function reelArmVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'box') throw new Error(part.id);
  const sh = part.shape;
  const m = new Matrix4().makeRotationZ(((sh.rotZ ?? 0) * Math.PI) / 180).setPosition(...sh.center);
  vb.add(new BoxGeometry(sh.size[0], sh.size[1] * 0.8, sh.size[2] * 0.8), 'body', m);
}

/** リール：中心パイプ・スパイダ・バット 6 本・タイン（インスタンス）。 */
export function reelVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'cyl') throw new Error(part.id);
  const a = v3(part.shape.a);
  const b = v3(part.shape.b);
  const R = part.shape.radius;
  const center = new Vector3(h.reel.x, h.reel.y, 0);
  vb.rig(
    { kind: 'spin', key: 'reel', origin: center, axis: b.clone().sub(a).normalize(), pitch: (2 * Math.PI) / 6 },
    (r) => reelBody(part, r),
    (r) => {
      r.cylinder(a, b, 0.06, 'frame', 20);
      r.cylinder(a.clone().setZ(a.z + 0.01), b.clone().setZ(b.z - 0.01), R - 0.01, 'blur', 32);
    },
  );
}

/** リール：中心パイプ・スパイダ・バット 6 本・タイン（インスタンス）。 */
function reelBody(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'cyl') throw new Error(part.id);
  const a = v3(part.shape.a);
  const b = v3(part.shape.b);
  const R = part.shape.radius;
  const c = new Vector3(h.reel.x, h.reel.y, 0);
  const bats = 6;
  const rBat = R - 0.075;
  vb.cylinder(a, b, 0.06, 'frame', 20);
  for (let i = 0; i < bats; i++) {
    const th = (i / bats) * Math.PI * 2;
    const off = new Vector3(Math.cos(th) * rBat, Math.sin(th) * rBat, 0);
    vb.cylinder(a.clone().add(off), b.clone().add(off), 0.025, 'accent', 10);
  }
  // スパイダ（約 1.5 m ごと）
  const zs: number[] = [];
  for (let i = 0; i <= 8; i++) zs.push(a.z + 0.02 + ((b.z - a.z - 0.04) * i) / 8);
  for (const z of zs) {
    for (let i = 0; i < bats; i++) {
      const th = (i / bats) * Math.PI * 2;
      const p0 = new Vector3(c.x, c.y, z);
      const p1 = new Vector3(c.x + Math.cos(th) * rBat, c.y + Math.sin(th) * rBat, z);
      vb.add(new BoxGeometry(0.03, rBat, 0.03), 'frame', alongMatrix(p0, p1));
    }
  }
  // タイン：バットから外へ、少し後ろに寝かせる。間隔 0.10 m
  const tine = new CylinderGeometry(0.006, 0.006, R - rBat, 5);
  const mats: Matrix4[] = [];
  for (let i = 0; i < bats; i++) {
    const th = (i / bats) * Math.PI * 2 + 0.12;
    const dir = new Vector3(Math.cos(th), Math.sin(th), 0);
    for (let z = a.z + 0.05; z < b.z; z += 0.1) {
      const base = new Vector3(c.x + Math.cos(th - 0.12) * rBat, c.y + Math.sin(th - 0.12) * rBat, z);
      const tip = base.clone().addScaledVector(dir, R - rBat - 0.01);
      mats.push(alongMatrix(base, tip));
    }
  }
  vb.instances(tine, 'frame', mats);
}
