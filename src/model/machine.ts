import { spec } from '../spec/spec';
import type { Pose } from './types';

/**
 * 運転状態（design §6.1）。姿勢（Pose）は油圧で動く部分の目標値で、実際の姿勢は
 * 速度制限つきで目標へ近づける（approachPose）。
 */
export interface MachineState {
  engineOn: boolean;
  separatorOn: boolean; // 脱穀・選別・残渣処理
  headerOn: boolean; // ヘッダとフィーダ
  unloadOn: boolean; // 排出オーガの回転（穀粒の流出は M4）
  groundSpeed: number; // km/h
  reelIndex: number; // リール周速 / 地速
  /** 回転・往復・ベルトなど「機械の工程」の再生倍率。油圧の動きには掛けない（§6.3） */
  timeScale: number;
}

export const DEFAULT_MACHINE: MachineState = {
  engineOn: true,
  separatorOn: true,
  headerOn: true,
  unloadOn: false,
  groundSpeed: 5, // Class 8 の小麦での実例 4.8〜6.4 km/h（資料 06）
  reelIndex: 1.2,
  timeScale: 0.1,
};

export const LIMITS = {
  groundSpeed: [0, 12] as const,
  reelIndex: [1.0, 1.4] as const,
  timeScale: [0.02, 1] as const,
  reelRpmMax: 70, // 01 §1
  reelRpmMin: 8,
};

/** 実機の運転値（再生倍率を掛ける前）。単位は rad/s、Hz、m/s。 */
export interface MotionRates {
  /** ワールド Z 軸回りの角速度（+ は右手系で Z 正向きから見て反時計回り）。前進時の車輪は負 */
  wheelFrontOmegaZ: number;
  wheelRearOmegaZ: number;
  reelOmegaZ: number;
  reelRpm: number;
  screenOmega: number;
  knifeHz: number;
  shoeHz: number;
  draperSide: number; // m/s（中央へ）
  draperCenter: number; // m/s（後方へ）
  /** 地面のスクロール速度（m/s、機体は原点に固定して地面を −X へ流す） */
  ground: number;
  /** 内部機構：各部品の軸回りの角速度（rad/s、軸の向きと回る向きは見た目の rig で決める） */
  rotor: number;
  beater: number;
  fan: number;
  chopper: number;
  spreader: number;
  auger: number; // クリーングレイン・テーリング・バブルアップ
  crossAuger: number; // タンク底（排出中だけ）
  elevator: number; // m/s（パドルチェーン）
  cornChain: number; // m/s（コーンヘッドのギャザリングチェーン）
  cornAuger: number; // rad/s（コーンヘッドのクロスオーガ）
}

/** 小麦での運転値（02 §2・§3、03 §4。回転数は資料の範囲の中から小麦向けの値を選んだ推定） */
export const INTERNAL_RPM = {
  rotor: 900, // 210〜1,000 rpm
  beater: 1200, // 推定（ロータの約 1.3 倍）
  fan: 1050, // 300〜1,350 rpm
  chopper: 3000, // 細断時
  spreader: 500,
  auger: 400, // 推定
  elevatorSpeed: 3, // m/s（推定）
};

const kmh = (v: number) => v / 3.6;
const rad = (rpm: number) => (rpm * 2 * Math.PI) / 60;

export function reelRpm(groundSpeedKmh: number, index: number, diameter = spec.header.reel.radius * 2): number {
  const rpm = (kmh(groundSpeedKmh) * index * 60) / (Math.PI * diameter);
  return Math.min(LIMITS.reelRpmMax, rpm);
}

export function motionRates(s: MachineState): MotionRates {
  const on = s.engineOn;
  const v = on ? kmh(s.groundSpeed) : 0;
  const header = on && s.headerOn;
  const sep = on && s.separatorOn;
  // リールは地速 0 でも最低回転数で回す（実機の運転と同じく、止めるのはヘッダ OFF のとき）
  const rpm = header ? Math.max(LIMITS.reelRpmMin, reelRpm(s.groundSpeed, s.reelIndex)) : 0;
  return {
    wheelFrontOmegaZ: -v / spec.wheels.front.radius,
    wheelRearOmegaZ: -v / spec.wheels.rear.radius,
    reelOmegaZ: -(rpm * 2 * Math.PI) / 60, // 車輪と同じ向き：下側のタインが後方（刈刃側）へ
    reelRpm: rpm,
    screenOmega: on ? (30 * 2 * Math.PI) / 60 : 0,
    knifeHz: header ? 10 : 0,
    shoeHz: sep ? 4.5 : 0,
    draperSide: header ? Math.max(1.0, Math.min(3.5, 1.5 * v + 0.5)) : 0,
    draperCenter: header ? 3.5 : 0,
    ground: v,
    rotor: sep ? rad(INTERNAL_RPM.rotor) : 0,
    beater: sep ? rad(INTERNAL_RPM.beater) : 0,
    fan: sep ? rad(INTERNAL_RPM.fan) : 0,
    chopper: sep ? rad(INTERNAL_RPM.chopper) : 0,
    spreader: sep ? rad(INTERNAL_RPM.spreader) : 0,
    auger: sep ? rad(INTERNAL_RPM.auger) : 0,
    crossAuger: on && s.unloadOn ? rad(INTERNAL_RPM.auger) : 0,
    elevator: sep ? INTERNAL_RPM.elevatorSpeed : 0,
    cornChain: header ? spec.cornHead.chainSpeed : 0,
    cornAuger: header ? rad(spec.cornHead.augerRpm) : 0,
  };
}

/** 1 フレームの移動量が繰り返しピッチの半分以上なら、逆回転・静止に見える（R-25）。 */
export function isStrobing(stepPerFrame: number, pitch: number): boolean {
  return Math.abs(stepPerFrame) >= pitch / 2;
}

/** 油圧で動く部分の速さ（実時間、単位は度/s または m/s）。§6.2 の所要時間から。 */
export const ACTUATOR_RATES: Record<keyof Pose, number> = {
  headerAngle: 13.2 / 3, // 全範囲を約 3 s
  faceTilt: 6,
  lateralTilt: 4,
  reelLift: 0.2,
  reelSlide: 0.2,
  augerDeploy: 95 / 8, // 約 8 s
  flaps: 110 / 4, // 約 4 s
  steer: 30,
};

/** 現在の姿勢を目標へ、速度制限つきで近づける。 */
export function approachPose(current: Pose, target: Pose, dt: number): Pose {
  const out = { ...current };
  for (const k of Object.keys(target) as Array<keyof Pose>) {
    const d = target[k] - current[k];
    const step = ACTUATOR_RATES[k] * dt;
    out[k] = Math.abs(d) <= step ? target[k] : current[k] + Math.sign(d) * step;
  }
  return out;
}
