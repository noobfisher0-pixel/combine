/**
 * 刈り取りとタンク（docs/game-design.md §4.1〜4.3）。
 * - 刈刃の線が通ったセルを刈る（M6 と同じ sweepCut）。穂に届かない高さで当たれば押し倒す。
 * - 本体・車輪の足跡と、刈っていないときのヘッダの足跡の下にある立毛を押し倒す。
 * - 刈った量は 2 段の一次遅れでタンクへ。ロータに入る量で負荷率を計算し、取りこぼしを引く。
 * - 量の計算は本物の値（kg）で行い、タンクに入る段で grainMult を掛けてゲームの重さにする。
 */
import { Vector3 } from 'three';
import { isStanding, LODGED, toField, type MachinePlace, type WheatField } from '../../field/field';
import { HeaderLowest, machineFootprint, type Footprint } from '../../field/footprint';
import { harvestReport, headerAngleForCut, mogFromCut, suggestedReelLift } from '../../model/harvest';
import { mountMatrices, WORK_POSE } from '../../model/kinematics';
import type { Pose } from '../../model/types';
import { spec } from '../../spec/spec';
import { BALANCE, GAME_DT } from '../balance';

const H = BALANCE.harvest;
const hw = spec.header.width / 2;

/** 取りこぼし率（負荷率 r） */
export function lossFraction(r: number): number {
  if (r <= 1) return 0;
  const e = r - 1;
  return Math.min(H.lossMax, H.lossA * e + H.lossB * e * e);
}

export interface HarvestStats {
  /** タンクに入った量（ゲームの kg） */
  harvested: number;
  /** 失った量（ゲームの kg） */
  overflow: number;
  rotorLoss: number;
  lodgedLoss: number;
  flattenLoss: number;
  flattenedCells: number;
  cutCells: number;
}

export class HarvestModel {
  readonly cutAngle: number;
  readonly reelLift: number;
  /** ロータの能力 [t/h]（穀粒＋MOG、本物の値） */
  readonly rotorCapacity: number;
  readonly footprint: Footprint;
  /** 刈高さでの MOG/穀粒 */
  readonly mogAtCut: number;
  private readonly lowest = new HeaderLowest();
  private knifeCacheAngle = Number.NaN;
  knifeX = 0;
  knifeY = 0;

  // 量（本物の kg）：ヘッダ・フィーダの中
  private hbTotal = 0;
  private hbGrain = 0;
  /** 脱穀・選別の中（ゲームの kg） */
  private sb = 0;
  tank = 0;
  /** 負荷率（ロータに入っている量）と、刈刃の前の収量からの予測 */
  load = 0;
  predicted = 0;
  /** 画面の作物フロー用：刈った量（本物の kg/s、なめらかにした値） */
  feedKgS = 0;
  readonly stats: HarvestStats = { harvested: 0, overflow: 0, rotorLoss: 0, lodgedLoss: 0, flattenLoss: 0, flattenedCells: 0, cutCells: 0 };
  private prevKnife: [[number, number], [number, number]] | null = null;

  constructor(readonly field: WheatField, readonly cropHeight: number) {
    this.cutAngle = headerAngleForCut(BALANCE.cutHeight, WORK_POSE) ?? 0;
    const cutPose: Pose = { ...WORK_POSE, headerAngle: this.cutAngle };
    const cond = { yield: spec.crop.wheat.yield, cropHeight, speed: 5, reelIndex: 1.2 };
    this.reelLift = suggestedReelLift(cutPose, cond);
    const report = harvestReport({ ...cutPose, reelLift: this.reelLift }, cond);
    this.rotorCapacity = report.stages.find((st) => st.id === 'rotor')!.capacity;
    this.footprint = machineFootprint({ ...cutPose, reelLift: this.reelLift }, cropHeight + 0.4);
    this.mogAtCut = report.mog;
  }

  /** 搬送中の穀粒（ゲームの kg） */
  get inTransit(): number {
    return this.hbGrain * BALANCE.grainMult + this.sb;
  }

  /** ヘッダの位置 0〜1 から姿勢のフィーダ角 */
  headerAngle(headerPos: number): number {
    return this.cutAngle + (BALANCE.raisedHeaderAngle - this.cutAngle) * headerPos;
  }

  private updateKnife(pose: Pose) {
    if (pose.headerAngle === this.knifeCacheAngle) return;
    this.knifeCacheAngle = pose.headerAngle;
    const m = mountMatrices(pose).header;
    const k = new Vector3(spec.header.cutterbar.x[1] - 0.1, spec.header.cutterbar.y[0], 0).applyMatrix4(m);
    this.knifeX = k.x;
    this.knifeY = k.y;
  }

  /** 刈刃の前（predictAhead m）の平均の穀粒の量 [kg/m²、本物] */
  private densityAhead(pl: MachinePlace): number {
    const f = this.field;
    let sum = 0;
    let n = 0;
    for (let a = 0.5; a <= H.predictAhead; a += 1.1) {
      for (let zz = -hw + 0.5; zz <= hw - 0.5; zz += 1.0) {
        const [X, Z] = toField(pl, this.knifeX + a, zz);
        const i = Math.floor(X / f.cell);
        const k = Math.floor(Z / f.cell);
        n++;
        if (i < 0 || k < 0 || i >= f.nx || k >= f.nz) continue;
        const idx = k * f.nx + i;
        if (isStanding(f.state[idx])) sum += f.grain[idx];
      }
    }
    return n > 0 ? sum / n / (f.cell * f.cell) : 0;
  }

  /** 負荷率 r になる速度 [km/h]（負荷ホールド）。前に作物がなければ null */
  speedForLoad(pl: MachinePlace, r: number): number | null {
    const d = this.densityAhead(pl);
    if (d <= 0) return null;
    const mog = mogFromCut(this.knifeY);
    const totalPerM = d * spec.header.width * (1 + mog); // kg/m（本物）
    return ((r * this.rotorCapacity * 1000) / 3600 / totalPerM) * 3.6;
  }

  /** 1 刻み：機体の位置と姿勢（移動の後）、地速 [m/s] */
  step(pl: MachinePlace, pose: Pose, v: number, speedKmh: number) {
    const f = this.field;
    const G = BALANCE.grainMult;
    this.updateKnife(pose);
    const heading = -pl.psi;
    const headLen = spec.crop.wheat.headLength;
    const knifeY = this.knifeY;

    // --- 刈る
    const a1 = toField(pl, this.knifeX, -hw);
    const b1 = toField(pl, this.knifeX, hw);
    let grain = 0;
    if (this.prevKnife && knifeY < this.cropHeight + 0.4) {
      const lodgedFast = speedKmh > H.lodgedSpeed;
      const r = f.sweepCut(
        this.prevKnife[0], this.prevKnife[1], a1, b1,
        (idx) => knifeY < f.height[idx] - headLen,
        knifeY,
        1,
        (idx) => {
          if (knifeY < f.height[idx]) {
            f.setFlat(idx, heading);
            this.stats.flattenedCells++;
            this.stats.flattenLoss += f.grain[idx] * G;
          }
        },
        lodgedFast ? (idx) => {
          if (f.state[idx] !== LODGED) return 1;
          this.stats.lodgedLoss += f.grain[idx] * H.lodgedLoss * G;
          return 1 - H.lodgedLoss;
        } : undefined,
      );
      grain = r.grain;
      this.stats.cutCells += r.cells;
    }
    this.prevKnife = [a1, b1];

    // --- 押し倒す：本体・車輪（動いているとき）、刈刃より後ろのヘッダ
    if (v !== 0) {
      const onFlat = (idx: number) => {
        this.stats.flattenedCells++;
        this.stats.flattenLoss += f.grain[idx] * G;
      };
      for (const r of this.footprint.body) f.flattenUnder(pl, r, r.bottom, heading, onFlat);
      const hl = this.lowest.get(pose);
      if (hl < this.cropHeight + 0.2) {
        f.flattenUnder(pl, { x0: this.footprint.headerBack, x1: this.knifeX - 0.05, z0: -hw, z1: hw }, hl, heading, onFlat);
      }
    }

    // --- 量：ヘッダ・フィーダ（本物の kg）→ ロータ（取りこぼし）→ 脱穀・選別（ゲームの kg）→ タンク
    const mog = mogFromCut(knifeY);
    this.hbTotal += grain * (1 + mog);
    this.hbGrain += grain;
    const k1 = GAME_DT / H.tauHeader;
    const outT = this.hbTotal * k1;
    const outG = this.hbGrain * k1;
    this.hbTotal -= outT;
    this.hbGrain -= outG;
    this.load = (outT / GAME_DT) * 3.6 / this.rotorCapacity;
    const loss = lossFraction(this.load);
    this.stats.rotorLoss += outG * loss * G;
    this.sb += outG * (1 - loss) * G;
    const toTank = this.sb * (GAME_DT / H.tauSeparator);
    this.sb -= toTank;
    const room = BALANCE.tank.capacity - this.tank;
    const into = Math.min(room, toTank);
    this.tank += into;
    this.stats.harvested += into;
    this.stats.overflow += toTank - into;
    this.feedKgS += ((grain * (1 + mog)) / GAME_DT - this.feedKgS) * Math.min(1, GAME_DT / 0.4);

    // 予測の負荷：刈刃の前の収量 × 今の速さ（ヘッダを下げているとき）
    if (knifeY < 0.5 && v > 0) {
      const d = this.densityAhead(pl);
      this.predicted = (d * spec.header.width * (1 + mog) * v * 3.6) / this.rotorCapacity;
    } else this.predicted = 0;
  }
}
