import { spec, type Spec } from '../spec/spec';
import type { Confidence, Group, MountId, PartDef, Shape, Vec3 } from './types';

/** x・y・z の範囲（順不同）から箱を作る。 */
function boxRange(x: readonly number[], y: readonly number[], z: readonly number[], rotZ?: number): Shape {
  const c = (r: readonly number[]) => (r[0] + r[1]) / 2;
  const s = (r: readonly number[]) => Math.abs(r[1] - r[0]);
  return { kind: 'box', center: [c(x), c(y), c(z)], size: [s(x), s(y), s(z)], rotZ };
}

/** 2 点を結ぶ板（断面の中心線が a→b、厚み t、幅 w）。 */
function slab(a: readonly [number, number], b: readonly [number, number], t: number, halfWidth: number): Shape {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return {
    kind: 'box',
    center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0],
    size: [Math.hypot(dx, dy), t, halfWidth * 2],
    rotZ: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

function cyl(a: Vec3, b: Vec3, radius: number): Shape {
  return { kind: 'cyl', a, b, radius };
}

/** 傾斜した直線上の点。front から後方（−x）へ length 進んだ点。 */
function along(front: readonly [number, number], length: number, slopeDeg: number): [number, number] {
  const r = (slopeDeg * Math.PI) / 180;
  return [front[0] - length * Math.cos(r), front[1] + length * Math.sin(r)];
}

const S: Confidence = 'source';
const E: Confidence = 'estimate';
const D: Confidence = 'design';

export function buildParts(s: Spec = spec): PartDef[] {
  const parts: PartDef[] = [];
  const add = (
    id: string,
    name: string,
    group: Group,
    layer: PartDef['layer'],
    mount: MountId,
    shape: Shape,
    confidence: Confidence,
    source: string,
  ) => parts.push({ id, name, group, layer, mount, shape, meta: { confidence, source } });

  // ---------- 走行系 ----------
  const fw = s.wheels.front;
  const rw = s.wheels.rear;
  for (const side of [-1, 1] as const) {
    const L = side < 0 ? 'L' : 'R';
    const zc = (side * fw.track) / 2;
    add(`wheel.front${L}`, `前輪（${side < 0 ? '左' : '右'}）`, 'wheel', 'exterior', 'body',
      cyl([fw.x, fw.y, zc - (side * fw.width) / 2], [fw.x, fw.y, zc + (side * fw.width) / 2], fw.radius), S, '04 §2 900/60R38');
    const zr = (side * rw.track) / 2;
    add(`wheel.rear${L}`, `後輪（${side < 0 ? '左' : '右'}）`, 'wheel', 'exterior', side < 0 ? 'steerL' : 'steerR',
      cyl([rw.x, rw.y, zr - (side * rw.width) / 2], [rw.x, rw.y, zr + (side * rw.width) / 2], rw.radius), S, '04 §2 750/65R26');
  }
  add('axle.front', '前車軸ハウジング', 'chassis', 'interior', 'body',
    { kind: 'box', center: [fw.x, fw.y, 0], size: s.axles.front.size }, D, 'R-23');
  add('axle.rear', '後車軸の梁', 'chassis', 'interior', 'body',
    { kind: 'box', center: [rw.x, rw.y, 0], size: s.axles.rear.size }, D, 'R-23');

  // ---------- 車体外板 ----------
  const b = s.body;
  for (const side of [-1, 1] as const) {
    const L = side < 0 ? 'L' : 'R';
    const p1 = b.lowerPanel;
    add(`panel.lower${L}`, `下部側板（${side < 0 ? '左' : '右'}）`, 'chassis', 'exterior', 'body',
      boxRange(p1.x, p1.y, [side * (p1.z - p1.t / 2), side * (p1.z + p1.t / 2)]), D, 'design §4.2(a)');
    const p2 = b.rearPanel;
    add(`panel.rear${L}`, `後部側板（${side < 0 ? '左' : '右'}）`, 'chassis', 'exterior', 'body',
      boxRange(p2.x, p2.y, [side * (p2.z - p2.t / 2), side * (p2.z + p2.t / 2)]), D, '後輪操舵との干渉回避で幅を絞る');
    const p3 = b.enginePanel;
    add(`panel.engine${L}`, `エンジン室側板（${side < 0 ? '左' : '右'}）`, 'chassis', 'exterior', 'body',
      boxRange(p3.x, p3.y, [side * (p3.z - p3.t / 2), side * (p3.z + p3.t / 2)]), D, 'design §4.2(e)');
  }

  add('panel.engineHood', 'エンジンフード', 'chassis', 'exterior', 'body',
    boxRange(b.engineHood.x, b.engineHood.y, [-b.engineHood.halfWidth, b.engineHood.halfWidth]), D, 'M1 外観');

  // ---------- キャブ ----------
  const c = s.cab;
  add('cab', 'キャブ', 'cab', 'exterior', 'body', boxRange(c.x, c.y, [-c.halfWidth, c.halfWidth]), D, 'R-03 床 2.40');
  add('cab.gps', 'GPS ドーム', 'cab', 'exterior', 'body',
    cyl([c.gps.x, c.y[1], 0], [c.gps.x, c.y[1] + c.gps.height, 0], c.gps.radius), E, '04 §3');
  for (const side of [-1, 1] as const) {
    add(`cab.mirror${side < 0 ? 'L' : 'R'}`, `ミラー（${side < 0 ? '左' : '右'}）`, 'cab', 'exterior', 'body',
      boxRange([c.mirror.x - 0.025, c.mirror.x + 0.025], [c.mirror.y - c.mirror.height / 2, c.mirror.y + c.mirror.height / 2],
        [side * c.halfWidth, side * c.mirror.reach]), D, 'R-05 格納オーガと干渉させない');
  }
  {
    const [bx, by] = c.ladder.bottom;
    const [tx, ty] = c.ladder.top;
    const len = Math.hypot(tx - bx, ty - by);
    // 箱のローカル X を昇降方向に合わせる
    add('cab.ladder', '乗降ラダー', 'cab', 'exterior', 'body', {
      kind: 'box',
      center: [(bx + tx) / 2, (by + ty) / 2, c.ladder.z],
      size: [len, c.ladder.width, 0.06],
      rotZ: (Math.atan2(ty - by, tx - bx) * 180) / Math.PI,
    }, E, '04 §3');
  }

  // ---------- フィーダ・ヘッダ ----------
  const f = s.feeder;
  add('feeder.housing', 'フィーダハウス', 'feeder', 'exterior', 'feeder',
    slab(f.pivot, f.tip, f.height, f.width / 2), E, '01 §4, 04 §1（長さ 2.37 m）');
  add('feeder.face', 'フロントフェース', 'feeder', 'exterior', 'face',
    boxRange(f.face.x, f.face.y, [-f.width / 2, f.width / 2]), S, '01 §4 前後チルト 0〜17°');
  for (const side of [-1, 1] as const) {
    const lc = f.liftCylinder;
    add(`feeder.lift${side < 0 ? 'L' : 'R'}`, `昇降シリンダ（${side < 0 ? '左' : '右'}）`, 'feeder', 'interior', 'body', {
      kind: 'link',
      a: { mount: 'body', p: [lc.chassisAnchor[0], lc.chassisAnchor[1], side * lc.z] },
      b: { mount: 'feeder', p: [lc.feederAnchor[0], lc.feederAnchor[1], side * lc.z] },
      radius: lc.radius,
    }, E, '01 §4（2 本）');
  }
  const h = s.header;
  const hz: [number, number] = [-h.width / 2, h.width / 2];
  add('header.back', 'ヘッダ背板', 'header', 'exterior', 'header', boxRange(h.backplate.x, h.backplate.y, hz), E, '01 §1 幅 40 ft');
  add('header.deck', 'ドレーパーデッキ', 'header', 'exterior', 'header', boxRange(h.deck.x, h.deck.y, hz), E, '01 §1');
  add('header.cutterbar', 'カッターバー', 'header', 'exterior', 'header', boxRange(h.cutterbar.x, h.cutterbar.y, hz), S, '01 §1');
  for (const side of [-1, 1] as const) {
    const L = side < 0 ? 'L' : 'R';
    const J = side < 0 ? '左' : '右';
    const es = h.endShield;
    const zo = h.width / 2;
    add(`header.end${L}`, `エンドシールド（${J}）`, 'header', 'exterior', 'header',
      boxRange(es.x, es.y, [side * (zo - es.t), side * zo]), E, '01 §7');
    add(`header.divider${L}`, `デバイダ（${J}）`, 'header', 'exterior', 'header',
      boxRange(h.divider.x, h.divider.y, [side * h.divider.z[0], side * h.divider.z[1]]), E, '01 §6 先端は黒');
    const ra = h.reelArm;
    const len = Math.hypot(h.reel.x - ra.pivot[0], h.reel.y - ra.pivot[1]);
    add(`header.reelArm${L}`, `リールアーム（${J}）`, 'header', 'exterior', 'reel', {
      kind: 'box',
      center: [(ra.pivot[0] + h.reel.x) / 2, (ra.pivot[1] + h.reel.y) / 2, (side * (ra.z[0] + ra.z[1])) / 2],
      size: [len, ra.t, ra.z[1] - ra.z[0]],
      rotZ: (Math.atan2(h.reel.y - ra.pivot[1], h.reel.x - ra.pivot[0]) * 180) / Math.PI,
    }, E, 'M1 外観');
  }
  add('header.reel', 'リール', 'header', 'exterior', 'reel',
    cyl([h.reel.x, h.reel.y, -h.reel.halfLength], [h.reel.x, h.reel.y, h.reel.halfLength], h.reel.radius), S, '01 §1 φ1.07');

  // ---------- 脱穀 ----------
  const t = s.thresher;
  const rotorRear = along(t.rotor.front, t.rotor.length, t.rotor.slopeDeg);
  const rf: Vec3 = [t.rotor.front[0], t.rotor.front[1], 0];
  const rr: Vec3 = [rotorRear[0], rotorRear[1], 0];
  add('thresher.rotor', 'ロータ', 'thresher', 'interior', 'body', cyl(rf, rr, t.rotor.tipRadius), S, '02 §2 φ0.76 × 3.10');
  add('thresher.cage', 'ロータケージ', 'thresher', 'interior', 'body', cyl(rf, rr, t.cage.outerRadius), D, 'design §4.2(c)');
  add('thresher.beater', 'ディスチャージビータ', 'thresher', 'interior', 'body',
    cyl([t.beater.x, t.beater.y, -t.beater.halfWidth], [t.beater.x, t.beater.y, t.beater.halfWidth], t.beater.radius), E, '02 §2');

  // ---------- 選別 ----------
  const sh = s.shoe;
  add('shoe.pan', 'グレインパン', 'shoe', 'interior', 'body',
    boxRange(sh.pan.x, [sh.pan.y - sh.pan.t / 2, sh.pan.y + sh.pan.t / 2], [-sh.halfWidth, sh.halfWidth]), D, 'R-14');
  const chafferRear = along(sh.chaffer.front, sh.chaffer.length, sh.chaffer.slopeDeg);
  const extRear = along(sh.chaffer.front, sh.chaffer.length + sh.chaffer.extension, sh.chaffer.slopeDeg);
  add('shoe.chaffer', 'チャッファ', 'shoe', 'interior', 'body', slab(sh.chaffer.front, chafferRear, sh.chaffer.t, sh.halfWidth), S, '02 §3 2.5 m²');
  add('shoe.chafferExt', 'チャッファ延長部', 'shoe', 'interior', 'body', slab(chafferRear, extRear, sh.chaffer.t, sh.halfWidth), E, 'R-06');
  add('shoe.sieve', 'シーブ', 'shoe', 'interior', 'body',
    slab(sh.sieve.front, along(sh.sieve.front, sh.sieve.length, sh.sieve.slopeDeg), sh.sieve.t, sh.halfWidth), S, '02 §3 2.1 m²');
  add('shoe.fan', 'クリーニングファン', 'shoe', 'interior', 'body',
    cyl([sh.fan.x, sh.fan.y, -sh.halfWidth], [sh.fan.x, sh.fan.y, sh.halfWidth], sh.fan.housingRadius), S, '02 §3 Case IH 9250');
  add('grain.cleanAuger', 'クリーングレインオーガ', 'grain', 'interior', 'body',
    cyl([sh.cleanGrainAuger.x, sh.cleanGrainAuger.y, sh.cleanGrainAuger.z[0]], [sh.cleanGrainAuger.x, sh.cleanGrainAuger.y, sh.cleanGrainAuger.z[1]], sh.cleanGrainAuger.radius), E, '02 §7');
  add('grain.tailingsAuger', 'テーリングオーガ', 'grain', 'interior', 'body',
    cyl([sh.tailingsAuger.x, sh.tailingsAuger.y, sh.tailingsAuger.z[0]], [sh.tailingsAuger.x, sh.tailingsAuger.y, sh.tailingsAuger.z[1]], sh.tailingsAuger.radius), E, 'R-06');
  add('grain.elevator', 'クリーングレインエレベータ（右）', 'grain', 'interior', 'body',
    boxRange([sh.elevator.x - sh.elevator.size[0] / 2, sh.elevator.x + sh.elevator.size[0] / 2], sh.elevator.y,
      [sh.elevator.z - sh.elevator.size[1] / 2, sh.elevator.z + sh.elevator.size[1] / 2]), E, '03 §1、R-04');
  add('grain.tailingsReturn', '2番還元エレベータ（右）', 'grain', 'interior', 'body',
    boxRange([sh.tailingsReturn.x - sh.tailingsReturn.size[0] / 2, sh.tailingsReturn.x + sh.tailingsReturn.size[0] / 2], sh.tailingsReturn.y,
      [sh.tailingsReturn.z - sh.tailingsReturn.size[1] / 2, sh.tailingsReturn.z + sh.tailingsReturn.size[1] / 2]), E, 'R-23');

  // ---------- グレインタンク ----------
  const tk = s.tank;
  add('tank', 'グレインタンク', 'tank', 'exterior', 'body', boxRange(tk.x, tk.y, [-tk.halfWidth, tk.halfWidth]), D, 'R-02, R-12');
  const fl = tk.flap;
  const top = tk.y[1];
  add('tank.flapL', 'タンクフラップ（左）', 'tank', 'exterior', 'flapL',
    boxRange(tk.x, [top, top + fl.t], [-tk.halfWidth, -tk.halfWidth + fl.height]), E, '03 §2');
  add('tank.flapR', 'タンクフラップ（右）', 'tank', 'exterior', 'flapR',
    boxRange(tk.x, [top, top + fl.t], [tk.halfWidth - fl.height, tk.halfWidth]), E, '03 §2');
  add('tank.flapF', 'タンクフラップ（前）', 'tank', 'exterior', 'flapF',
    boxRange([tk.x[0], tk.x[0] - fl.height], [top, top + fl.t], [-fl.frontRearHalfWidth, fl.frontRearHalfWidth]), E, '03 §2');
  add('tank.flapB', 'タンクフラップ（後）', 'tank', 'exterior', 'flapB',
    boxRange([tk.x[1], tk.x[1] + fl.height], [top, top + fl.t], [-fl.frontRearHalfWidth, fl.frontRearHalfWidth]), E, '03 §2');
  add('tank.bubbleUp', 'バブルアップオーガ', 'grain', 'interior', 'body',
    cyl([tk.bubbleUp.x, tk.bubbleUp.y[0], tk.bubbleUp.z], [tk.bubbleUp.x, tk.bubbleUp.y[1], tk.bubbleUp.z], tk.bubbleUp.radius), E, '03 §1');
  add('tank.crossAuger', 'タンク底クロスオーガ', 'grain', 'interior', 'body',
    cyl([tk.crossAuger.x[0], tk.crossAuger.y, 0], [tk.crossAuger.x[1], tk.crossAuger.y, 0], tk.crossAuger.radius), E, 'R-23');

  // ---------- 排出オーガ ----------
  const u = s.unload;
  const elbow = unloadElbow(s);
  add('unload.vertical', '排出オーガ縦部', 'unload', 'exterior', 'body', cyl(u.base, elbow, u.radius), D, 'R-05 軸を前方へ 12°');
  const tip: Vec3 = [elbow[0] + u.tubeLength, elbow[1], elbow[2]];
  add('unload.tube', '排出オーガ横管', 'unload', 'exterior', 'auger', cyl(elbow, tip, u.radius), S, '03 §3 26 ft');
  const sx = tip[0] - u.spout.radius;
  add('unload.spout', 'スパウト', 'unload', 'exterior', 'auger', cyl([sx, tip[1], tip[2]], [sx, tip[1] - u.spout.drop, tip[2]], u.spout.radius), E, '03 §3');

  // ---------- エンジン ----------
  const en = s.engine;
  add('engine', 'エンジン（横置き）', 'engine', 'interior', 'body', { kind: 'box', center: en.center, size: en.size }, E, '04 §4');
  const engineTop = en.center[1] + en.size[1] / 2;
  add('engine.exhaust', '排気スタック', 'engine', 'exterior', 'body',
    cyl([en.exhaust.x, engineTop, en.exhaust.z], [en.exhaust.x, en.exhaust.top, en.exhaust.z], en.exhaust.radius), E, 'R-10');
  add('engine.screen', 'ロータリースクリーン（右）', 'engine', 'exterior', 'body',
    cyl([en.rotaryScreen.x, en.rotaryScreen.y, en.rotaryScreen.z], [en.rotaryScreen.x, en.rotaryScreen.y, en.rotaryScreen.z + en.rotaryScreen.t], en.rotaryScreen.radius), E, '04 §4 Case IH は右側面');

  // ---------- 残渣処理 ----------
  const rs = s.residue;
  add('residue.chopper', 'ストローチョッパ', 'residue', 'interior', 'body',
    cyl([rs.chopper.x, rs.chopper.y, -rs.chopper.halfWidth], [rs.chopper.x, rs.chopper.y, rs.chopper.halfWidth], rs.chopper.radius), S, '03 §4');
  for (const side of [-1, 1] as const) {
    const L = side < 0 ? 'L' : 'R';
    const cs = rs.chaffSpreader;
    add(`residue.chaff${L}`, `チャフスプレッダ（${side < 0 ? '左' : '右'}）`, 'residue', 'interior', 'body',
      cyl([cs.x, cs.y - cs.t / 2, side * cs.z], [cs.x, cs.y + cs.t / 2, side * cs.z], cs.radius), E, 'R-30');
    const ss = rs.strawSpreader;
    add(`residue.spreader${L}`, `ストロースプレッダ（${side < 0 ? '左' : '右'}）`, 'residue', 'interior', 'body',
      cyl([ss.x, ss.y - ss.t / 2, side * ss.z], [ss.x, ss.y + ss.t / 2, side * ss.z], ss.radius), S, '03 §4 φ0.80');
  }

  return parts;
}

/** 排出オーガのエルボ位置（縦軸の上端）。 */
export function unloadElbow(s: Spec = spec): Vec3 {
  const u = s.unload;
  const r = (u.axisTiltDeg * Math.PI) / 180;
  return [u.base[0] + u.verticalLength * Math.sin(r), u.base[1] + u.verticalLength * Math.cos(r), u.base[2]];
}

/**
 * 意図的に接している部品の組（取り付け・内包・連結）。それ以外の重なりはすべて干渉とみなす。
 * 部品 ID の完全一致。末尾が * のものは前方一致。
 */
export const ALLOWED_CONTACTS: ReadonlyArray<readonly [string, string, string]> = [
  ['axle.front', 'wheel.front*', '車軸とハブ'],
  ['axle.front', 'panel.lower*', '車軸が側板を貫通'],
  ['thresher.rotor', 'thresher.cage', 'ロータはケージに内包'],
  ['cab.gps', 'cab', 'ルーフに取り付け'],
  ['cab.mirror*', 'cab', 'キャブに取り付け'],
  ['tank', 'panel.lower*', 'タンクは側板の上に載る'],
  ['tank.flap*', 'tank', 'フラップはタンク上縁のヒンジ'],
  ['tank.bubbleUp', 'tank', 'タンク内部'],
  ['tank.crossAuger', 'tank', 'タンク内部'],
  ['unload.vertical', 'unload.tube', 'エルボで連結'],
  ['unload.spout', 'unload.tube', '先端で連結'],
  ['feeder.face', 'feeder.housing', 'フェースはフィーダ先端'],
  ['feeder.face', 'header.back', 'ヘッダはフェースに掛ける'],
  ['feeder.housing', 'header.back', 'フェースのチルト時にフィーダ先端と背板が接する'],
  ['header.deck', 'header.back', 'ヘッダ本体'],
  ['header.deck', 'header.cutterbar', 'ヘッダ本体'],
  ['grain.cleanAuger', 'panel.lowerR', '右側板を貫通してエレベータへ'],
  ['grain.cleanAuger', 'grain.elevator', 'エレベータ下端で連結'],
  ['grain.tailingsAuger', 'panel.lowerR', '右側板を貫通して還元エレベータへ'],
  ['grain.tailingsAuger', 'grain.tailingsReturn', '還元エレベータ下端で連結'],
  ['grain.elevator', 'panel.lowerR', '右側板に沿って取り付け'],
  ['grain.tailingsReturn', 'panel.lowerR', '右側板に沿って取り付け'],
  ['shoe.chafferExt', 'shoe.chaffer', 'チャッファの延長'],
  ['engine.exhaust', 'engine', 'エンジン上面から立ち上がる'],
  ['engine.screen', 'panel.engineR', '右側板の開口に取り付け'],
  ['panel.engineHood', 'panel.engine*', 'フードは側板の上に載る'],
  ['panel.engineHood', 'engine', 'フードはエンジンの直上'],
  ['panel.engineHood', 'engine.exhaust', '排気スタックがフードを貫通'],
  ['header.divider*', 'header.cutterbar', 'デバイダはカッターバー端に取り付け'],
  ['header.divider*', 'header.deck', 'デバイダはデッキ端に取り付け'],
  ['header.divider*', 'header.end*', 'デバイダはエンドシールドの先端'],
  ['header.end*', 'header.deck', 'エンドシールドはデッキ端に立つ'],
  ['header.end*', 'header.back', 'エンドシールドは背板に接する'],
  ['header.reelArm*', 'header.back', 'リールアームの根元は背板上端のピボット'],
];
