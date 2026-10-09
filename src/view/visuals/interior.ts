/**
 * 内部機構の見た目（M3）。すべて collider（検査用の形）の内側に収める。
 * らせん（ベーン・フライト・ラスプバーの並び）は src/model/helix.ts の式で作り、回転の向きと組で決める。
 */
import { BoxGeometry, Matrix4, Vector3 } from 'three';
import { CONVEYING } from '../../model/conveying';
import { helixPoint } from '../../model/helix';
import type { PartDef } from '../../model/types';
import { spec } from '../../spec/spec';
import { VisualBuilder, v3 } from './builder';
import { range } from './body';

const cylOf = (p: PartDef) => {
  if (p.shape.kind !== 'cyl') throw new Error(p.id);
  return { a: v3(p.shape.a), b: v3(p.shape.b), r: p.shape.radius };
};
const boxOf = (p: PartDef) => {
  if (p.shape.kind !== 'box') throw new Error(p.id);
  return p.shape;
};

/** 軸 u・半径方向 radial の位置に、長さ方向 = u の小さな箱を置く行列。 */
function basisAt(pos: Vector3, u: Vector3, radial: Vector3): Matrix4 {
  const t = u.clone().cross(radial).normalize();
  return new Matrix4().makeBasis(u, radial, t).setPosition(pos);
}

/** らせん上に小さな箱を並べた行列（ベーン・フライト）。radial 方向の幅 w の板を、らせんの接線方向に向ける。 */
function helixSegments(origin: Vector3, u: Vector3, r: number, advance: number, theta0: number, theta1: number, step: number, phase = 0): Matrix4[] {
  const out: Matrix4[] = [];
  for (let th = theta0; th < theta1 - 1e-9; th += step) {
    const p0 = helixPoint(origin, u, r, th, advance, phase);
    const p1 = helixPoint(origin, u, r, Math.min(th + step, theta1), advance, phase);
    const mid = p0.clone().lerp(p1, 0.5);
    const axisPoint = origin.clone().addScaledVector(u, mid.clone().sub(origin).dot(u));
    const radial = mid.clone().sub(axisPoint).normalize();
    const tangent = p1.clone().sub(p0);
    const len = tangent.length();
    tangent.normalize();
    // ローカル X = 接線（長さ len）、Y = 半径方向、Z = 板の厚み
    const z = tangent.clone().cross(radial).normalize();
    const y = z.clone().cross(tangent).normalize();
    out.push(new Matrix4().makeBasis(tangent, y, z).setPosition(mid).multiply(new Matrix4().makeScale(len, 1, 1)));
  }
  return out;
}

// ---------------------------------------------------------------- 脱穀

/** 2 点を結ぶ板の行列（ローカル X ＝ p0→p1、Y ＝ radial に近い向き、Z ＝ 厚み）。 */
function plateBetween(p0: Vector3, p1: Vector3, radial: Vector3): Matrix4 {
  const x = p1.clone().sub(p0);
  const len = x.length();
  x.normalize();
  const z = x.clone().cross(radial).normalize();
  const y = z.clone().cross(x).normalize();
  return new Matrix4().makeBasis(x, y, z).setPosition(p0.clone().lerp(p1, 0.5)).multiply(new Matrix4().makeScale(len, 1, 1));
}

/**
 * ロータ：芯・前端インペラ（円錐台＋羽根 3 枚）・ラスプバー（4 列のらせん）。
 * 前から見て時計回り＝axis（前→後ろ）回りに +1。羽根とバーの並びは物を後ろへ送る向き
 * （回るらせんなので進みは負：helix.ts の rotatingFlight）。
 */
export function rotorVisual(part: PartDef, vb: VisualBuilder) {
  const { a, b, r } = cylOf(part);
  const u = b.clone().sub(a).normalize();
  const L = a.distanceTo(b);
  const t = spec.thresher;
  const core = t.rotor.coreRadius;
  const imp = t.impellerLength;
  const ring = (s: number, radius: number, theta: number) => helixPoint(a.clone().addScaledVector(u, s), u, radius, theta, 0);
  vb.rig(
    { kind: 'spin', key: 'rotor', origin: a, axis: u, pitch: Math.PI / 2, sign: CONVEYING.rotorSign },
    (rv) => {
      rv.cylinder(a.clone().addScaledVector(u, imp), b, core, 'moving', 32);
      rv.lathe([[0, 0], [0.14, 0], [core, imp], [0, imp]], a, a.clone().addScaledVector(u, imp + 0.001), 'moving', 32);
      // インペラの羽根：軸方向 s に沿って角度を θ(s) = 位相 − 2π s / 1.2 で回す（進み −1.2 m/回転）
      const blade = new BoxGeometry(1, 0.04, 0.012);
      const blades: Matrix4[] = [];
      const coneR = (s: number) => 0.14 + ((core - 0.14) * s) / imp + 0.022;
      for (let k = 0; k < 3; k++) {
        const ph = (k * 2 * Math.PI) / 3;
        for (let s = 0.04; s < imp - 0.04; s += 0.05) {
          const th0 = ph + (2 * Math.PI * s) / CONVEYING.impellerAdvance;
          const th1 = ph + (2 * Math.PI * (s + 0.05)) / CONVEYING.impellerAdvance;
          const p0 = ring(s, coneR(s), th0);
          const p1 = ring(s + 0.05, coneR(s + 0.05), th1);
          const mid = p0.clone().lerp(p1, 0.5);
          const radial = mid.clone().sub(a.clone().addScaledVector(u, mid.clone().sub(a).dot(u))).normalize();
          blades.push(plateBetween(p0, p1, radial));
        }
      }
      rv.instances(blade, 'steel', blades);
      // ラスプバー：4 列、進み −1.6 m/回転のらせんに沿って 0.17 m ごと。半径 core〜r
      const bar = new BoxGeometry(0.12, r - core, 0.03);
      const bars: Matrix4[] = [];
      const rows = 4;
      for (let k = 0; k < rows; k++) {
        for (let s = imp + 0.1; s < L - 0.08; s += 0.17) {
          const p = ring(s, (core + r) / 2, (k * 2 * Math.PI) / rows + (2 * Math.PI * s) / CONVEYING.raspAdvance);
          bars.push(basisAt(p, u, p.clone().sub(a.clone().addScaledVector(u, s)).normalize()));
        }
      }
      rv.instances(bar, 'steel', bars);
    },
    (rv) => rv.cylinder(a.clone().addScaledVector(u, 0.01), b.clone().addScaledVector(u, -0.01), r - 0.005, 'blur', 32),
  );
}

/** ケージ：上半分の覆い（半透明）と内側のらせんベーン、下側のコンケーブ（細かい格子）と分離グレート（粗い格子）。 */
export function cageVisual(part: PartDef, vb: VisualBuilder) {
  const { a, b } = cylOf(part);
  const u = b.clone().sub(a).normalize();
  const L = a.distanceTo(b);
  const t = spec.thresher;
  const rin = t.cage.innerRadius;
  // 上半分の覆い：細い板を 10° ごとに並べる（helixPoint の基底で θ ∈ [0, π] が上側）
  const staveR = t.cage.outerRadius - 0.012;
  const stave = new BoxGeometry(L, 0.01, 2 * staveR * Math.sin(Math.PI / 36) + 0.004);
  const staves: Matrix4[] = [];
  for (let k = 0; k < 18; k++) {
    const th = ((k + 0.5) / 18) * Math.PI;
    const p = helixPoint(a.clone().addScaledVector(u, L / 2), u, staveR, th, 0);
    const radial = p.clone().sub(a.clone().addScaledVector(u, L / 2)).normalize();
    staves.push(basisAt(p, u, radial));
  }
  vb.instances(stave, 'shell', staves);
  // らせんベーン（止まっている。物は回転の向きに周回しながらベーンに沿って後ろへ進む：stationaryVane、進み正）
  const vaneAdv = CONVEYING.vaneAdvance;
  const vane = new BoxGeometry(1, 0.03, 0.01);
  const vanes: Matrix4[] = [];
  for (let s = 0.35; s + vaneAdv / 2 < L - 0.05; s += 0.45) {
    for (const m of helixSegments(a.clone().addScaledVector(u, s), u, 0.415, vaneAdv, 0, Math.PI, Math.PI / 12)) vanes.push(m);
  }
  vb.instances(vane, 'grate', vanes);
  // 下側 150°（θ = 195°〜345°）のコンケーブとグレート
  const arc0 = (195 * Math.PI) / 180;
  const arc1 = (345 * Math.PI) / 180;
  const cx = spec.thresher.concave.x;
  const sAt = (x: number) => (a.x - x) / -u.x; // x 座標 → 軸方向の距離
  const grid = (s0: number, s1: number, dTheta: number, dS: number) => {
    const wire = new BoxGeometry(s1 - s0, 0.012, 0.012);
    const wires: Matrix4[] = [];
    for (let th = arc0; th <= arc1 + 1e-6; th += dTheta) {
      const c = a.clone().addScaledVector(u, (s0 + s1) / 2);
      const p = helixPoint(c, u, rin + 0.015, th, 0);
      wires.push(basisAt(p, u, p.clone().sub(c).normalize()));
    }
    vb.instances(wire, 'grate', wires);
    const rib = new BoxGeometry(1, 0.03, 0.012);
    const ribs: Matrix4[] = [];
    for (let s = s0; s <= s1 + 1e-6; s += dS) {
      for (const m of helixSegments(a.clone().addScaledVector(u, s), u, rin + 0.025, 0, arc0, arc1, (arc1 - arc0) / 10)) ribs.push(m);
    }
    vb.instances(rib, 'grate', ribs);
  };
  grid(sAt(cx[0]), sAt(cx[1]), (7.5 * Math.PI) / 180, 0.12);
  grid(sAt(cx[1]), L - 0.02, (15 * Math.PI) / 180, 0.3);
}

/** ディスチャージビータ：芯と 8 枚の羽根。上側が後方へ（+Z 軸回りに +1）。 */
export function beaterVisual(part: PartDef, vb: VisualBuilder) {
  const { a, b, r } = cylOf(part);
  const u = b.clone().sub(a).normalize();
  const c = a.clone().lerp(b, 0.5);
  vb.rig(
    { kind: 'spin', key: 'beater', origin: c, axis: u, pitch: (2 * Math.PI) / 8, sign: 1 },
    (rv) => {
      rv.cylinder(a, b, 0.08, 'moving', 24);
      const blade = new BoxGeometry(a.distanceTo(b) - 0.02, r - 0.085, 0.02);
      const ms: Matrix4[] = [];
      for (let k = 0; k < 8; k++) {
        const p = helixPoint(c, u, (0.08 + r) / 2, (k * 2 * Math.PI) / 8, 0);
        ms.push(basisAt(p, u, p.clone().sub(c).normalize()));
      }
      rv.instances(blade, 'steel', ms);
    },
    (rv) => rv.cylinder(a.clone().addScaledVector(u, 0.01), b.clone().addScaledVector(u, -0.01), r - 0.01, 'blur', 24),
  );
}

// ---------------------------------------------------------------- 選別

/**
 * シューの板（グレインパン・前段チャッファ・チャッファ・延長部・シーブ）。ローカル X ＝ 傾斜方向。
 * 上シュー（パン・チャッファ類）と下シュー（シーブ）を逆位相で、シーブ面から 25° 上向き後方に揺らす。
 */
export function shoeVisual(part: PartDef, vb: VisualBuilder) {
  const sh = boxOf(part);
  const m = new Matrix4().makeRotationZ(((sh.rotZ ?? 0) * Math.PI) / 180).setPosition(...sh.center);
  const [Lx, T, W] = sh.size;
  const lower = part.id === 'shoe.sieve';
  const dir = new Vector3(-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0);
  vb.rig(
    { kind: 'oscillate', key: 'shoe', dir, amplitude: spec.shoe.oscillationAmplitude, phase: lower ? Math.PI : 0, pitch: 1 },
    (rv) => {
      // 左右の枠
      for (const s of [-1, 1]) rv.add(new BoxGeometry(Lx, T, 0.03), 'grate', m.clone().multiply(new Matrix4().makeTranslation(0, 0, s * (W / 2 - 0.015))));
      if (part.id === 'shoe.pan') {
        // グレインパン：板と、横向きの段（物を後ろへ送るのこぎり歯）
        rv.add(new BoxGeometry(Lx, T * 0.4, W - 0.06), 'steel', m.clone().multiply(new Matrix4().makeTranslation(0, -T * 0.3, 0)));
        const tooth = new BoxGeometry(0.012, T * 0.45, W - 0.06);
        const ms: Matrix4[] = [];
        for (let x = -Lx / 2 + 0.03; x < Lx / 2 - 0.02; x += 0.06) ms.push(m.clone().multiply(new Matrix4().makeTranslation(x, T * 0.15, 0)));
        rv.instances(tooth, 'steel', ms);
        return;
      }
      // ルーバー：30° 傾けた薄い板を横に並べる（シーブは細かく）
      const pitch = lower ? 0.03 : 0.04;
      const slat = new BoxGeometry(0.03, 0.004, W - 0.06);
      const ms: Matrix4[] = [];
      for (let x = -Lx / 2 + pitch / 2; x < Lx / 2 - pitch / 4; x += pitch) {
        ms.push(m.clone().multiply(new Matrix4().makeTranslation(x, 0, 0)).multiply(new Matrix4().makeRotationZ(Math.PI / 6)));
      }
      rv.instances(slat, 'steel', ms);
    },
  );
}

/** クリーニングファン（クロスフロー、40 枚）と渦巻き状の覆い。上側が後方へ（+Z 軸回りに +1）。 */
export function fanVisual(part: PartDef, vb: VisualBuilder) {
  const { a, b, r } = cylOf(part);
  const u = b.clone().sub(a).normalize();
  const c = a.clone().lerp(b, 0.5);
  const rf = spec.shoe.fan.radius;
  // 覆い：前・下・上前方の 270°（後ろ上方が吐出口）
  const staveR = r - 0.006;
  const stave = new BoxGeometry(a.distanceTo(b), 0.008, 2 * staveR * Math.sin(Math.PI / 36) + 0.004);
  const st: Matrix4[] = [];
  for (let k = 0; k < 36; k++) {
    const th = ((k + 0.5) / 36) * 2 * Math.PI;
    const p = helixPoint(c, u, staveR, th, 0);
    const radial = p.clone().sub(c).normalize();
    if (radial.x < -0.3 && radial.y > -0.2) continue; // 後ろ上方を開ける
    st.push(basisAt(p, u, radial));
  }
  vb.instances(stave, 'shell', st);
  vb.rig(
    { kind: 'spin', key: 'fan', origin: c, axis: u, pitch: (2 * Math.PI) / 40, sign: 1 },
    (rv) => {
      rv.cylinder(a.clone().addScaledVector(u, 0.01), b.clone().addScaledVector(u, -0.01), 0.03, 'steel', 12);
      for (const s of [0.015, a.distanceTo(b) - 0.015]) {
        const p = a.clone().addScaledVector(u, s);
        rv.cylinder(p.clone().addScaledVector(u, -0.006), p.clone().addScaledVector(u, 0.006), rf, 'moving', 32);
      }
      const blade = new BoxGeometry(a.distanceTo(b) - 0.04, 0.06, 0.006);
      const ms: Matrix4[] = [];
      for (let k = 0; k < 40; k++) {
        const p = helixPoint(c, u, rf - 0.035, (k * 2 * Math.PI) / 40, 0);
        const radial = p.clone().sub(c).normalize();
        ms.push(basisAt(p, u, radial).multiply(new Matrix4().makeRotationX(-Math.PI / 6)));
      }
      rv.instances(blade, 'moving', ms);
    },
    (rv) => rv.cylinder(a.clone().addScaledVector(u, 0.02), b.clone().addScaledVector(u, -0.02), rf - 0.01, 'blur', 32),
  );
}

// ---------------------------------------------------------------- 穀粒搬送

/**
 * オーガ：下半分のトラフ（半透明）と、回るフライト。a→b の向きへ送る（回るらせんなので進みは負：helix.ts）。
 * 縦のオーガ（バブルアップ）は筒全体を半透明にする。
 */
export function augerVisual(part: PartDef, vb: VisualBuilder) {
  const { a, b, r } = cylOf(part);
  const u = b.clone().sub(a).normalize();
  const L = a.distanceTo(b);
  const vertical = Math.abs(u.y) > 0.9;
  const key = part.id === 'tank.crossAuger' ? 'crossAuger' : 'auger';
  // トラフ（水平）または筒（縦）
  const stR = r - 0.005;
  const stave = new BoxGeometry(L, 0.004, 2 * stR * Math.sin(Math.PI / 24) + 0.003);
  const st: Matrix4[] = [];
  const c = a.clone().lerp(b, 0.5);
  for (let k = 0; k < 24; k++) {
    const th = ((k + 0.5) / 24) * 2 * Math.PI;
    const p = helixPoint(c, u, stR, th, 0);
    const radial = p.clone().sub(c).normalize();
    if (!vertical && radial.y > 0.05) continue; // 水平のオーガは上を開ける
    st.push(basisAt(p, u, radial));
  }
  vb.instances(stave, 'shell', st);
  const flightPitch = Math.min(0.3, 2 * r);
  vb.rig(
    { kind: 'spin', key, origin: a, axis: u, pitch: 2 * Math.PI, sign: CONVEYING.augerSign },
    (rv) => {
      rv.cylinder(a.clone().addScaledVector(u, 0.01), b.clone().addScaledVector(u, -0.01), Math.max(0.02, r * 0.22), 'steel', 12);
      const seg = new BoxGeometry(1, r * 0.7, 0.006);
      const revs = (L - 0.04) / flightPitch;
      const ms = helixSegments(a.clone().addScaledVector(u, 0.02), u, r * 0.58, CONVEYING.augerAdvanceSign * flightPitch, 0, revs * 2 * Math.PI, Math.PI / 9);
      // 進みを負にしたので軸方向の位置は −側へ伸びる。始点を b 側へずらして a〜b に収める
      const shift = new Matrix4().makeTranslation(...u.clone().multiplyScalar(L - 0.04).toArray());
      rv.instances(seg, 'moving', ms.map((m) => shift.clone().multiply(m)));
    },
  );
}

/** エレベータ（パドルチェーン）：枠と半透明の覆い、上る列と下る列のパドル。 */
export function elevatorVisual(part: PartDef, vb: VisualBuilder) {
  const sh = boxOf(part);
  const [x0, x1] = range(sh.center[0], sh.size[0]);
  const [y0, y1] = range(sh.center[1], sh.size[1]);
  const [z0, z1] = range(sh.center[2], sh.size[2]);
  const t = 0.006;
  // 覆い（4 面）と角の枠
  vb.boxRange([x0, x0 + t], [y0, y1], [z0, z1], 'shell');
  vb.boxRange([x1 - t, x1], [y0, y1], [z0, z1], 'shell');
  vb.boxRange([x0, x1], [y0, y1], [z0, z0 + t], 'shell');
  vb.boxRange([x0, x1], [y0, y1], [z1 - t, z1], 'shell');
  for (const x of [x0 + 0.015, x1 - 0.015]) for (const z of [z0 + 0.015, z1 - 0.015]) vb.boxRange([x - 0.012, x + 0.012], [y0, y1], [z - 0.012, z + 0.012], 'grate');
  // パドル：前半分が上り、後ろ半分が下り
  const pitch = 0.1;
  const w = (x1 - x0) / 2 - 0.03;
  const paddle = new BoxGeometry(w, 0.008, z1 - z0 - 0.04);
  for (const [xc, dir] of [[x1 - 0.015 - w / 2, 1], [x0 + 0.015 + w / 2, -1]] as const) {
    const ms: Matrix4[] = [];
    for (let y = y0 + 0.06 + pitch; y < y1 - 0.06 - pitch; y += pitch) ms.push(new Matrix4().makeTranslation(xc, y, (z0 + z1) / 2));
    vb.rig({ kind: 'scroll', key: 'elevator', dir: new Vector3(0, dir, 0), pitch }, (rv) => rv.instances(paddle, 'moving', ms));
  }
}

// ---------------------------------------------------------------- 残渣処理

/** ストローチョッパ：ドラムとナイフ（周方向 12 列 × 幅方向 5）。上側が後方へ（+Z 軸回りに +1）。 */
export function chopperVisual(part: PartDef, vb: VisualBuilder) {
  const { a, b, r } = cylOf(part);
  const u = b.clone().sub(a).normalize();
  const c = a.clone().lerp(b, 0.5);
  const W = a.distanceTo(b);
  vb.rig(
    { kind: 'spin', key: 'chopper', origin: c, axis: u, pitch: (2 * Math.PI) / 12, sign: 1 },
    (rv) => {
      rv.cylinder(a, b, 0.11, 'moving', 32);
      const knife = new BoxGeometry(0.08, r - 0.115, 0.01);
      const ms: Matrix4[] = [];
      for (let k = 0; k < 12; k++) {
        for (let j = 0; j < 5; j++) {
          const s = ((j + 0.5 + (k % 2) * 0.5) / 5.5) * (W - 0.1) + 0.05 - W / 2;
          const p = helixPoint(c.clone().addScaledVector(u, s), u, (0.115 + r) / 2, (k * 2 * Math.PI) / 12, 0);
          ms.push(basisAt(p, u, p.clone().sub(c.clone().addScaledVector(u, s)).normalize()));
        }
      }
      rv.instances(knife, 'steel', ms);
    },
    (rv) => rv.cylinder(a.clone().addScaledVector(u, 0.01), b.clone().addScaledVector(u, -0.01), r - 0.01, 'blur', 32),
  );
}

/** スプレッダ（縦軸の円盤と羽根 4 枚）。左右で逆回転して後方へ扇形に撒く。 */
export function spreaderVisual(part: PartDef, vb: VisualBuilder) {
  const { a, b, r } = cylOf(part);
  const u = b.clone().sub(a).normalize();
  const left = a.z < 0;
  const H = a.distanceTo(b);
  const vanes = 4;
  vb.rig(
    { kind: 'spin', key: 'spreader', origin: a, axis: u, pitch: (2 * Math.PI) / vanes, sign: left ? -1 : 1 },
    (rv) => {
      rv.cylinder(a, a.clone().addScaledVector(u, 0.012), r - 0.005, 'moving', 32);
      rv.cylinder(a, b, 0.04, 'steel', 12);
      const vane = new BoxGeometry(H - 0.02, r - 0.06, 0.01);
      const ms: Matrix4[] = [];
      const c = a.clone().addScaledVector(u, H / 2 + 0.005);
      for (let k = 0; k < vanes; k++) {
        const p = helixPoint(c, u, (0.04 + r) / 2, (k * 2 * Math.PI) / vanes, 0);
        ms.push(basisAt(p, u, p.clone().sub(c).normalize()));
      }
      rv.instances(vane, 'moving', ms);
    },
    (rv) => rv.cylinder(a, b, r - 0.01, 'blur', 32),
  );
}

// ---------------------------------------------------------------- 動力・車軸

export function engineVisual(part: PartDef, vb: VisualBuilder) {
  const sh = boxOf(part);
  const [x0, x1] = range(sh.center[0], sh.size[0]);
  const [y0, y1] = range(sh.center[1], sh.size[1]);
  const [z0, z1] = range(sh.center[2], sh.size[2]);
  const ym = y0 + (y1 - y0) * 0.55;
  // ブロック（下）とヘッド（上）、ヘッドカバー、オイルパン、ターボ、吸気管
  vb.boxRange([x0 + 0.03, x1 - 0.15], [y0 + 0.12, ym], [z0 + 0.15, z1 - 0.25], 'grate');
  vb.boxRange([x0 + 0.2, x1 - 0.25], [y0, y0 + 0.12], [z0 + 0.25, z1 - 0.35], 'grate');
  vb.boxRange([x0 + 0.15, x1 - 0.2], [ym, ym + 0.2], [z0 + 0.2, z1 - 0.3], 'steel');
  vb.boxRange([x0 + 0.2, x1 - 0.25], [ym + 0.2, ym + 0.3], [z0 + 0.25, z1 - 0.35], 'accent');
  vb.cylinder(new Vector3(x1 - 0.35, ym + 0.25, z1 - 0.18), new Vector3(x1 - 0.35, ym + 0.25, z1 - 0.02), 0.14, 'steel', 20);
  vb.cylinder(new Vector3(x0 + 0.15, y1 - 0.1, z0 + 0.1), new Vector3(x1 - 0.15, y1 - 0.1, z0 + 0.1), 0.08, 'frame', 16);
  // 横置き：前端（+X 側の z 端）にベルトのプーリ
  vb.cylinder(new Vector3((x0 + x1) / 2, y0 + 0.35, z1 - 0.24), new Vector3((x0 + x1) / 2, y0 + 0.35, z1 - 0.02), 0.25, 'moving', 32);
}

export function axleVisual(part: PartDef, vb: VisualBuilder) {
  const sh = boxOf(part);
  const [x0, x1] = range(sh.center[0], sh.size[0]);
  const [y0, y1] = range(sh.center[1], sh.size[1]);
  const [z0, z1] = range(sh.center[2], sh.size[2]);
  const yc = (y0 + y1) / 2;
  const xc = (x0 + x1) / 2;
  vb.boxRange([x0 + 0.03, x1 - 0.03], [y0 + 0.03, y1 - 0.03], [z0 + 0.3, z1 - 0.3], 'frame');
  for (const [za, zb] of [[z0, z0 + 0.3], [z1 - 0.3, z1]]) {
    vb.cylinder(new Vector3(xc, yc, za), new Vector3(xc, yc, zb), Math.min(x1 - x0, y1 - y0) / 2 - 0.002, 'grate', 20);
  }
}

