import {
  AlwaysStencilFunc,
  BackSide,
  DecrementWrapStencilOp,
  DoubleSide,
  FrontSide,
  IncrementWrapStencilOp,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  Plane,
  PlaneGeometry,
  ReplaceStencilOp,
  Vector3,
  type Material,
  type Object3D,
} from 'three';

/**
 * 断面表示（design §8.1）。z = 0 の平面で切り、左半分（z ≤ 0）を残す。
 * 切断面のキャップはステンシル方式：切る対象の閉じたメッシュごとに
 * 裏面で +1、表面で −1 を書き、値が 0 でない画素にだけキャップを描く。
 * 重なり合う立体でも和が 0 にならないので、キャップは乱れない。
 * 前提：WebGLRenderer({ stencil: true })、renderer.localClippingEnabled = true。
 *
 * stencilTargets: 閉じた立体（キャップあり）／ clipOnly: 切るだけ（ガラス・インスタンスなど）
 */
export class SectionView {
  readonly plane = new Plane(new Vector3(0, 0, -1), 0);
  readonly cap: Mesh;
  private helpers: Mesh[] = [];
  private materials = new Set<Material>();
  private enabled = false;

  constructor(stencilTargets: Mesh[], clipOnly: Mesh[] = [], capColor = 0xd9534f) {
    const capMat = new MeshBasicMaterial({
      color: capColor,
      side: DoubleSide,
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: NotEqualStencilFunc,
      stencilFail: ReplaceStencilOp,
      stencilZFail: ReplaceStencilOp,
      stencilZPass: ReplaceStencilOp,
    });
    this.cap = new Mesh(new PlaneGeometry(60, 30), capMat);
    this.cap.name = 'section-cap';
    this.cap.renderOrder = 2;
    this.cap.visible = false;
    this.cap.raycast = () => {};
    this.cap.onAfterRender = (r) => r.clearStencil();

    for (const m of [...stencilTargets, ...clipOnly]) this.materials.add(m.material as Material);

    for (const m of stencilTargets) {
      for (const [side, op] of [[BackSide, IncrementWrapStencilOp], [FrontSide, DecrementWrapStencilOp]] as const) {
        const mat = new MeshBasicMaterial({
          side,
          colorWrite: false,
          depthWrite: false,
          depthTest: false,
          stencilWrite: true,
          stencilFunc: AlwaysStencilFunc,
          stencilFail: op,
          stencilZFail: op,
          stencilZPass: op,
          clippingPlanes: [this.plane],
        });
        const h = new Mesh(m.geometry, mat);
        h.renderOrder = 1;
        h.visible = false;
        h.name = `${m.name}:stencil`;
        h.raycast = () => {};
        m.add(h);
        this.helpers.push(h);
      }
    }
  }

  attachCapTo(parent: Object3D) {
    parent.add(this.cap);
  }

  get isEnabled() {
    return this.enabled;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    for (const mat of this.materials) {
      mat.clippingPlanes = on ? [this.plane] : null;
      mat.clipShadows = on;
      if (!mat.transparent) mat.side = on ? DoubleSide : FrontSide;
      mat.needsUpdate = true;
    }
    this.cap.visible = on;
    this.refresh();
  }

  /** 親が描かれていない（材質を隠したブロックなど）ときはステンシルも書かない。 */
  refresh() {
    for (const h of this.helpers) {
      const parent = h.parent as Mesh | null;
      const drawn = !!parent && (parent.material as Material).visible;
      h.visible = this.enabled && drawn;
    }
  }
}
