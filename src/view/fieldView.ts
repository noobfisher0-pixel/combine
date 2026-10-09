/**
 * 小麦の圃場の描画（design §16.5・§21、M6）。
 *
 * - セルの状態（立毛・刈り株・倒伏）・草丈・倒れた向き・刈り株の高さを 1 枚のデータテクスチャに入れ、
 *   株（1 セル = 1 株）は頂点シェーダでそこから形を決める。状態が変わってもテクスチャを書き換えるだけ。
 * - 株は 2 段の詳細度：カメラの近く（LOD_R 以内）は茎・穂・芒・葉を 1 本ずつ作った株、遠くは十字の板 2 枚と穂の面。
 *   切り替えは株ごとにシェーダで行い（範囲外の株はつぶす）、近い株は 5 m 角のまとまりごとに描く。
 * - 機体は原点に固定し、圃場（root）を機体の位置の逆変換で動かす（§5.1）。シェーダのワールド座標 ＝ 機体座標。
 * - リールの前の株は後ろへ、デバイダの外側の株は外へ傾け、風で穂先を揺らす（見た目だけ。判定は src/field）。
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  RGBAFormat,
  Sphere,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { FLAT, CUT, rng, type WheatField } from '../field/field';
import type { HarvestScenario } from '../field/scenario';
import { spec } from '../spec/spec';

/** 近い株を描く距離 [m] */
export const LOD_R = 9;
const CHUNK = 20; // セル（5 m）

// ------------------------------------------------------------ 株の形（y は 0〜1 に正規化、シェーダで草丈を掛ける）

interface GeoBuf {
  pos: number[];
  col: number[];
  part: number[];
  idx: number[];
}

/** 中心線に沿った帯（幅 w(t)）。face は帯の向き（水平面での角度） */
function ribbon(b: GeoBuf, center: (t: number) => [number, number, number], width: (t: number) => number, face: number, color: (t: number) => [number, number, number], part: number, segs: number) {
  const base = b.pos.length / 3;
  const ux = Math.cos(face);
  const uz = Math.sin(face);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const [x, y, z] = center(t);
    const w = width(t) / 2;
    const c = color(t);
    b.pos.push(x - ux * w, y, z - uz * w, x + ux * w, y, z + uz * w);
    b.col.push(...c, ...c);
    b.part.push(part, part);
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 2;
    b.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

function toGeometry(b: GeoBuf): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(b.col, 3));
  g.setAttribute('aPart', new Float32BufferAttribute(b.part, 1));
  g.setIndex(b.idx);
  return g;
}

const mix3 = (a: number[], c: number[], t: number): [number, number, number] => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
// 熟期の小麦（05 §1：麦わら色〜黄金色）。照明（太陽＋半球光＋環境光、ACES）で明るく出るので暗めに置く
const STEM_LO = [0.24, 0.2, 0.11];
const STEM_HI = [0.6, 0.47, 0.24];
const HEAD = [0.62, 0.44, 0.17];
const AWN = [0.68, 0.56, 0.32];
const LEAF = [0.46, 0.38, 0.2];

/** 近くの株：茎 7 本。茎（細い帯）、穂（十字の紡錘）、芒、枯れた葉 1 枚。部品番号 0 茎 / 1 葉 / 2 穂・芒 */
export function nearClumpGeometry(seed = 3): BufferGeometry {
  const r = rng(seed);
  const b: GeoBuf = { pos: [], col: [], part: [], idx: [] };
  const head = spec.crop.wheat.headLength / spec.crop.wheat.height; // 正規化した穂の長さ
  for (let i = 0; i < 7; i++) {
    const bx = (r() - 0.5) * 0.16;
    const bz = (r() - 0.5) * 0.16;
    const hf = 0.88 + r() * 0.12;
    const lx = (r() - 0.5) * 0.1;
    const lz = (r() - 0.5) * 0.1;
    const top = hf - head;
    const at = (y: number): [number, number, number] => {
      const t = y / hf;
      return [bx + lx * t * t, y, bz + lz * t * t];
    };
    const face = r() * Math.PI;
    ribbon(b, (t) => at(t * top), (t) => 0.008 - 0.003 * t, face, (t) => mix3(STEM_LO, STEM_HI, t), 0, 4);
    const tone = 0.92 + r() * 0.12;
    const hc = HEAD.map((v) => v * tone);
    for (const f of [face, face + Math.PI / 2]) {
      ribbon(b, (t) => at(top + t * head), (t) => 0.004 + 0.014 * Math.sin(Math.PI * (0.12 + 0.8 * t)), f, (t) => mix3(hc, STEM_HI, 0.15 * (1 - t)), 2, 4);
    }
    // 芒：穂先から上へ広がる板
    ribbon(b, (t) => { const p = at(hf); return [p[0] + lx * 0.3 * t, hf + 0.075 * t, p[2] + lz * 0.3 * t]; }, (t) => 0.006 + 0.02 * t, face + Math.PI / 4, () => AWN as [number, number, number], 2, 1);
    // 葉：茎の下の方から外へ垂れる
    const la = r() * Math.PI * 2;
    const ly = top * (0.25 + r() * 0.2);
    ribbon(
      b,
      (t) => { const p = at(ly); return [p[0] + Math.cos(la) * 0.16 * t, ly + 0.12 * t - 0.16 * t * t, p[2] + Math.sin(la) * 0.16 * t]; },
      (t) => 0.014 * Math.sin(Math.PI * (0.1 + 0.85 * t)),
      la + Math.PI / 2,
      (t) => mix3(LEAF, STEM_LO, 0.3 * t),
      1,
      3,
    );
  }
  return toGeometry(b);
}

/** 遠くの株：十字の板 2 枚（下は暗く、上は麦わら色、上端は穂）と、穂の高さの水平の面（真上から見えるように） */
export function farClumpGeometry(): BufferGeometry {
  const b: GeoBuf = { pos: [], col: [], part: [], idx: [] };
  // [高さ, 色, 部品, 半幅]：根元は細く、穂の高さで広がり、上端は少しすぼむ（株の輪郭）
  const rows: Array<[number, number[], number, number]> = [[0, STEM_LO, 0, 0.09], [0.55, mix3(STEM_LO, STEM_HI, 0.6), 0, 0.15], [0.86, STEM_HI, 0, 0.19], [1, HEAD, 2, 0.13]];
  for (const face of [0.4, 0.4 + Math.PI / 2]) {
    const base = b.pos.length / 3;
    for (const [y, c, part, w] of rows) {
      const ux = Math.cos(face) * w;
      const uz = Math.sin(face) * w;
      b.pos.push(-ux, y, -uz, ux, y, uz);
      b.col.push(...c, ...c);
      b.part.push(part, part);
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const a = base + i * 2;
      b.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const base = b.pos.length / 3;
  const s = 0.13;
  for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) {
    b.pos.push(x, 0.94, z);
    b.col.push(...HEAD);
    b.part.push(2);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return toGeometry(b);
}

// ------------------------------------------------------------ シェーダ

const COMMON = /* glsl */ `
attribute float aCell;
attribute float aPart;
uniform sampler2D uState;
uniform float uNx;
uniform float uCell;
uniform float uTime;
uniform float uLodR;
uniform vec4 uKnife; // 刈刃の x、刈幅の半分、ヘッダを下げているか、リールが届く距離
uniform vec2 uBack;  // 機体の後ろ向き（圃場座標）
uniform vec2 uRight; // 機体の右向き（圃場座標）
float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
`;

const BEGIN = /* glsl */ `
float ck = floor((aCell + 0.5) / uNx);
float ci = aCell - ck * uNx;
vec4 st = texelFetch(uState, ivec2(int(ci), int(ck)), 0);
float state = floor(st.r * 255.0 + 0.5);
float h = st.g * 1.5;
float r1 = hash1(aCell);
float r2 = hash1(aCell + 17.31);
float r3 = hash1(aCell * 1.73 + 3.1);
vec2 cellPos = (vec2(ci, ck) + 0.5) * uCell + (vec2(r1, r2) - 0.5) * uCell * 0.5;
vec3 wc = (modelMatrix * vec4(cellPos.x, 0.0, cellPos.y, 1.0)).xyz;
float camDist = distance(wc, cameraPosition);
vec3 p = position;
float yaw = r3 * 6.2831853;
p.xz = mat2(cos(yaw), sin(yaw), -sin(yaw), cos(yaw)) * p.xz;
p.y *= h * (0.94 + 0.12 * r1);
#ifdef USE_COLOR
vColor.rgb *= 0.86 + 0.24 * r2;
#endif
bool isCut = state > 0.5 && state < 1.5;
if (isCut) {
  float stub = st.a * 0.6;
  if (aPart > 0.5) p = vec3(0.0, 0.0, 0.0);
  else p.y = min(p.y, stub);
#ifdef USE_COLOR
  vColor.rgb = mix(vColor.rgb, vec3(0.56, 0.47, 0.3), 0.5);
#endif
}
// 曲げ：風、リール、デバイダ、倒伏
float th = 0.035 + 0.03 * (sin(uTime * 1.3 + cellPos.x * 0.35 + cellPos.y * 0.21) * 0.6 + sin(uTime * 2.3 + cellPos.x * 0.9 - cellPos.y * 0.4) * 0.4);
vec2 dir = normalize(vec2(0.8, 0.6));
if (state > 1.5) {
  th = 1.3 + 0.2 * r1;
  float a = st.b * 6.2831853 + (r2 - 0.5) * 0.6;
  dir = vec2(cos(a), sin(a));
} else if (!isCut && uKnife.z > 0.5) {
  float ax = wc.x - uKnife.x;
  float az = abs(wc.z);
  if (az < uKnife.y && ax > -0.15 && ax < uKnife.w) {
    float f = 1.0 - clamp(ax / uKnife.w, 0.0, 1.0);
    th = mix(th, 0.6, f);
    dir = uBack;
  } else if (az >= uKnife.y && az < uKnife.y + 0.5 && ax > -2.0 && ax < 0.6) {
    float f = 1.0 - (az - uKnife.y) / 0.5;
    th = 0.4 * f;
    dir = uRight * sign(wc.z);
  }
}
if (isCut) th = 0.0;
float L = max(h, 0.05);
if (th > 0.001) {
  float a = th * p.y / L;
  float rr = L / th;
  p.xz += dir * rr * (1.0 - cos(a));
  p.y = rr * sin(a);
}
vec3 transformed = vec3(cellPos.x, 0.0, cellPos.y) + p;
#ifdef LOD_NEAR
if (camDist > uLodR) transformed = vec3(cellPos.x, -2.0, cellPos.y);
#else
if (camDist <= uLodR) transformed = vec3(cellPos.x, -2.0, cellPos.y);
#endif
`;

interface Uniforms {
  uState: { value: DataTexture };
  uNx: { value: number };
  uCell: { value: number };
  uTime: { value: number };
  uLodR: { value: number };
  uKnife: { value: Vector4 };
  uBack: { value: Vector2 };
  uRight: { value: Vector2 };
  /** 1 = 株を描かない（地面の色だけで立毛を表す） */
  uLow: { value: number };
}

function cropMaterial(u: Uniforms, near: boolean): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  m.defines = near ? { LOD_NEAR: '' } : {};
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = COMMON + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', BEGIN);
  };
  m.customProgramCacheKey = () => (near ? 'crop-near' : 'crop-far');
  return m;
}

/** 地面：圃場の中はセルの状態で色を変える（立毛の下は陰の麦わら色、刈り跡は刈り株、倒伏は明るい麦わら）。外は枕地 */
function groundMaterial(u: Uniforms, size: [number, number]): MeshLambertMaterial {
  // 地面は真上からの光をまともに受けて白く飛ぶので、材質の色で全体を落とす
  const m = new MeshLambertMaterial({ color: 0x8c8c8c });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uSize: { value: new Vector2(...size) } });
    sh.vertexShader = 'varying vec2 vF;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvF = position.xz;');
    sh.fragmentShader =
      'varying vec2 vF;\nuniform sampler2D uState;\nuniform float uCell;\nuniform float uLow;\nuniform vec2 uSize;\nfloat hash2(vec2 p){return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453);}\n' +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */ `
        vec3 col;
        float n = hash2(floor(vF * 8.0)) * 0.12;
        float rowStripe = 0.06 * sin(vF.y * 33.07);
        if (vF.x < 0.0 || vF.y < 0.0 || vF.x >= uSize.x || vF.y >= uSize.y) {
          float far = smoothstep(26.0, 34.0, max(max(-vF.x, vF.x - uSize.x), max(-vF.y, vF.y - uSize.y)));
          col = mix(vec3(0.40, 0.34, 0.22) + rowStripe * 0.5, vec3(0.24, 0.27, 0.17), far) + n * 0.5;
        } else {
          ivec2 c = ivec2(floor(vF / uCell));
          vec4 st = texelFetch(uState, c, 0);
          float s = floor(st.r * 255.0 + 0.5);
          if (s < 0.5) col = mix(vec3(0.22, 0.17, 0.09), vec3(0.62, 0.46, 0.2), uLow) + n * 0.4;
          else if (s < 1.5) col = vec3(0.5, 0.42, 0.27) + rowStripe + n * 0.6;
          else col = vec3(0.62, 0.52, 0.32) + n * 0.5;
        }
        diffuseColor.rgb *= col;
        `,
      );
  };
  m.customProgramCacheKey = () => 'field-ground';
  return m;
}

// ------------------------------------------------------------ 本体

export class FieldView {
  /** 圃場座標の入れ物（機体座標へ逆変換して置く） */
  readonly root = new Group();
  /** 運搬車（機体座標） */
  readonly cart = new Group();
  readonly uniforms: Uniforms;
  private data: Uint8Array;
  private tex: DataTexture;
  private lastVersion = -1;
  private chunks: Array<{ mesh: Mesh; center: Vector3 }> = [];
  private far: Mesh;
  private m = new Matrix4();
  private inv = new Matrix4();
  private tmp = new Vector3();
  /** 描いている近い株のまとまりの数（テスト用） */
  nearChunks = 0;

  constructor(private field: WheatField) {
    this.root.name = 'field';
    this.root.matrixAutoUpdate = false;
    const f = field;
    this.data = new Uint8Array(f.nx * f.nz * 4);
    this.tex = new DataTexture(this.data, f.nx, f.nz, RGBAFormat, UnsignedByteType);
    this.uniforms = {
      uState: { value: this.tex },
      uNx: { value: f.nx },
      uCell: { value: f.cell },
      uTime: { value: 0 },
      uLodR: { value: LOD_R },
      uKnife: { value: new Vector4(5.3, spec.header.width / 2, 0, 0.8) },
      uBack: { value: new Vector2(-1, 0) },
      uRight: { value: new Vector2(0, 1) },
      uLow: { value: 0 },
    };
    this.syncTexture();

    // 遠くの株：圃場全体を 1 回で描く
    const farGeo = this.instanced(farClumpGeometry(), Array.from({ length: f.nx * f.nz }, (_, i) => i));
    this.far = new Mesh(farGeo, cropMaterial(this.uniforms, false));
    this.far.frustumCulled = false;
    this.far.name = 'field:far';
    this.root.add(this.far);

    // 近い株：5 m 角のまとまり
    const nearBase = nearClumpGeometry();
    const nearMat = cropMaterial(this.uniforms, true);
    for (let k0 = 0; k0 < f.nz; k0 += CHUNK) {
      for (let i0 = 0; i0 < f.nx; i0 += CHUNK) {
        const cells: number[] = [];
        for (let k = k0; k < Math.min(f.nz, k0 + CHUNK); k++) for (let i = i0; i < Math.min(f.nx, i0 + CHUNK); i++) cells.push(k * f.nx + i);
        const g = this.instanced(nearBase, cells);
        const center = new Vector3((i0 + CHUNK / 2) * f.cell, 0.5, (k0 + CHUNK / 2) * f.cell);
        g.boundingSphere = new Sphere(center.clone(), (CHUNK * f.cell) / Math.SQRT2 + 1.5);
        const mesh = new Mesh(g, nearMat);
        mesh.visible = false;
        mesh.name = 'field:near';
        this.chunks.push({ mesh, center });
        this.root.add(mesh);
      }
    }

    // 地面：圃場＋枕地、その外の広い地面
    const hl = spec.field.headland;
    const ground = new Mesh(this.quad(-hl - 60, -hl - 60, f.length + hl + 60, f.width + hl + 60), groundMaterial(this.uniforms, [f.length, f.width]));
    ground.name = 'field:ground';
    ground.position.y = -0.003;
    ground.updateMatrix();
    ground.matrixAutoUpdate = false;
    this.root.add(ground);

    this.buildCart();
  }

  private quad(x0: number, z0: number, x1: number, z1: number): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1], 3));
    g.setAttribute('normal', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    return g;
  }

  private instanced(base: BufferGeometry, cells: number[]): InstancedBufferGeometry {
    const g = new InstancedBufferGeometry();
    g.index = base.index;
    for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
    g.setAttribute('aCell', new InstancedBufferAttribute(new Float32Array(cells), 1));
    g.instanceCount = cells.length;
    return g;
  }

  /** 運搬車（トラクタ＋グレインカート）。スパウトの下を機体と並んで走る */
  private buildCart() {
    const c = spec.field.cart;
    const body = new MeshStandardMaterial({ color: 0x4f6470, roughness: 0.6, metalness: 0.2 });
    const dark = new MeshStandardMaterial({ color: 0x23282a, roughness: 0.9 });
    const tractorMat = new MeshStandardMaterial({ color: 0x8a8f86, roughness: 0.55, metalness: 0.15 });
    const glass = new MeshStandardMaterial({ color: 0x2c3a40, roughness: 0.2, metalness: 0.3 });
    const add = (geo: BufferGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number) => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      this.cart.add(m);
      return m;
    };
    // カート：ホッパ（上が広い箱）、車輪 4 本
    add(new BoxGeometry(5.2, 1.0, c.halfWidth * 1.6), body, 0, 1.45, 0);
    add(new BoxGeometry(6.0, 1.1, c.halfWidth * 2), body, 0, c.top - 0.55, 0);
    for (const x of [-1.2, 1.2]) for (const z of [-1, 1]) add(new CylinderGeometry(0.75, 0.75, 0.5, 20).rotateX(Math.PI / 2), dark, x, 0.75, z * (c.halfWidth - 0.15));
    add(new BoxGeometry(2.4, 0.15, 0.15), dark, 4.0, 0.9, 0);
    // トラクタ
    add(new BoxGeometry(2.6, 1.0, 1.1), tractorMat, 6.6, 1.5, 0);
    add(new BoxGeometry(1.5, 1.4, 1.5), glass, 5.9, 2.65, 0);
    for (const [x, r] of [[5.5, 0.85], [7.5, 0.55]] as const) for (const z of [-1, 1]) add(new CylinderGeometry(r, r, 0.45, 20).rotateX(Math.PI / 2), dark, x, r, z * 1.0);
    this.cart.name = 'grain-cart';
    this.cart.visible = false;
  }

  private syncTexture() {
    const f = this.field;
    if (f.version === this.lastVersion) return;
    this.lastVersion = f.version;
    const d = this.data;
    const n = f.nx * f.nz;
    for (let j = 0; j < n; j++) {
      const o = j * 4;
      const s = f.state[j];
      d[o] = s;
      d[o + 1] = Math.min(255, Math.round((f.height[j] / 1.5) * 255));
      d[o + 2] = s === FLAT ? Math.round((((f.flatDir[j] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 255) : 0;
      d[o + 3] = s === CUT ? Math.min(255, Math.round((f.stubble[j] / 0.6) * 255)) : 0;
    }
    this.tex.needsUpdate = true;
  }

  /** 毎フレーム：機体の位置で圃場を置き直し、状態テクスチャ・シェーダの値・近い株のまとまりを更新する */
  update(sc: HarvestScenario, cameraWorld: Vector3, time: number) {
    const pl = sc.place;
    // 機体 → 圃場：平行移動 (x, 0, z) × Y 軸回り psi
    this.m.makeRotationY(pl.psi).setPosition(pl.x, 0, pl.z);
    this.inv.copy(this.m).invert();
    this.root.matrix.copy(this.inv);
    this.root.matrixWorldNeedsUpdate = true;
    this.syncTexture();

    const u = this.uniforms;
    u.uTime.value = time;
    const reelFront = spec.header.reel.x + spec.header.reel.radius + sc.pose.reelSlide;
    u.uKnife.value.set(sc.knifeX, spec.header.width / 2, sc.headerDown && sc.knifeY < 0.5 ? 1 : 0, Math.max(0.6, reelFront - sc.knifeX + 0.4));
    const c = Math.cos(pl.psi);
    const s = Math.sin(pl.psi);
    u.uBack.value.set(-c, s);
    u.uRight.value.set(s, c);

    // 近い株のまとまり：カメラ（圃場座標）から LOD_R ＋ まとまりの半径 以内
    const cam = this.tmp.copy(cameraWorld).applyMatrix4(this.m);
    const reach = LOD_R + (CHUNK * this.field.cell) / Math.SQRT2 + 0.5;
    let n = 0;
    for (const ch of this.chunks) {
      ch.mesh.visible = this.quality === 'high' && ch.center.distanceTo(cam) < reach;
      if (ch.mesh.visible) n++;
    }
    this.nearChunks = n;

    // 運搬車：スパウトの下（機体座標）
    this.cart.visible = sc.unloadReq && sc.laneClear;
    this.cart.position.set(sc.spoutTip.x, 0, sc.spoutTip.z);
  }

  setVisible(on: boolean) {
    this.root.visible = on;
    if (!on) this.cart.visible = false;
  }

  /** 詳細 = 株を描く、軽量 = 地面の色だけ（ソフトウェア描画や遅い端末向け） */
  setQuality(q: 'high' | 'low') {
    this.quality = q;
    this.uniforms.uLow.value = q === 'low' ? 1 : 0;
    this.far.visible = q === 'high';
    if (q === 'low') for (const ch of this.chunks) ch.mesh.visible = false;
  }
  quality: 'high' | 'low' = 'high';

  /** 新しい圃場に差し替える（シナリオのやり直し） */
  setField(field: WheatField) {
    this.field = field;
    this.lastVersion = -1;
    this.syncTexture();
  }
}

export const FIELD_SKY = new Color(0x9fb3b8);
