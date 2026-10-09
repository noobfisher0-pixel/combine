import { Object3D, Quaternion, Vector3, type Group } from 'three';
import { isStrobing, type MotionRates } from '../model/machine';
import type { RateKey, RigSpec } from './visuals/builder';
import type { ProxyMesh } from './scene';

interface Rig {
  obj: Object3D;
  spec: RigSpec;
  blur?: Group;
  base: Vector3;
  phase: number; // spin: 角度、oscillate: 時刻、scroll: 距離
  strobing: boolean;
}

/** シーンから動く部分（userData.anim）を集め、毎フレーム動かす（design §6）。 */
export class Animator {
  private rigs: Rig[] = [];
  private shoe: Array<{ mesh: ProxyMesh; base: Vector3; sign: number }> = [];
  private t = 0;
  /** ストロボ判定でブラー表示になっている動きの名前 */
  readonly blurred = new Set<RateKey>();

  constructor(root: Object3D, proxies: Map<string, ProxyMesh>) {
    root.traverse((o) => {
      const spec = o.userData.anim as RigSpec | undefined;
      if (spec) this.rigs.push({ obj: o, spec, blur: o.userData.blur, base: o.position.clone(), phase: 0, strobing: false });
    });
    // シュー：上（グレインパン・チャッファ）と下（シーブ）を逆位相で揺らす（ブロック表示、内部の見た目は M3）
    for (const [id, sign] of [['shoe.pan', 1], ['shoe.frontChaffer', 1], ['shoe.chaffer', 1], ['shoe.chafferExt', 1], ['shoe.sieve', -1]] as const) {
      const mesh = proxies.get(id);
      if (mesh) this.shoe.push({ mesh, base: mesh.position.clone(), sign });
    }
  }

  get count() {
    return this.rigs.length;
  }

  /** 動きの進み具合（テスト用）：key の最初の仕掛けの位相 */
  phaseOf(key: RateKey): number | undefined {
    return this.rigs.find((r) => r.spec.key === key)?.phase;
  }

  /** dtReal = 実時間の経過、timeScale = 工程の再生倍率。fps のストロボ判定は実時間の dt で行う。 */
  update(dtReal: number, timeScale: number, rates: MotionRates) {
    const dt = dtReal * timeScale;
    this.t += dt;
    this.blurred.clear();
    const q = new Quaternion();
    for (const r of this.rigs) {
      const s = r.spec;
      let step = 0;
      if (s.kind === 'spin') {
        // 車輪・リールはワールド Z 軸回りの角速度、それ以外は部品の軸回りの回転数 × 向き
        const worldZ = WORLD_Z_KEYS.has(s.key);
        const w = worldZ ? new Vector3(0, 0, spinRate(s.key, rates)).dot(s.axis) : spinRate(s.key, rates) * (s.sign ?? 1);
        step = w * dt;
        r.phase += step;
        r.obj.quaternion.copy(q.setFromAxisAngle(s.axis, r.phase));
      } else if (s.kind === 'oscillate') {
        const f = s.key === 'knife' ? rates.knifeHz : rates.shoeHz;
        r.phase += f * dt;
        const x = s.amplitude * Math.sin(2 * Math.PI * r.phase + s.phase);
        r.obj.position.copy(r.base).addScaledVector(s.dir, x);
        step = 2 * Math.PI * f * s.amplitude * dt; // 1 フレームの最大移動
      } else {
        const v = s.key === 'draperCenter' ? rates.draperCenter : s.key === 'elevator' ? rates.elevator : rates.draperSide;
        step = v * dt;
        r.phase = (r.phase + step) % s.pitch;
        r.obj.position.copy(r.base).addScaledVector(s.dir, r.phase);
      }
      r.strobing = isStrobing(step, s.pitch);
      if (r.blur) {
        r.blur.visible = r.strobing && visibleChain(r.obj.parent);
        r.obj.visible = !r.strobing;
      }
      if (r.strobing) this.blurred.add(s.key);
    }
    // シーンの振動方向：シーブ面（後ろ上がり 5°）から 25° 上向き・後方 → 水平から 30°
    const dir = new Vector3(-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0);
    const amp = 0.02;
    for (const s of this.shoe) {
      const x = s.sign * amp * Math.sin(2 * Math.PI * rates.shoeHz * this.t);
      s.mesh.position.copy(s.base).addScaledVector(dir, x);
    }
  }
}

const WORLD_Z_KEYS: ReadonlySet<RateKey> = new Set<RateKey>(['wheelFront', 'wheelRear', 'reel', 'screen']);

function spinRate(key: RateKey, r: MotionRates): number {
  switch (key) {
    case 'wheelFront':
      return r.wheelFrontOmegaZ;
    case 'wheelRear':
      return r.wheelRearOmegaZ;
    case 'reel':
      return r.reelOmegaZ;
    case 'screen':
      return r.screenOmega;
    case 'rotor':
      return r.rotor;
    case 'beater':
      return r.beater;
    case 'fan':
      return r.fan;
    case 'chopper':
      return r.chopper;
    case 'spreader':
      return r.spreader;
    case 'auger':
      return r.auger;
    case 'crossAuger':
      return r.crossAuger;
    default:
      return 0;
  }
}

function visibleChain(o: Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
