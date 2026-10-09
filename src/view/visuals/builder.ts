import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../../model/types';
import type { MaterialKey, MaterialLib } from '../materials';

const Y = new Vector3(0, 1, 0);

/** a→b に沿って +Y を向ける変換（中点に置く）。 */
export function alongMatrix(a: Vector3, b: Vector3): Matrix4 {
  const dir = b.clone().sub(a);
  const q = new Quaternion().setFromUnitVectors(Y, dir.clone().normalize());
  return new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1));
}

export const v3 = (p: Vec3 | readonly number[]) => new Vector3(p[0], p[1], p[2]);

/** 動きの種類（design §6.2）。速さは key で MotionRates から引く。 */
export type RateKey =
  | 'wheelFront' | 'wheelRear' | 'reel' | 'screen' | 'knife' | 'shoe' | 'draperSide' | 'draperCenter'
  | 'rotor' | 'beater' | 'fan' | 'chopper' | 'spreader' | 'auger' | 'crossAuger' | 'elevator';
export type RigSpec =
  /** origin を通る axis 回りの回転。pitch = 見た目が繰り返す角度（ストロボ判定用） */
  /** sign：内部機構（軸回りの回転数で回るもの）の回る向き。axis 回りに右手系で +1 / −1 */
  | { kind: 'spin'; key: RateKey; origin: Vector3; axis: Vector3; pitch: number; sign?: number }
  /** dir 方向の正弦往復 */
  | { kind: 'oscillate'; key: RateKey; dir: Vector3; amplitude: number; phase: number; pitch: number }
  /** dir 方向へ流れ、pitch ごとに同じ見た目に戻る（ベルトのスラット） */
  | { kind: 'scroll'; key: RateKey; dir: Vector3; pitch: number };

/**
 * 部品の見た目を組み立てる。形は既定姿勢のワールド座標で置き、最後に材質ごとに結合する。
 * closed = 閉じた立体（断面キャップのステンシル対象）。
 */
export class VisualBuilder {
  private buckets = new Map<string, BufferGeometry[]>();
  private instanced: Array<{ geo: BufferGeometry; mat: MaterialKey; matrices: Matrix4[] }> = [];
  private rigs: Array<{ spec: RigSpec; body: VisualBuilder; blur?: VisualBuilder }> = [];

  /**
   * 動く部分。fn で組み立てた形が RigSpec に従って動く。blur は高速時（ストロボになるとき）に代わりに出す形。
   * 形は既定姿勢・動きの 0 位置のワールド座標で書く。
   */
  rig(spec: RigSpec, fn: (vb: VisualBuilder) => void, blur?: (vb: VisualBuilder) => void): this {
    const body = new VisualBuilder();
    fn(body);
    let b: VisualBuilder | undefined;
    if (blur) {
      b = new VisualBuilder();
      blur(b);
    }
    this.rigs.push({ spec, body, blur: b });
    return this;
  }

  add(geo: BufferGeometry, mat: MaterialKey, matrix?: Matrix4, closed = true): this {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) g = withDummyUv(g);
    g.clearGroups();
    if (matrix) g.applyMatrix4(matrix);
    const key = `${mat}|${closed ? 1 : 0}`;
    const list = this.buckets.get(key) ?? [];
    list.push(g);
    this.buckets.set(key, list);
    return this;
  }

  /** 中心・大きさ・Z 回り回転（度）で箱を置く。 */
  box(center: Vec3 | readonly number[], size: Vec3 | readonly number[], mat: MaterialKey, rotZ = 0, closed = true): this {
    const m = new Matrix4().makeRotationZ((rotZ * Math.PI) / 180).setPosition(center[0], center[1], center[2]);
    return this.add(new BoxGeometry(size[0], size[1], size[2]), mat, m, closed);
  }

  /** x・y・z の範囲で箱を置く。 */
  boxRange(x: readonly number[], y: readonly number[], z: readonly number[], mat: MaterialKey): this {
    return this.box(
      [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2],
      [Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]), Math.abs(z[1] - z[0])],
      mat,
    );
  }

  /** a→b の円柱（両端にふた）。 */
  cylinder(a: Vector3, b: Vector3, r: number, mat: MaterialKey, segments = 28): this {
    const len = a.distanceTo(b);
    return this.add(new CylinderGeometry(r, r, len, segments), mat, alongMatrix(a, b));
  }

  /**
   * 回転体。profile は (半径, 軸方向位置) の閉じた多角形。軸は a→b、軸方向位置 0 は a。
   */
  lathe(profile: Array<[number, number]>, a: Vector3, b: Vector3, mat: MaterialKey, segments = 48): this {
    const pts = profile.map(([r, y]) => new Vector2(r, y));
    pts.push(pts[0].clone());
    const geo = new LatheGeometry(pts, segments);
    const q = new Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return this.add(geo, mat, new Matrix4().compose(a, q, new Vector3(1, 1, 1)));
  }

  /**
   * XY 平面の多角形を Z 方向に押し出す。z0〜z1 の範囲に置く。
   */
  extrudeXY(points: Array<[number, number]>, z0: number, z1: number, mat: MaterialKey): this {
    const shape = new Shape(points.map(([x, y]) => new Vector2(x, y)));
    const geo = new ExtrudeGeometry(shape, { depth: Math.abs(z1 - z0), bevelEnabled: false });
    return this.add(geo, mat, new Matrix4().makeTranslation(0, 0, Math.min(z0, z1)));
  }

  /**
   * (z, y) 平面の多角形を X 方向に押し出す。x0〜x1 の範囲に置く（鏡映を含まない回転で置く）。
   */
  extrudeZY(points: Array<[number, number]>, x0: number, x1: number, mat: MaterialKey): this {
    const shape = new Shape(points.map(([z, y]) => new Vector2(-z, y)));
    const geo = new ExtrudeGeometry(shape, { depth: Math.abs(x1 - x0), bevelEnabled: false });
    const m = new Matrix4().makeTranslation(Math.min(x0, x1), 0, 0).multiply(new Matrix4().makeRotationY(Math.PI / 2));
    return this.add(geo, mat, m);
  }

  instances(geo: BufferGeometry, mat: MaterialKey, matrices: Matrix4[]): this {
    if (matrices.length) this.instanced.push({ geo, mat, matrices });
    return this;
  }

  build(lib: MaterialLib, partId: string): Group {
    const g = new Group();
    g.name = `visual:${partId}`;
    for (const [key, geos] of this.buckets) {
      const [mat, closed] = key.split('|');
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, lib.mats[mat as MaterialKey]);
      mesh.userData = { partId, closed: closed === '1', visual: true };
      mesh.name = `${partId}:${mat}`;
      g.add(mesh);
    }
    for (const { geo, mat, matrices } of this.instanced) {
      const im = new InstancedMesh(geo, lib.mats[mat], matrices.length);
      matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.userData = { partId, closed: false, visual: true };
      im.name = `${partId}:${mat}:instanced`;
      g.add(im);
    }
    for (const r of this.rigs) {
      const origin = r.spec.kind === 'spin' ? r.spec.origin : new Vector3();
      const outer = new Group();
      outer.name = `rig:${partId}:${r.spec.key}`;
      outer.position.copy(origin);
      const inner = r.body.build(lib, partId);
      inner.position.copy(origin).negate();
      outer.add(inner);
      outer.userData.anim = r.spec;
      g.add(outer);
      if (r.blur) {
        const bg = r.blur.build(lib, partId);
        bg.visible = false;
        bg.name = `blur:${partId}:${r.spec.key}`;
        outer.userData.blur = bg;
        g.add(bg);
      }
    }
    return g;
  }
}

function withDummyUv(g: BufferGeometry): BufferGeometry {
  const n = g.attributes.position.count;
  g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
