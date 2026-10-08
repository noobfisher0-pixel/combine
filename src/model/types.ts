export type Vec3 = readonly [number, number, number];

/**
 * 可動部の座標系。各マウントの変換は「既定姿勢のワールド座標 → 現在姿勢のワールド座標」。
 * 部品の形状は既定姿勢（すべての角度 0）のワールド座標で書く。
 */
export type MountId =
  | 'body'
  | 'feeder'
  | 'face'
  | 'header'
  | 'reel'
  | 'auger'
  | 'flapL'
  | 'flapR'
  | 'flapF'
  | 'flapB'
  | 'steerL'
  | 'steerR';

export type Shape =
  | { kind: 'box'; center: Vec3; size: Vec3; rotZ?: number /* deg */ }
  | { kind: 'cyl'; a: Vec3; b: Vec3; radius: number }
  /** 2 つのマウントにまたがる円柱（油圧シリンダ）。 */
  | { kind: 'link'; a: { mount: MountId; p: Vec3 }; b: { mount: MountId; p: Vec3 }; radius: number };

export type Confidence = 'source' | 'estimate' | 'design';

export type Group =
  | 'wheel'
  | 'chassis'
  | 'cab'
  | 'feeder'
  | 'header'
  | 'thresher'
  | 'shoe'
  | 'grain'
  | 'tank'
  | 'unload'
  | 'engine'
  | 'residue';

export interface PartDef {
  id: string;
  name: string;
  group: Group;
  /** exterior: X線で透過・断面で切断する外装 / interior: 内部機構 */
  layer: 'exterior' | 'interior';
  mount: MountId;
  shape: Shape;
  meta: { confidence: Confidence; source: string };
}

export interface Pose {
  headerAngle: number; // deg
  faceTilt: number; // deg, + = 刈刃側が上がる
  lateralTilt: number; // deg
  reelLift: number; // m
  reelSlide: number; // m
  augerDeploy: number; // deg
  flaps: number; // deg（0 = 上面に畳む）
  steer: number; // deg
}
