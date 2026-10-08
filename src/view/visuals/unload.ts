import type { PartDef } from '../../model/types';
import { VisualBuilder, v3 } from './builder';

/** 排出オーガ：管（collider よりわずかに細い）＋継ぎ目のフランジ。 */
export function unloadVisual(part: PartDef, vb: VisualBuilder) {
  if (part.shape.kind !== 'cyl') throw new Error(part.id);
  const a = v3(part.shape.a);
  const b = v3(part.shape.b);
  const r = part.shape.radius;
  const dir = b.clone().sub(a).normalize();
  const len = a.distanceTo(b);
  if (part.id === 'unload.spout') {
    // 下向きの筒と、先端のこぼれ止め
    vb.cylinder(a, a.clone().lerp(b, 0.75), r * 0.85, 'body', 20);
    vb.cylinder(a.clone().lerp(b, 0.75), b, r, 'frame', 20);
    return;
  }
  vb.cylinder(a, b, r * 0.9, 'body', 28);
  const flange = (t: number) => {
    const p = a.clone().addScaledVector(dir, t);
    vb.cylinder(p.clone().addScaledVector(dir, -0.02), p.clone().addScaledVector(dir, 0.02), r, 'accent', 28);
  };
  if (part.id === 'unload.vertical') {
    flange(0.03);
    flange(len - 0.03);
  } else {
    for (let t = 0.03; t < len; t += 1.6) flange(t);
    flange(len - 0.03);
  }
}

