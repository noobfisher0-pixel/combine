/**
 * 機体の足跡（作物を押し倒す範囲）。M6 のシナリオとゲームで共通に使う。
 * - 本体：ヘッダ以外で、下端が作物より低い部品の箱（機体座標の長方形と下端の高さ）。
 * - ヘッダ：刈刃より後ろの範囲。下端の高さはフィーダ角で変わるので、角度ごとにキャッシュする。
 */
import { place } from '../collision/check';
import { HEADER_MOUNTS } from '../model/kinematics';
import { headerLowestY } from '../model/limits';
import { buildParts } from '../model/parts';
import type { Pose } from '../model/types';
import { spec } from '../spec/spec';
import type { Rect } from './field';

export interface Footprint {
  body: Array<Rect & { bottom: number }>;
  /** ヘッダの後端（機体座標の x） */
  headerBack: number;
  /** ヘッダの部品がすべて刈幅の内側にあるか */
  headerInside: boolean;
  /** デバイダの先端が刈刃より前にあるか */
  dividerAhead: boolean;
}

/** pose：作業姿勢。cropTop：これより下端が低い部品を足跡にする */
export function machineFootprint(pose: Pose, cropTop: number): Footprint {
  const hw = spec.header.width / 2;
  const placed = place(buildParts(), pose);
  const body = placed
    .filter((q) => !HEADER_MOUNTS.has(q.part.mount) && q.box.min[1] < cropTop)
    .map((q) => ({ x0: q.box.min[0], x1: q.box.max[0], z0: q.box.min[2], z1: q.box.max[2], bottom: q.box.min[1] }));
  const header = placed.filter((q) => HEADER_MOUNTS.has(q.part.mount));
  const divider = header.filter((q) => q.part.id.startsWith('header.divider'));
  return {
    body,
    headerBack: Math.min(...header.map((q) => q.box.min[0])),
    headerInside: header.every((q) => Math.max(Math.abs(q.box.min[2]), Math.abs(q.box.max[2])) <= hw + 1e-6),
    dividerAhead: divider.length > 0 && divider.every((q) => q.box.max[0] > spec.header.cutterbar.x[1]),
  };
}

/** ヘッダの最下点の高さ（フィーダ角を 0.25° 単位に丸めてキャッシュ） */
export class HeaderLowest {
  private cache = new Map<number, number>();
  get(pose: Pose): number {
    const key = Math.round(pose.headerAngle * 4) / 4;
    let y = this.cache.get(key);
    if (y === undefined) {
      y = headerLowestY({ ...pose, headerAngle: key });
      this.cache.set(key, y);
    }
    return y;
  }
}
