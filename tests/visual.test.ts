/**
 * M1 の検査（design §12）。
 * 1. 見た目の形状は collider の内側に収まる → M0 の干渉検査の結果がそのまま見た目にも当てはまる
 * 2. 主要点（キャブ屋根、タンク上端、前輪上端、フィーダ面、格納オーガ先端、刈刃）が spec と ±0.05 m で一致
 */
import { Box3, InstancedMesh, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { worldShape, type WorldShape } from '../src/collision/shapes';
import { mountMatrices, DEFAULT_POSE } from '../src/model/kinematics';
import { buildParts } from '../src/model/parts';
import type { PartDef } from '../src/model/types';
import { MaterialLib } from '../src/view/materials';
import { buildVisual, hasVisual } from '../src/view/visuals';

const TOL = 0.012;
const parts = buildParts();
const lib = new MaterialLib();
const mounts = mountMatrices(DEFAULT_POSE);

function contains(s: WorldShape, p: Vector3, tol: number): boolean {
  if (s.kind === 'box') {
    const d = [p.x - s.center[0], p.y - s.center[1], p.z - s.center[2]];
    return s.axes.every((ax, i) => Math.abs(d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]) <= s.half[i] + tol);
  }
  const a = new Vector3(...s.a);
  const u = new Vector3(...s.b).sub(a);
  const L = u.length();
  u.normalize();
  const ap = p.clone().sub(a);
  const t = ap.dot(u);
  if (t < -tol || t > L + tol) return false;
  return ap.addScaledVector(u, -t).length() <= s.radius + tol;
}

function eachVertex(obj: Object3D, fn: (p: Vector3) => void) {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const pos = o.geometry.attributes.position;
    const p = new Vector3();
    const inst = new Matrix4();
    const count = o instanceof InstancedMesh ? o.count : 1;
    for (let k = 0; k < count; k++) {
      const m = o.matrixWorld.clone();
      if (o instanceof InstancedMesh) {
        o.getMatrixAt(k, inst);
        m.multiply(inst);
      }
      for (let i = 0; i < pos.count; i++) fn(p.fromBufferAttribute(pos, i).applyMatrix4(m));
    }
  });
}

const withVisual = parts.filter(hasVisual);

describe('見た目の形状', () => {
  it('すべての部品が見た目を持つ（昇降シリンダは画面側で筒とロッドを作る）', () => {
    const missing = parts.filter((p) => p.shape.kind !== 'link' && !hasVisual(p)).map((p) => p.id);
    expect(missing).toEqual([]);
  });

  for (const part of withVisual) {
    it(`${part.id} は collider の内側に収まる（許容 ${TOL * 1000} mm）`, () => {
      const vis = buildVisual(part, lib)!;
      const shape = worldShape(part, mounts);
      const bad: Vector3[] = [];
      eachVertex(vis, (p) => {
        if (!contains(shape, p, TOL)) bad.push(p.clone());
      });
      const w = bad[0];
      expect(bad.length, w ? `例: (${w.x.toFixed(3)}, ${w.y.toFixed(3)}, ${w.z.toFixed(3)})` : '').toBe(0);
    });
  }
});

describe('主要点が spec と ±0.05 m で一致', () => {
  const bounds = (id: string) => {
    const part = parts.find((p) => p.id === id) as PartDef;
    return new Box3().setFromObject(buildVisual(part, lib)!);
  };
  const cases: Array<[string, string, (b: Box3) => number, number]> = [
    ['キャブ屋根', 'cab', (b) => b.max.y, 3.9],
    ['キャブ前端', 'cab', (b) => b.max.x, 1.55],
    ['タンク上端', 'tank', (b) => b.max.y, 3.92],
    ['前輪上端', 'wheel.frontL', (b) => b.max.y, 2.05],
    ['後輪上端', 'wheel.rearL', (b) => b.max.y, 1.64],
    ['フィーダ面の前端', 'feeder.face', (b) => b.max.x, 3.2],
    ['格納オーガ先端', 'unload.tube', (b) => b.max.x, 4.7],
    ['刈刃の前端', 'header.cutterbar', (b) => b.max.x, 5.4],
    ['ヘッダ幅（右端）', 'header.back', (b) => b.max.z, 6.095],
    // M3：内部（design §4.2 (c)）
    ['ロータ前端', 'thresher.rotor', (b) => b.max.x, 0.4],
    ['ロータ後端', 'thresher.rotor', (b) => b.min.x, -2.7],
    ['ロータ上端（後端で最大）', 'thresher.rotor', (b) => b.max.y, 2.012 + 0.38],
    ['ケージ下端', 'thresher.cage', (b) => b.min.y, 1.85 - 0.45],
    ['ビータ中心の高さ', 'thresher.beater', (b) => (b.min.y + b.max.y) / 2, 1.95],
    ['ファン中心の高さ', 'shoe.fan', (b) => (b.min.y + b.max.y) / 2, 0.62],
    ['シーブ後端', 'shoe.sieve', (b) => b.min.x, -2.25],
    ['チャッファ延長部の後端', 'shoe.chafferExt', (b) => b.min.x, -2.65],
    ['エレベータ上端', 'grain.elevator', (b) => b.max.y, 2.48],
    ['チョッパ中心の高さ', 'residue.chopper', (b) => (b.min.y + b.max.y) / 2, 1.4],
    ['エンジン後端', 'engine', (b) => b.min.x, -4.9],
  ];
  for (const [name, id, f, want] of cases) {
    it(`${name}（${id}）≈ ${want} m`, () => expect(Math.abs(f(bounds(id)) - want)).toBeLessThanOrEqual(0.05));
  }
});
