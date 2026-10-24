/**
 * ゲームのマップ（docs/game-design.md §5「標準マップ」・§6）。G0 では標準マップだけ。形・障害物の自動生成は G2。
 *
 * 座標は M6 の圃場座標と同じ（X・Z、Y 上）。作物の範囲の外接長方形を (0,0)〜(length,width) に置き、
 * その外側に枕地（headland）、さらに外側に柵（world）。
 */
import { WheatField, type CellSample, type MachinePlace } from '../field/field';
import { spec } from '../spec/spec';
import { BALANCE, BALANCE_VERSION } from './balance';
import { fnv1a, fractalNoise, mulberry32 } from './rand';

export interface Obstacle {
  kind: 'pole' | 'rock' | 'tree';
  x: number;
  z: number;
  r: number;
}

export interface GameMap {
  version: number;
  seed: string;
  /** 作物の範囲の外接長方形 */
  length: number;
  width: number;
  headland: number;
  /** 柵の内側（圃場座標） */
  world: { x0: number; z0: number; x1: number; z1: number };
  inCrop: (X: number, Z: number) => boolean;
  obstacles: Obstacle[];
  truck: MachinePlace;
  start: MachinePlace;
  cropHeight: number;
  yield: number; // t/ha（本物の値。ゲームの重さはこれに grainMult を掛ける）
  field: WheatField;
}

/** 標準マップ：作物の範囲 120 m × 70 m の長方形、障害物なし、収量のゆらぎ ±25 %、トラックは角から 40 m */
export function standardMap(seed = 'standard'): GameMap {
  const length = 120;
  const width = 70;
  const hl = BALANCE.map.headland;
  const h = fnv1a(`${BALANCE_VERSION}:${seed}`);
  const yieldN = fractalNoise(h ^ 0x1234, [25, 12]);
  const heightN = fractalNoise(h ^ 0x5678, [18]);
  const inCrop = (X: number, Z: number) => X >= 0 && X <= length && Z >= 0 && Z <= width;
  const wheat = spec.crop.wheat;
  const sample = (X: number, Z: number): CellSample => ({
    crop: inCrop(X, Z),
    height: wheat.height + 0.05 * heightN(X, Z),
    yieldFactor: 1 + 0.25 * yieldN(X, Z),
  });
  const field = new WheatField({
    length, width, cell: BALANCE.map.cell, cropHeight: wheat.height, yield: wheat.yield,
    heightNoise: 0, yieldNoise: 0, seed: h, sample, jitter: mulberry32(h ^ 0x9abc),
  });
  const halfW = spec.header.width / 2;
  return {
    version: BALANCE_VERSION,
    seed,
    length,
    width,
    headland: hl,
    world: { x0: -hl, z0: -hl, x1: length + hl, z1: width + hl },
    inCrop,
    obstacles: [],
    // 左下の角の枕地。トラックは角から 40 m 手前の道（柵の内側）
    truck: { x: -10, z: -20, psi: 0 },
    // 回り刈りの 1 辺目：左端（Z = 0）を 0.1 m はみ出し、+X へ。左は圃場の外
    start: { x: -8, z: halfW - 0.1, psi: 0 },
    cropHeight: wheat.height,
    yield: wheat.yield,
    field,
  };
}
