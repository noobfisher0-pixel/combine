/**
 * 回転の向きとらせんの向き（design §6.2：ロータの回転方向とトップカバーのベーンのねじれ向きは必ず組で決める）。
 * 見た目（src/view/visuals/interior.ts）はここの値で形を作り、tests/conveying.test.ts で送る向きを確かめる。
 */
export const CONVEYING = {
  /** ロータの回転：軸（前→後ろ）回りに +1 ＝ 前から見て時計回り */
  rotorSign: 1,
  /** インペラの羽根の進み（m/回転）。回る羽根なので負にすると後ろへ送る */
  impellerAdvance: -1.2,
  /** ラスプバーの並びの進み（m/回転） */
  raspAdvance: -1.6,
  /** トップカバーのベーンの進み（m/回転）。止まっているベーンなので正にすると後ろへ送る。ベーン角 20° 相当 */
  vaneAdvance: 2 * Math.PI * 0.415 * Math.tan((20 * Math.PI) / 180),
  /** オーガ：軸 a→b（送る向き）回りに +1 で回し、フライトの進みは負 */
  augerSign: 1,
  augerAdvanceSign: -1,
} as const;
