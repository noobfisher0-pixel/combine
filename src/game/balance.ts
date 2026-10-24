/**
 * ゲームのバランス表（docs/game-design.md §5）。時間の値はすべてゲームの時計（実時間 × TIME_SCALE）。
 * 値を変えたら BALANCE_VERSION を上げる（同じシードでも結果が変わるので、共有の文字列とベスト記録を分ける）。
 */
export const BALANCE_VERSION = 1;

export const BALANCE = {
  /** ゲームの時計 ／ 実時間 */
  timeScale: 1.5,
  /** シミュレーションの刻み（実時間 1/60 s） */
  stepsPerSecond: 60,
  /** 穀粒の倍率（表示する重さにも掛ける） */
  grainMult: 15,
  /** 刈高さ [m] */
  cutHeight: 0.15,
  /** ヘッダを上げたときのフィーダ角 [deg] */
  raisedHeaderAngle: 10,

  combine: {
    maxForward: 12, // km/h
    maxReverse: 4, // km/h
    maxWithAuger: 7, // km/h（排出オーガを振り出している間）
    accel: 1.0, // m/s²
    brake: 2.0, // m/s²
    tapStep: 0.25, // km/h（短く押したとき）
    holdAfter: 0.25, // s（実時間。これより長く押すと連続で変わる）
    holdRate: 3.6, // km/h/s（長押しの間、ゲームの時計）
    steerMax: 32, // deg
    steerRate: 45, // deg/s（実時間）
    steerSoftRate: 10, // deg/s（押し始め）
    steerSoftTime: 0.3, // s（実時間）
    headerTime: 1.0, // s（上げ下げ）
    augerTime: 2.0, // s（振り出し）
    stunTime: 2.0, // s（衝突で動けない時間）
    loadHoldTarget: 0.95, // 負荷ホールドの目標の負荷率
  },

  harvest: {
    /** ヘッダ・フィーダ → ロータ、脱穀・選別 → タンクの遅れ（一次遅れの時定数、s） */
    tauHeader: 2,
    tauSeparator: 4,
    /** 取りこぼし率 ＝ min(lossMax, a(r−1) ＋ b(r−1)²) */
    lossA: 2,
    lossB: 3,
    lossMax: 0.9,
    /** 倒れた小麦（LODGED）をこの速さより速く刈ると、lodgedLoss を失う */
    lodgedSpeed: 4, // km/h
    lodgedLoss: 0.3,
    /** 予測の負荷を計算する、刈刃の前の距離 [m] */
    predictAhead: 5,
  },

  tank: {
    capacity: 10_570, // kg（ゲームの重さ。本物の 13.69 m³ × 772 kg/m³ と同じ）
    warn: [0.7, 0.9],
    unloadRate: 600, // kg/s
  },

  cart: {
    capacity: 16_000, // kg
    speed: 18, // km/h
    toTruckRate: 2_000, // kg/s
  },

  round: {
    easy: 450, // s（ゲームの時計。実時間 5 分）
    normal: 360, // s（実時間 4 分）
    hard: 360,
  },

  map: {
    cell: 0.5, // m
    headland: 25, // m（作物の範囲の外側）
  },
} as const;

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 実時間の刻み [s] とゲームの時計の刻み [s] */
export const REAL_DT = 1 / BALANCE.stepsPerSecond;
export const GAME_DT = REAL_DT * BALANCE.timeScale;
