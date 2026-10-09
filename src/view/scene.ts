import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import { mountMatrices } from '../model/kinematics';
import type { Group as PartGroup, MountId, PartDef, Pose } from '../model/types';
import { spec } from '../spec/spec';
import type { MaterialLib } from './materials';
import { buildVisual } from './visuals';

/** 検査用ブロックの色（部品群ごと）。 */
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

export type ProxyMesh = Mesh<BoxGeometry | CylinderGeometry, MeshStandardMaterial>;

export interface CombineModel {
  root: Group;
  /** 検査用ブロック（collider と同じ形） */
  proxies: Map<string, ProxyMesh>;
  /** 見た目（M1 では外装のみ） */
  visuals: Map<string, Group>;
  setPose(pose: Pose): void;
  /** true = 詳細表示（見た目がある部品は見た目、ない部品はブロック） */
  setDetail(on: boolean): void;
  /** 干渉している部品をブロックの赤い半透明で重ねて示す */
  highlight(ids: Set<string>): void;
  /** 部品ごとの表示可否（ヘッダ非表示・断面の右側非表示など） */
  setPartVisible(id: string, on: boolean): void;
  /** 分解表示（0 = 組み立て、1 = 分解） */
  setExplode(f: number): void;
}

/** 分解表示で各部品を動かす量 [m]（design §8.1）。部品群ごとに、前・上・横へ離す。 */
export function explodeOffset(p: PartDef): Vector3 {
  const side = (id: string) => (id.endsWith('L') ? -1 : id.endsWith('R') ? 1 : 0);
  const id = p.id;
  if (p.group === 'header' || p.mount === 'face') return new Vector3(3.2, 0, 0);
  if (id === 'feeder.housing') return new Vector3(1.6, 0, 0);
  if (p.group === 'cab') return new Vector3(1.0, 1.8, 0);
  if (id.startsWith('tank')) return new Vector3(0, 2.8, 0);
  if (p.group === 'unload') return new Vector3(0, 3.8, -1.2);
  if (p.group === 'engine' || id.startsWith('panel.engine')) return new Vector3(-1.8, 1.8, 0);
  if (id.startsWith('panel.lower')) return new Vector3(0, 0, side(id) * 1.8);
  if (id.startsWith('panel.rear')) return new Vector3(0, 0, side(id) * 1.4);
  if (p.group === 'wheel') return new Vector3(0, 0, side(id) * 1.3);
  if (p.group === 'thresher') return new Vector3(0, 1.3, 0);
  if (id === 'grain.elevator' || id === 'grain.tailingsReturn') return new Vector3(0, 0, 1.2);
  if (p.group === 'residue') return new Vector3(-1.4, 0, 0);
  return new Vector3();
}

export function buildModel(parts: PartDef[], lib: MaterialLib): CombineModel {
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

  const unitCyl = new CylinderGeometry(1, 1, 1, 40, 1);
  const proxies: CombineModel['proxies'] = new Map();
  const visuals: CombineModel['visuals'] = new Map();
  const links: Array<{ part: PartDef; proxy: Mesh; barrel: Mesh; rod: Mesh }> = [];
  const hiMat = new MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.45, depthWrite: false });
  const highlights = new Map<string, Mesh>();
  const partVisible = new Map<string, boolean>();
  let detail = true;

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
    let proxy: ProxyMesh;
    let parent: Object3D;
    if (sh.kind === 'box') {
      proxy = new Mesh(new BoxGeometry(...sh.size), mat);
      proxy.position.set(...sh.center);
      proxy.rotation.z = ((sh.rotZ ?? 0) * Math.PI) / 180;
      parent = mountGroup(part.mount);
    } else if (sh.kind === 'cyl') {
      proxy = new Mesh(unitCyl, mat);
      placeCylinder(proxy, new Vector3(...sh.a), new Vector3(...sh.b), sh.radius);
      parent = mountGroup(part.mount);
    } else {
      proxy = new Mesh(unitCyl, mat);
      parent = root;
      const barrel = new Mesh(unitCyl, lib.mats.frame);
      const rod = new Mesh(unitCyl, lib.mats.steel);
      for (const m of [barrel, rod]) {
        m.userData = { partId: part.id, visual: true, closed: false };
        root.add(m);
      }
      links.push({ part, proxy, barrel, rod });
    }
    proxy.name = part.id;
    proxy.userData = { partId: part.id, proxy: true, closed: true };
    parent.add(proxy);
    proxies.set(part.id, proxy);

    const hi = new Mesh(proxy.geometry, hiMat);
    hi.visible = false;
    hi.renderOrder = 3;
    hi.raycast = () => {};
    proxy.add(hi);
    highlights.set(part.id, hi);

    const vis = buildVisual(part, lib);
    if (vis) {
      mountGroup(part.mount).add(vis);
      visuals.set(part.id, vis);
    }
  }

  function refresh() {
    for (const [id, proxy] of proxies) {
      const on = partVisible.get(id) ?? true;
      const vis = visuals.get(id);
      const link = links.find((l) => l.part.id === id);
      const showVisual = detail && (vis !== undefined || link !== undefined);
      proxy.visible = on;
      // ブロックを隠しても子のハイライトは出したいので、材質だけ消す
      proxy.material.visible = on && !showVisual;
      if (vis) vis.visible = on && showVisual;
      if (link) link.barrel.visible = link.rod.visible = on && showVisual;
    }
  }

  function setPose(pose: Pose) {
    const m = mountMatrices(pose);
    for (const [id, g] of mounts) {
      g.matrix.copy(m[id]);
      g.matrixWorldNeedsUpdate = true;
    }
    for (const { part, proxy, barrel, rod } of links) {
      const sh = part.shape;
      if (sh.kind !== 'link') continue;
      const a = new Vector3(...sh.a.p).applyMatrix4(m[sh.a.mount]);
      const b = new Vector3(...sh.b.p).applyMatrix4(m[sh.b.mount]);
      placeCylinder(proxy, a, b, sh.radius);
      // 筒（最短長からロッドの露出ぶんを引いた長さ）とロッド
      const dir = b.clone().sub(a).normalize();
      const barrelLen = spec.feeder.liftCylinder.closedLength - 0.12;
      const mid = a.clone().addScaledVector(dir, barrelLen);
      placeCylinder(barrel, a, mid, sh.radius);
      placeCylinder(rod, mid.clone().addScaledVector(dir, -0.05), b, sh.radius * 0.55);
    }
    root.updateMatrixWorld(true);
  }

  refresh();
  const proxyBase = new Map([...proxies].map(([id, m]) => [id, m.position.clone()]));
  return {
    root,
    proxies,
    visuals,
    setPose,
    setDetail(on) {
      detail = on;
      refresh();
    },
    highlight(ids) {
      for (const [id, hi] of highlights) hi.visible = ids.has(id);
    },
    setPartVisible(id, on) {
      partVisible.set(id, on);
      refresh();
    },
    setExplode(f) {
      for (const part of parts) {
        if (part.shape.kind === 'link') continue;
        const off = explodeOffset(part).multiplyScalar(f);
        const vis = visuals.get(part.id);
        if (vis) vis.position.copy(off);
        const proxy = proxies.get(part.id)!;
        const base = proxyBase.get(part.id)!;
        proxy.position.copy(base).add(off);
      }
      for (const l of links) l.barrel.visible = l.rod.visible = f === 0 && detail;
      root.updateMatrixWorld(true);
    },
  };
}
