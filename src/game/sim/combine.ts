/**
 * コンバインの運転（docs/game-design.md §3・§4.1）。前車軸中心の位置と向き、速度、後輪の切れ角、ヘッダとオーガ。
 * 入力は 1 刻みごとのキーの状態（ビット）で、押した瞬間・長押しはこの中で判定する（記録した入力で再生できる）。
 * 時間：運動はゲームの時計（GAME_DT）、ハンドルとキーの長押しの判定は実時間（REAL_DT）。
 */
import { advance } from '../../field/path';
import { spec } from '../../spec/spec';
import { BALANCE, GAME_DT, REAL_DT } from '../balance';

/** 1 刻みの入力（ビット） */
export const KEY = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  header: 16, // 押した刻みだけ立てる（切り替え）
  auger: 32,
  hold: 64,
} as const;

export interface CombineState {
  x: number;
  z: number;
  psi: number;
  v: number; // m/s（後退は負）
  vTarget: number; // km/h（クルーズの目標、後退は負）
  steer: number; // deg（> 0 で右旋回）
  headerUp: boolean;
  headerPos: number; // 0 = 下（刈る高さ）〜 1 = 上
  augerOut: boolean;
  augerPos: number; // 0 = 格納 〜 1 = 振り出し
  loadHold: boolean;
  stun: number; // s（衝突で動けない残り時間）
  // キーの判定用
  upHeld: number;
  downHeld: number;
  steerHeld: number;
  downMode: 'brake' | 'reverse' | null;
  reverseArmed: boolean;
  prevKeys: number;
}

export function initialCombine(x: number, z: number, psi: number): CombineState {
  return {
    x, z, psi, v: 0, vTarget: 0, steer: 0,
    headerUp: true, headerPos: 1, augerOut: false, augerPos: 0, loadHold: false, stun: 0,
    upHeld: 0, downHeld: 0, steerHeld: 0, downMode: null, reverseArmed: false, prevKeys: 0,
  };
}

const C = BALANCE.combine;
const WHEELBASE = -spec.wheels.rear.x;
const kmh = (ms: number) => ms * 3.6;
const ms = (kmh: number) => kmh / 3.6;

export function maxForward(s: CombineState): number {
  return s.augerPos > 0 ? C.maxWithAuger : C.maxForward;
}

/**
 * 入力で目標速度・ハンドル・ヘッダ・オーガを変え、1 刻み進める（衝突の判定は呼び出し側）。
 * holdSpeed：負荷ホールドが求める速度 [km/h]（null なら変えない）
 */
export function stepCombine(s: CombineState, keys: number, holdSpeed: number | null): void {
  const pressed = keys & ~s.prevKeys;
  const up = (keys & KEY.up) !== 0;
  const down = (keys & KEY.down) !== 0;

  if (pressed & KEY.header) s.headerUp = !s.headerUp;
  if (pressed & KEY.auger) s.augerOut = !s.augerOut;
  if (pressed & KEY.hold) s.loadHold = !s.loadHold;

  // --- 速度（クルーズ）：短く押すと ±tapStep、長押しで連続
  if (up && !down) {
    if (s.upHeld === 0) {
      s.loadHold = false;
      s.reverseArmed = false;
      s.vTarget = s.vTarget < 0 ? Math.min(0, s.vTarget + C.tapStep) : s.vTarget + C.tapStep;
    } else if (s.upHeld > C.holdAfter) {
      const d = C.holdRate * GAME_DT;
      s.vTarget = s.vTarget < 0 ? Math.min(0, s.vTarget + d) : s.vTarget + d;
    }
    s.upHeld += REAL_DT;
  } else s.upHeld = 0;

  if (down && !up) {
    if (s.downHeld === 0) {
      s.loadHold = false;
      if (s.vTarget > 0) {
        s.downMode = 'brake';
        s.vTarget = Math.max(0, s.vTarget - C.tapStep);
      } else if (s.vTarget < 0) {
        s.downMode = 'reverse';
        s.vTarget -= C.tapStep;
      } else if (Math.abs(s.v) < 0.05 && s.reverseArmed) {
        // 止まってから、いったん離してもう一度押すと後退
        s.downMode = 'reverse';
        s.vTarget = -C.tapStep;
      } else s.downMode = 'brake';
    } else if (s.downHeld > C.holdAfter) {
      const d = C.holdRate * GAME_DT;
      s.vTarget = s.downMode === 'reverse' ? s.vTarget - d : Math.max(0, s.vTarget - d);
    }
    s.downHeld += REAL_DT;
  } else {
    if (s.downHeld > 0 && s.vTarget === 0) s.reverseArmed = true;
    s.downHeld = 0;
    s.downMode = null;
  }

  if (s.loadHold && holdSpeed !== null) s.vTarget = holdSpeed;
  s.vTarget = Math.max(-C.maxReverse, Math.min(maxForward(s), s.vTarget));
  if (s.vTarget !== 0) s.reverseArmed = false;

  // --- ハンドル（実時間）：押し始めはゆっくり
  const left = (keys & KEY.left) !== 0;
  const right = (keys & KEY.right) !== 0;
  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  const target = dir * C.steerMax;
  const rate = dir !== 0 && s.steerHeld < C.steerSoftTime - 1e-9 && Math.sign(target - s.steer) === dir ? C.steerSoftRate : C.steerRate;
  const ds = rate * REAL_DT;
  s.steer += Math.max(-ds, Math.min(ds, target - s.steer));
  s.steerHeld = dir !== 0 ? s.steerHeld + REAL_DT : 0;

  // --- ヘッダ・オーガ（ゲームの時計）
  s.headerPos = approach(s.headerPos, s.headerUp ? 1 : 0, GAME_DT / C.headerTime);
  s.augerPos = approach(s.augerPos, s.augerOut ? 1 : 0, GAME_DT / C.augerTime);

  // --- 速さ
  if (s.stun > 0) {
    s.stun = Math.max(0, s.stun - GAME_DT);
    s.v = 0;
    s.vTarget = 0;
  } else {
    const vt = ms(s.vTarget);
    const speedingUp = Math.abs(vt) > Math.abs(s.v) && Math.sign(vt) * Math.sign(s.v) >= 0;
    const a = (speedingUp ? C.accel : C.brake) * GAME_DT;
    s.v += Math.max(-a, Math.min(a, vt - s.v));
  }

  // --- 位置（前車軸中心は横滑りしない。曲率 ＝ tan(切れ角) / ホイールベース）
  const kappa = Math.tan((s.steer * Math.PI) / 180) / WHEELBASE;
  const p = advance({ x: s.x, z: s.z, psi: s.psi }, kappa, s.v * GAME_DT);
  s.x = p.x;
  s.z = p.z;
  s.psi = p.psi;
  s.prevKeys = keys;
}

function approach(v: number, target: number, step: number): number {
  return Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step;
}

export { kmh };
