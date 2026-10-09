import { Vector3 } from 'three';

/**
 * らせん（ロータのベーン・ラスプバーの並び・オーガのフライト）。
 * axis 回りに角度 theta（軸の正の向きから見て反時計回り＝右手系の正）回ったとき、axis 方向へ advancePerRev × theta/2π 進む。
 * 「回転の向き」と「らせんの進む向き」を同じ式で決めることで、送る向きを取り違えない（design §6.2 ロータの注記）。
 */
export function helixPoint(origin: Vector3, axis: Vector3, radius: number, theta: number, advancePerRev: number, phase = 0): Vector3 {
  const u = axis.clone().normalize();
  const e1 = Math.abs(u.y) < 0.9 ? new Vector3(0, 1, 0).cross(u).normalize() : new Vector3(1, 0, 0).cross(u).normalize();
  const e2 = u.clone().cross(e1);
  const t = theta + phase;
  return origin
    .clone()
    .addScaledVector(e1, radius * Math.cos(t))
    .addScaledVector(e2, radius * Math.sin(t))
    .addScaledVector(u, (advancePerRev * theta) / (2 * Math.PI));
}

/**
 * らせんが物を送る向き（axis 方向の成分の符号、+1 = axis の向き）。
 * - stationaryVane：らせん（ベーン）は止まっていて、物が回転の向きに周回する（ロータのトップカバー）。
 *   物はらせんに沿って進むので、送る向き ＝ 回転の符号 × らせんの進みの符号。
 * - rotatingFlight：物は止まっていて（トラフに押さえられ）、らせん（フライト）が回る（オーガ・インペラ）。
 *   ある角度位置で見るとフライト面は進みと逆向きに動くので、送る向きは上の逆。
 */
export function conveyDirection(kind: 'stationaryVane' | 'rotatingFlight', rotationSign: number, advancePerRev: number): number {
  const s = Math.sign(rotationSign) * Math.sign(advancePerRev);
  return kind === 'stationaryVane' ? s : -s;
}
