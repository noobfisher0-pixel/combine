import { Matrix4, Vector3 } from 'three';
import type { MountId, PartDef } from '../model/types';
import type { Support, V3 } from './gjk';

/** ワールド座標に置いた凸形状。 */
export type WorldShape =
  | { kind: 'box'; center: V3; axes: [V3, V3, V3]; half: V3 }
  | { kind: 'cyl'; a: V3; b: V3; radius: number };

const v = (x: Vector3): V3 => [x.x, x.y, x.z];

export function worldShape(part: PartDef, mounts: Record<MountId, Matrix4>): WorldShape {
  const sh = part.shape;
  if (sh.kind === 'link') {
    const a = new Vector3(...sh.a.p).applyMatrix4(mounts[sh.a.mount]);
    const b = new Vector3(...sh.b.p).applyMatrix4(mounts[sh.b.mount]);
    return { kind: 'cyl', a: v(a), b: v(b), radius: sh.radius };
  }
  const m = mounts[part.mount];
  if (sh.kind === 'cyl') {
    return {
      kind: 'cyl',
      a: v(new Vector3(...sh.a).applyMatrix4(m)),
      b: v(new Vector3(...sh.b).applyMatrix4(m)),
      radius: sh.radius,
    };
  }
  const local = new Matrix4().makeRotationZ(((sh.rotZ ?? 0) * Math.PI) / 180);
  const world = m.clone().multiply(local); // 回転部分だけ使う
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((ax) =>
    v(ax.transformDirection(world)),
  ) as [V3, V3, V3];
  return {
    kind: 'box',
    center: v(new Vector3(...sh.center).applyMatrix4(m)),
    axes,
    half: [sh.size[0] / 2, sh.size[1] / 2, sh.size[2] / 2],
  };
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** margin > 0 なら、その半径の球で膨らませた形状のサポート関数。 */
export function supportOf(s: WorldShape, margin = 0): Support {
  const inflate = (p: V3, d: V3): V3 => {
    if (margin <= 0) return p;
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [p[0] + (margin * d[0]) / l, p[1] + (margin * d[1]) / l, p[2] + (margin * d[2]) / l];
  };
  if (s.kind === 'box') {
    return (d) => {
      const p: V3 = [s.center[0], s.center[1], s.center[2]];
      for (let i = 0; i < 3; i++) {
        const sign = dot(d, s.axes[i]) >= 0 ? 1 : -1;
        const h = s.half[i] * sign;
        p[0] += s.axes[i][0] * h;
        p[1] += s.axes[i][1] * h;
        p[2] += s.axes[i][2] * h;
      }
      return inflate(p, d);
    };
  }
  const ab: V3 = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]];
  const L = Math.hypot(ab[0], ab[1], ab[2]);
  const u: V3 = [ab[0] / L, ab[1] / L, ab[2] / L];
  return (d) => {
    const du = dot(d, u);
    const end = du >= 0 ? s.b : s.a;
    const perp: V3 = [d[0] - du * u[0], d[1] - du * u[1], d[2] - du * u[2]];
    const pl = Math.hypot(perp[0], perp[1], perp[2]);
    const p: V3 = pl > 1e-12
      ? [end[0] + (s.radius * perp[0]) / pl, end[1] + (s.radius * perp[1]) / pl, end[2] + (s.radius * perp[2]) / pl]
      : [end[0], end[1], end[2]];
    return inflate(p, d);
  };
}

export interface AABB { min: V3; max: V3 }

export function aabbOf(s: WorldShape): AABB {
  const sup = supportOf(s);
  const min: V3 = [0, 0, 0];
  const max: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const d: V3 = [0, 0, 0];
    d[i] = 1;
    max[i] = sup(d)[i];
    d[i] = -1;
    min[i] = sup(d)[i];
  }
  return { min, max };
}

export function centerOf(s: WorldShape): V3 {
  if (s.kind === 'box') return s.center;
  return [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2];
}
