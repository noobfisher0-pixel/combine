/**
 * 演出：刈っている間の土ぼこりと籾殻の煙（docs/game-design.md §11 G4）。
 * 機体座標（機体は原点に固定）。後ろのスプレッダと前の刈刃から出て、地速で後ろへ流れながら広がり、薄くなって消える。
 * 粒ごとに大きさと透明度を変えるので、点（Points）を小さなシェーダで描く。
 */
import { BufferAttribute, BufferGeometry, Color, NormalBlending, Points, ShaderMaterial } from 'three';
import { spec } from '../../spec/spec';

const N = 160;

interface Puff {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; size: number; grow: number; alpha: number;
}

export class Dust {
  readonly points: Points;
  private pos = new Float32Array(N * 3);
  private size = new Float32Array(N);
  private alpha = new Float32Array(N);
  private puffs: Puff[] = [];
  private accRear = 0;
  private accFront = 0;
  private seed = 9;
  private mat: ShaderMaterial;

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    this.mat = new ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uColor: { value: new Color(0xc9b48a) } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aSize;
        attribute float aAlpha;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
          vA = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(uColor, vA * (1.0 - d) * (1.0 - d));
        }`,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'dust';
  }

  private rand() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /** 画面の高さと視野角から、1 m が画面で何画素か（距離 1 m のとき） */
  setViewport(heightPx: number, fovDeg: number) {
    this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  get count() {
    return this.puffs.length;
  }

  /**
   * dt：ゲームの時計 [s]。v：地速 [m/s]。feed：刈っている量（本物の kg/s、0 なら出さない）
   */
  update(dt: number, v: number, feed: number) {
    if (dt > 0 && feed > 0.5) {
      const r = this.rand.bind(this);
      this.accRear += Math.min(30, feed * 1.6) * dt;
      this.accFront += Math.min(14, feed * 0.8) * dt;
      while (this.accRear >= 1 && this.puffs.length < N) {
        this.accRear -= 1;
        this.puffs.push({
          x: spec.body.rear - 0.3, y: 0.9 + r() * 0.4, z: (r() - 0.5) * 3,
          vx: -0.6 - r() * 0.8, vy: 0.25 + r() * 0.35, vz: (r() - 0.5) * 2.4,
          age: 0, life: 2.2 + r() * 1.6, size: 1.2, grow: 1.4 + r(), alpha: 0.32,
        });
      }
      while (this.accFront >= 1 && this.puffs.length < N) {
        this.accFront -= 1;
        this.puffs.push({
          x: spec.header.cutterbar.x[1] - 0.2, y: 0.35 + r() * 0.3, z: (r() - 0.5) * (spec.header.width - 1),
          vx: 0.2, vy: 0.15 + r() * 0.2, vz: (r() - 0.5) * 0.6,
          age: 0, life: 1.0 + r() * 0.8, size: 0.6, grow: 0.8, alpha: 0.18,
        });
      }
    }
    // 動かす：空気は地面と一緒に後ろへ（機体座標で −v）
    const keep: Puff[] = [];
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.x += (p.vx - v) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      keep.push(p);
    }
    this.puffs = keep;
    for (let i = 0; i < N; i++) {
      const p = this.puffs[i];
      if (!p) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      const t = p.age / p.life;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.size + p.grow * p.age;
      this.alpha[i] = p.alpha * Math.min(1, t * 6) * (1 - t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}
