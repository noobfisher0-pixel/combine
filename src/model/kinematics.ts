import { Matrix4, Vector3 } from 'three';
import { spec, type Spec } from '../spec/spec';
import type { MountId, Pose } from './types';

export const DEFAULT_POSE: Pose = {
  headerAngle: 0,
  faceTilt: 0,
  lateralTilt: 0,
  reelLift: 0,
  reelSlide: 0,
  augerDeploy: 0,
  flaps: 0,
  steer: 0,
};

/** 作業中（刈取り中）の姿勢。 */
export const WORK_POSE: Pose = { ...DEFAULT_POSE, flaps: spec.tank.flap.openDeg };

/** 輸送姿勢（ヘッダは外す前提で、全長・全幅・全高の検査に使う）。 */
export const TRANSPORT_POSE: Pose = { ...DEFAULT_POSE };

/** 排出姿勢。 */
export const UNLOAD_POSE: Pose = { ...WORK_POSE, augerDeploy: spec.unload.deployRange[1] };

export function poseRanges(s: Spec = spec): Record<keyof Pose, readonly [number, number]> {
  return {
    headerAngle: s.feeder.angleRange,
    faceTilt: s.feeder.face.tiltRange,
    lateralTilt: s.feeder.lateralTiltRange,
    reelLift: s.header.reel.liftRange,
    reelSlide: s.header.reel.slideRange,
    augerDeploy: s.unload.deployRange,
    flaps: [0, s.tank.flap.openDeg],
    steer: [-s.wheels.steerMax, s.wheels.steerMax],
  };
}

const deg = (d: number) => (d * Math.PI) / 180;

/** 点 p を通る軸 axis 回りに angle 回転する行列。 */
function rotateAbout(p: Vector3, axis: Vector3, angleDeg: number): Matrix4 {
  const t = new Matrix4().makeTranslation(p.x, p.y, p.z);
  const r = new Matrix4().makeRotationAxis(axis.clone().normalize(), deg(angleDeg));
  const tInv = new Matrix4().makeTranslation(-p.x, -p.y, -p.z);
  return t.multiply(r).multiply(tInv);
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** 各マウントの行列（既定姿勢のワールド座標 → 現在姿勢のワールド座標）。 */
export function mountMatrices(pose: Pose, s: Spec = spec): Record<MountId, Matrix4> {
  const f = s.feeder;
  const feeder = rotateAbout(new Vector3(f.pivot[0], f.pivot[1], 0), Z, pose.headerAngle);
  const face = feeder.clone().multiply(rotateAbout(new Vector3(f.face.tiltPivot[0], f.face.tiltPivot[1], 0), Z, pose.faceTilt));
  const header = face.clone().multiply(rotateAbout(new Vector3(f.face.tiltPivot[0], 0.75, 0), X, pose.lateralTilt));
  const reel = header.clone().multiply(new Matrix4().makeTranslation(pose.reelSlide, pose.reelLift, 0));

  const u = s.unload;
  const ut = deg(u.axisTiltDeg);
  const auger = rotateAbout(new Vector3(...u.base), new Vector3(Math.sin(ut), Math.cos(ut), 0), pose.augerDeploy);

  const tk = s.tank;
  const top = tk.y[1];
  const flapL = rotateAbout(new Vector3(0, top, -tk.halfWidth), X, -pose.flaps);
  const flapR = rotateAbout(new Vector3(0, top, tk.halfWidth), X, pose.flaps);
  const flapF = rotateAbout(new Vector3(tk.x[0], top, 0), Z, -pose.flaps);
  const flapB = rotateAbout(new Vector3(tk.x[1], top, 0), Z, pose.flaps);

  const rw = s.wheels.rear;
  const steerL = rotateAbout(new Vector3(rw.x, rw.y, -rw.track / 2), Y, pose.steer);
  const steerR = rotateAbout(new Vector3(rw.x, rw.y, rw.track / 2), Y, pose.steer);

  return { body: new Matrix4(), feeder, face, header, reel, auger, flapL, flapR, flapF, flapB, steerL, steerR };
}

/** ヘッダ・フィーダ側（フェース以降）に属するマウント。 */
export const HEADER_MOUNTS: ReadonlySet<MountId> = new Set<MountId>(['face', 'header', 'reel']);
