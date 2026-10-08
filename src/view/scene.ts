import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import { mountMatrices } from '../model/kinematics';
import type { Group as PartGroup, MountId, PartDef, Pose } from '../model/types';

/** 部品群ごとの色（既定の配色：ティール＋オフホワイト＋ダークグレー、design §1.3）。 */
export const GROUP_COLORS: Record<PartGroup, number> = {
  wheel: 0x2b2e31,
  chassis: 0xecead4,
  cab: 0x7fb7b3,
  feeder: 0x2a7b78,
  header: 0x2a7b78,
  thresher: 0xc99a2e,
  shoe: 0x8fb3d9,
  grain: 0xe0ae4e,
  tank: 0x2a7b78,
  unload: 0xe0ae4e,
  engine: 0x6f7a80,
  residue: 0xb7794b,
};

export const GROUP_NAMES: Record<PartGroup, string> = {
  wheel: '走行系',
  chassis: '車体',
  cab: 'キャブ',
  feeder: 'フィーダ',
  header: 'ヘッダ',
  thresher: '脱穀',
  shoe: '選別',
  grain: '穀粒搬送',
  tank: 'グレインタンク',
  unload: '排出オーガ',
  engine: 'エンジン',
  residue: '残渣処理',
};

const Y_UP = new Vector3(0, 1, 0);

function placeCylinder(mesh: Object3D, a: Vector3, b: Vector3, radius: number) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(Y_UP, dir.normalize()));
  mesh.scale.set(radius, len, radius);
}

export interface CombineModel {
  root: Group;
  meshes: Map<string, Mesh<BoxGeometry | CylinderGeometry, MeshStandardMaterial>>;
  setPose(pose: Pose): void;
}

export function buildModel(parts: PartDef[]): CombineModel {
  const root = new Group();
  root.name = 'Combine';
  const mounts = new Map<MountId, Group>();
  const mountGroup = (id: MountId) => {
    let g = mounts.get(id);
    if (!g) {
      g = new Group();
      g.name = `mount:${id}`;
      g.matrixAutoUpdate = false;
      root.add(g);
      mounts.set(id, g);
    }
    return g;
  };

  // 円柱は単位円柱をスケールして使う（リンクの伸縮もスケールで表す）
  const unitCyl = new CylinderGeometry(1, 1, 1, 40, 1);
  const meshes: CombineModel['meshes'] = new Map();
  const links: Array<{ mesh: Mesh; part: PartDef }> = [];

  for (const part of parts) {
    const mat = new MeshStandardMaterial({
      color: GROUP_COLORS[part.group],
      roughness: part.group === 'wheel' ? 0.9 : 0.5,
      metalness: part.group === 'wheel' ? 0 : 0.15,
    });
    if (part.id === 'thresher.cage') {
      // ケージは中のロータが見えるように常に半透明（ディザ透過）
      mat.alphaHash = true;
      mat.opacity = 0.3;
    }
    const sh = part.shape;
    let mesh: Mesh<BoxGeometry | CylinderGeometry, MeshStandardMaterial>;
    if (sh.kind === 'box') {
      mesh = new Mesh(new BoxGeometry(...sh.size), mat);
      mesh.position.set(...sh.center);
      mesh.rotation.z = ((sh.rotZ ?? 0) * Math.PI) / 180;
      mountGroup(part.mount).add(mesh);
    } else if (sh.kind === 'cyl') {
      mesh = new Mesh(unitCyl, mat);
      placeCylinder(mesh, new Vector3(...sh.a), new Vector3(...sh.b), sh.radius);
      mountGroup(part.mount).add(mesh);
    } else {
      mesh = new Mesh(unitCyl, mat);
      root.add(mesh);
      links.push({ mesh, part });
    }
    mesh.name = part.id;
    mesh.userData.partId = part.id;
    meshes.set(part.id, mesh);
  }

  function setPose(pose: Pose) {
    const m = mountMatrices(pose);
    for (const [id, g] of mounts) {
      g.matrix.copy(m[id]);
      g.matrixWorldNeedsUpdate = true;
    }
    for (const { mesh, part } of links) {
      const sh = part.shape;
      if (sh.kind !== 'link') continue;
      const a = new Vector3(...sh.a.p).applyMatrix4(m[sh.a.mount]);
      const b = new Vector3(...sh.b.p).applyMatrix4(m[sh.b.mount]);
      placeCylinder(mesh, a, b, sh.radius);
    }
    root.updateMatrixWorld(true);
  }

  return { root, meshes, setPose };
}
