/** 回転の向きとらせんの向きで、作物が正しい向きへ送られること（design §6.2、M3）。 */
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONVEYING } from '../src/model/conveying';
import { conveyDirection, helixPoint } from '../src/model/helix';
import { spec } from '../src/spec/spec';

const t = spec.thresher;
const front = new Vector3(t.rotor.front[0], t.rotor.front[1], 0);
const rearX = t.rotor.front[0] - t.rotor.length * Math.cos((t.rotor.slopeDeg * Math.PI) / 180);
const rearY = t.rotor.front[1] + t.rotor.length * Math.sin((t.rotor.slopeDeg * Math.PI) / 180);
const u = new Vector3(rearX, rearY, 0).sub(front).normalize(); // 前→後ろ

describe('らせんの式', () => {
  it('θ を 1 回転進めると軸方向に advance 進む', () => {
    const p0 = helixPoint(front, u, 0.4, 0, 1.0);
    const p1 = helixPoint(front, u, 0.4, 2 * Math.PI, 1.0);
    expect(p1.clone().sub(p0).dot(u)).toBeCloseTo(1.0, 6);
    expect(p1.clone().sub(p0).length()).toBeCloseTo(1.0, 6);
  });
});

describe('ロータ', () => {
  it('前から見て時計回り：上端の点は（前から見て）右＝ −Z へ動く', () => {
    const top = helixPoint(front, u, 0.38, Math.PI / 2, 0);
    expect(top.y).toBeGreaterThan(front.y);
    const moved = helixPoint(front, u, 0.38, Math.PI / 2 + 0.01 * CONVEYING.rotorSign, 0);
    expect(moved.z - top.z).toBeLessThan(0);
  });
  it('インペラの羽根は作物を後ろへ送る', () => {
    expect(conveyDirection('rotatingFlight', CONVEYING.rotorSign, CONVEYING.impellerAdvance)).toBe(1);
  });
  it('ラスプバーの並びも後ろへ送る', () => {
    expect(conveyDirection('rotatingFlight', CONVEYING.rotorSign, CONVEYING.raspAdvance)).toBe(1);
  });
  it('トップカバーのベーン（止まっている）は、ロータの回転と組で後ろへ送る', () => {
    expect(conveyDirection('stationaryVane', CONVEYING.rotorSign, CONVEYING.vaneAdvance)).toBe(1);
  });
  it('どちらか一方だけ逆にすると前へ戻る（組で決める理由）', () => {
    expect(conveyDirection('stationaryVane', -CONVEYING.rotorSign, CONVEYING.vaneAdvance)).toBe(-1);
    expect(conveyDirection('stationaryVane', CONVEYING.rotorSign, -CONVEYING.vaneAdvance)).toBe(-1);
  });
  it('ベーン角は約 20°（02 §2・design §4.2）', () => {
    const angle = (Math.atan(CONVEYING.vaneAdvance / (2 * Math.PI * 0.415)) * 180) / Math.PI;
    expect(angle).toBeCloseTo(20, 5);
  });
});

describe('オーガ（軸 a→b の向きへ送る）', () => {
  it('クリーングレイン・テーリング・バブルアップ・タンク底のオーガは a→b へ送る', () => {
    expect(conveyDirection('rotatingFlight', CONVEYING.augerSign, CONVEYING.augerAdvanceSign)).toBe(1);
  });
  it('a→b はそれぞれ、右側のエレベータへ（+Z）・上へ・排出オーガの縦部がある後ろへ', () => {
    const sh = spec.shoe;
    expect(sh.cleanGrainAuger.z[1]).toBeGreaterThan(sh.cleanGrainAuger.z[0]);
    expect(sh.tailingsAuger.z[1]).toBeGreaterThan(sh.tailingsAuger.z[0]);
    expect(spec.tank.bubbleUp.y[1]).toBeGreaterThan(spec.tank.bubbleUp.y[0]);
    expect(spec.tank.crossAuger.x[1]).toBeLessThan(spec.tank.crossAuger.x[0]);
    expect(spec.unload.base[0]).toBeLessThan(spec.tank.crossAuger.x[0]);
  });
});
