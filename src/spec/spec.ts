/**
 * 寸法・配置の唯一の情報源（docs/design.md §4.2）。
 *
 * 座標系: +X 前進方向、+Y 上、+Z 機体右側（右手系）。単位 m、角度は度。
 * 原点: 前車軸中心の真下の地面、機体中心線上。
 *
 * 各部品の確度（source / estimate / design）と出典は src/model/parts.ts の meta に書く。
 */

export const spec = {
  wheels: {
    front: { x: 0, y: 1.025, track: 3.04, radius: 1.025, width: 0.9 }, // 900/60R38
    rear: { x: -3.75, y: 0.82, track: 3.04, radius: 0.82, width: 0.75 }, // 750/65R26
    steerMax: 32,
  },
  axles: {
    front: { size: [0.24, 0.24, 2.14] as const },
    rear: { size: [0.24, 0.24, 1.6] as const }, // 両端のナックルは省略
  },
  body: {
    front: 0.95,
    rear: -5.4,
    lowerPanel: { x: [0.95, -2.85], y: [0.45, 2.55], z: 1.01, t: 0.02 },
    rearPanel: { x: [-2.85, -5.4], y: [1.1, 2.5], z: 0.73, t: 0.02 },
    enginePanel: { x: [-3.66, -5.4], y: [2.58, 3.62], z: 1.46, t: 0.02 },
  },
  cab: {
    x: [-0.45, 1.55], y: [2.4, 3.9], halfWidth: 0.94,
    gps: { x: 1.2, radius: 0.15, height: 0.08 },
    mirror: { x: 1.5, y: 3.2, reach: 1.4, height: 0.35 },
    ladder: { bottom: [1.55, 0.35] as const, top: [1.2, 2.4] as const, z: -1.25, width: 0.5 },
  },
  feeder: {
    pivot: [0.95, 1.85] as const,
    tip: [3.05, 0.75] as const,
    height: 0.6,
    width: 1.3,
    angleRange: [-1.2, 12] as const, // 下限 = 刈刃が地面に着く角度
    face: { x: [3.05, 3.2], y: [0.42, 1.08], tiltPivot: [3.12, 0.45] as const, tiltRange: [-8.5, 8.5] as const },
    lateralTiltRange: [-4, 4] as const,
    liftCylinder: {
      chassisAnchor: [0.35, 1.0] as const,
      feederAnchor: [1.95, 1.1] as const,
      z: 0.78,
      radius: 0.045,
      closedLength: 1.55,
      stroke: 0.25,
    },
  },
  header: {
    width: 12.19, // 40 ft
    backplate: { x: [3.2, 3.38], y: [0.1, 1.2] },
    deck: { x: [3.38, 5.18], y: [0.1, 0.3] },
    cutterbar: { x: [5.18, 5.4], y: [0.1, 0.18] },
    reel: { x: 5.1, y: 1.05, radius: 0.535, halfLength: 6.0, liftRange: [-0.15, 0.4] as const, slideRange: [-0.3, 0.3] as const },
  },
  thresher: {
    rotor: { front: [0.4, 1.85] as const, length: 3.1, slopeDeg: 3, tipRadius: 0.38, coreRadius: 0.325 },
    impellerLength: 0.5,
    cage: { innerRadius: 0.4, outerRadius: 0.45, grateThickness: 0.05 },
    concave: { x: [-0.1, -1.1] as const },
    strawPathRadius: 0.36,
    beater: { x: -3.0, y: 1.95, radius: 0.225, halfWidth: 0.65 },
  },
  shoe: {
    halfWidth: 0.75,
    oscillationAmplitude: 0.02,
    pan: { x: [-0.05, -1.1] as const, y: 1.22, t: 0.03 },
    chaffer: { front: [-0.95, 1.05] as const, length: 1.4, extension: 0.3, slopeDeg: 5, t: 0.03 },
    sieve: { front: [-0.9, 0.85] as const, length: 1.35, slopeDeg: 5, t: 0.03 },
    fan: { x: -0.45, y: 0.62, radius: 0.2, housingRadius: 0.25 },
    cleanGrainAuger: { x: -1.3, y: 0.5, radius: 0.11, z: [-0.75, 1.05] as const },
    tailingsAuger: { x: -2.45, y: 0.7, radius: 0.11, z: [-0.75, 1.05] as const },
    elevator: { x: -1.3, y: [0.5, 2.48] as const, z: 1.05, size: [0.35, 0.25] as const },
    tailingsReturn: { x: -2.45, y: [0.7, 1.3] as const, z: 1.05, size: [0.2, 0.25] as const },
  },
  tank: {
    x: [-0.6, -3.6] as const,
    y: [2.55, 3.92] as const,
    halfWidth: 1.45,
    vBottom: { depth: 0.5, troughWidth: 0.5 },
    flap: { height: 0.4, t: 0.02, openDeg: 110, frontRearHalfWidth: 0.95 },
    ratedCapacity: 14.1, // m³（400 bu）＝延長フラップ展開・平らに満たした容量
    bubbleUp: { x: -1.3, z: 0.8, y: [2.55, 3.6] as const, radius: 0.1 },
    crossAuger: { x: [-0.7, -3.5] as const, y: 2.68, radius: 0.125 },
  },
  unload: {
    base: [-3.4, 2.6, -1.7] as const,
    axisTiltDeg: 12, // 縦軸の上端を前方へ傾ける
    verticalLength: 0.97,
    tubeLength: 7.9, // 26 ft
    radius: 0.18,
    spout: { drop: 0.3, radius: 0.12 },
    deployRange: [0, 95] as const,
    rate: 0.15, // m³/s（150 L/s）
  },
  engine: {
    center: [-4.3, 3.1, 0] as const,
    size: [1.2, 1.0, 1.6] as const,
    exhaust: { x: -4.7, z: 0.7, top: 3.98, radius: 0.075 },
    rotaryScreen: { x: -4.3, y: 3.1, radius: 0.5, z: 1.47, t: 0.04 },
  },
  residue: {
    chopper: { x: -3.65, y: 1.4, radius: 0.275, halfWidth: 0.65 },
    chaffSpreader: { x: -3.1, y: 0.9, z: 0.35, radius: 0.3, t: 0.03 },
    strawSpreader: { x: -4.95, y: 0.85, z: 0.45, radius: 0.4, t: 0.03 },
  },
  limits: {
    clearance: 0.05,
    transportHeight: 4.0,
    transportWidth: 3.96,
    transportLength: 10.15,
    groundClearance: 0.3,
    spoutMinHeight: 4.3,
    spoutBeyondHeader: 1.0,
    concaveToPan: 0.1,
  },
} as const;

export type Spec = typeof spec;
