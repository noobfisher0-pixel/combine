import {
  BoxGeometry,
  ConeGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { FLOWS, MAX_PARTICLES, type FlowId, type FlowSystem } from '../flow/system';
import { spec } from '../spec/spec';

/** 流れごとの粒子の形と色（docs/research/05-wheat.md の熟期の色）。穀粒は見えるように実物（3〜7 mm）より大きく描く */
const LOOK: Record<FlowId, { geo: () => BufferGeometry; color: number; name: string }> = {
  crop: { geo: () => new BoxGeometry(0.14, 0.012, 0.012), color: 0xc9a35a, name: '刈った小麦' },
  straw: { geo: () => new BoxGeometry(0.09, 0.008, 0.008), color: 0xdcc48a, name: 'わら' },
  grain: { geo: () => new IcosahedronGeometry(0.012, 0), color: 0xe0ae4e, name: '穀粒' },
  chaff: { geo: () => new BoxGeometry(0.025, 0.002, 0.018), color: 0xede6d2, name: '籾殻' },
  tailings: { geo: () => new IcosahedronGeometry(0.012, 0), color: 0xe07b39, name: '2 番' },
  unload: { geo: () => new IcosahedronGeometry(0.016, 0), color: 0xe0ae4e, name: '排出' },
};
export const FLOW_NAMES: Record<FlowId, string> = Object.fromEntries(FLOWS.map((f) => [f, LOOK[f].name])) as Record<FlowId, string>;
export const FLOW_COLORS: Record<FlowId, number> = Object.fromEntries(FLOWS.map((f) => [f, LOOK[f].color])) as Record<FlowId, number>;

/** 粒子（InstancedMesh、流れごとに 1 つ）とタンクの穀粒の山（R-29：角柱＋四角錐の屋根）。 */
export class FlowView {
  readonly root = new Group();
  private meshes = new Map<FlowId, InstancedMesh>();
  private pile: Mesh;
  private roof: Mesh;
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private one = new Vector3(1, 1, 1);

  constructor(private flow: FlowSystem) {
    this.root.name = 'crop-flow';
    for (const f of FLOWS) {
      const mat = new MeshStandardMaterial({ color: LOOK[f].color, roughness: 0.7, metalness: 0 });
      const im = new InstancedMesh(LOOK[f].geo(), mat, MAX_PARTICLES[f]);
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false; // バウンディング球が自動で更新されないため（R-19）
      im.raycast = () => {};
      im.name = `flow:${f}`;
      this.meshes.set(f, im);
      this.root.add(im);
    }
    const tk = spec.tank;
    const grainMat = new MeshStandardMaterial({ color: 0xd9a441, roughness: 0.9 });
    const w = Math.abs(tk.x[0] - tk.x[1]) - 0.1;
    const d = tk.halfWidth * 2 - 0.1;
    this.pile = new Mesh(new BoxGeometry(w, 1, d), grainMat);
    this.roof = new Mesh(new ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4), grainMat);
    this.roof.scale.set(w, 1, d);
    for (const m of [this.pile, this.roof]) {
      m.position.x = (tk.x[0] + tk.x[1]) / 2;
      m.raycast = () => {};
      this.root.add(m);
    }
  }

  sync() {
    for (const f of FLOWS) {
      const im = this.meshes.get(f)!;
      const list = this.flow.particles[f];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        this.e.set(p.spin * 6.28, p.spin * 17.3, p.spin * 29.1);
        this.q.setFromEuler(this.e);
        im.setMatrixAt(i, this.m.compose(p.pos, this.q, this.one));
      }
      im.count = list.length;
      im.instanceMatrix.needsUpdate = true;
    }
    // 山：底（V 底の上）から上面まで。上に安息角 25° の屋根を載せる
    const yb = spec.tank.y[0] + 0.04;
    const top = this.flow.pileTopY();
    const h = Math.max(0, top - yb);
    const show = this.flow.tankMass > 1;
    this.pile.visible = this.roof.visible = show;
    this.pile.scale.y = Math.max(h, 1e-3);
    this.pile.position.y = yb + h / 2;
    const roofH = Math.min(0.35, h * 0.5);
    this.roof.scale.y = Math.max(roofH, 1e-3);
    this.roof.position.y = top + roofH / 2;
  }
}
