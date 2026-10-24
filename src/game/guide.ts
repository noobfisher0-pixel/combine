/**
 * 回り刈りのガイドライン（docs/game-design.md §4.6・§7.1）。本物の自動操舵のライトバーにあたる。
 *
 * 残っている立毛の外接長方形を求め、今の向きにいちばん近い辺（時計回り：下 → 右 → 上 → 左）を選ぶ。
 * その辺に沿って、刈幅の左端が立毛の縁と 0.2 m 重なる線（機体の中心線）を引き、辺の終わりで
 * 次の辺の線へ入るための左 270° のループ（半径 6.6 m）を添える。
 */
import { isStanding, type MachinePlace, type WheatField } from '../field/field';
import { advance } from '../field/path';
import { spec } from '../spec/spec';

export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export type Side = 'bottom' | 'right' | 'top' | 'left';
export interface Guide {
  side: Side;
  /** 中心線の始点と終点（終点でループを始める） */
  a: [number, number];
  b: [number, number];
  /** ループの点（1 m ごと） */
  loop: Array<[number, number]>;
}

const OVERLAP = 0.2;
const R = spec.field.turnRadius;
const HW = spec.header.width / 2;
/** 辺ごとの向き（psi） */
const SIDE_PSI: Record<Side, number> = { bottom: 0, right: -Math.PI / 2, top: Math.PI, left: Math.PI / 2 };

/** 残っている立毛の外接長方形（なければ null） */
export function standingBox(f: WheatField): Box | null {
  let i0 = Infinity;
  let i1 = -1;
  let k0 = Infinity;
  let k1 = -1;
  for (let k = 0; k < f.nz; k++) {
    for (let i = 0; i < f.nx; i++) {
      if (!isStanding(f.state[k * f.nx + i])) continue;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (k < k0) k0 = k;
      if (k > k1) k1 = k;
    }
  }
  if (i1 < 0) return null;
  return { x0: i0 * f.cell, x1: (i1 + 1) * f.cell, z0: k0 * f.cell, z1: (k1 + 1) * f.cell };
}

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function computeGuide(box: Box | null, pl: MachinePlace): Guide | null {
  if (!box) return null;
  const side = (Object.keys(SIDE_PSI) as Side[]).reduce((a, b) => (angleDiff(pl.psi, SIDE_PSI[a]) <= angleDiff(pl.psi, SIDE_PSI[b]) ? a : b));
  const inset = HW - OVERLAP; // 中心線は立毛の縁から内側へ
  let a: [number, number];
  let b: [number, number];
  switch (side) {
    case 'bottom': {
      const z = box.z0 + inset;
      a = [box.x0 - 10, z];
      b = [box.x1 - inset + R, z];
      break;
    }
    case 'right': {
      const x = box.x1 - inset;
      a = [x, box.z0 - 10];
      b = [x, box.z1 - inset + R];
      break;
    }
    case 'top': {
      const z = box.z1 - inset;
      a = [box.x1 + 10, z];
      b = [box.x0 + inset - R, z];
      break;
    }
    default: {
      const x = box.x0 + inset;
      a = [x, box.z1 + 10];
      b = [x, box.z0 + inset - R];
    }
  }
  const loop: Array<[number, number]> = [];
  const start = { x: b[0], z: b[1], psi: SIDE_PSI[side] };
  for (let s = 0; s <= 1.5 * Math.PI * R + 1e-9; s += 1) {
    const p = advance(start, -1 / R, s);
    loop.push([p.x, p.z]);
  }
  return { side, a, b, loop };
}
