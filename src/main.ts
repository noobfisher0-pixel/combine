import GUI from 'lil-gui';
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { checkPose, type Violation } from './collision/check';
import { DEFAULT_POSE, HEADER_MOUNTS, poseRanges, TRANSPORT_POSE, UNLOAD_POSE, WORK_POSE } from './model/kinematics';
import { buildParts } from './model/parts';
import type { Pose } from './model/types';
import { MaterialLib } from './view/materials';
import { buildModel, GROUP_NAMES } from './view/scene';
import { SectionView } from './view/section';

const parts = buildParts();
const byId = new Map(parts.map((p) => [p.id, p]));

// ---------- renderer / scene ----------
const app = document.getElementById('app')!;
const renderer = new WebGLRenderer({ antialias: true, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.localClippingEnabled = true;
app.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x1a2120);
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
scene.add(new HemisphereLight(0xdfeeea, 0x2a2420, 0.6));
const sun = new DirectionalLight(0xffffff, 1.6);
sun.position.set(6, 10, 8);
scene.add(sun);

const ground = new Mesh(new PlaneGeometry(80, 80), new MeshStandardMaterial({ color: 0x232b29, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.002;
scene.add(ground);
const grid = new GridHelper(40, 40, 0x4b5a57, 0x2f3a38);
scene.add(grid);

const camera = new PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ---------- model ----------
const lib = new MaterialLib();
const model = buildModel(parts, lib);
scene.add(model.root);

// 外装：ブロック（外装の部品）と見た目（M1 では見た目はすべて外装）
const exteriorProxies = [...model.proxies.values()].filter((m) => byId.get(m.userData.partId)!.layer === 'exterior');
const visualMeshes: Mesh[] = [];
for (const g of model.visuals.values()) g.traverse((o) => { if (o instanceof Mesh) visualMeshes.push(o); });
const section = new SectionView(
  [...exteriorProxies, ...visualMeshes.filter((m) => m.userData.closed)],
  visualMeshes.filter((m) => !m.userData.closed),
);
section.attachCapTo(scene);
const xrayMaterials = new Set<MeshStandardMaterial>([
  ...exteriorProxies.map((m) => m.material),
  ...lib.all.filter((m) => !m.transparent),
]);

const pose: Pose = { ...WORK_POSE };
const view = { mode: '外観' as '外観' | 'X線' | '断面', shape: '詳細' as '詳細' | '検査用ブロック', header: true, grid: true };

// ---------- camera presets ----------
const presets: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  斜め前: { pos: [15, 8, -15], target: [-0.6, 1.6, 0] },
  真横右: { pos: [-0.4, 2.2, 16], target: [-0.4, 2.0, 0] },
  真横左: { pos: [-0.4, 2.2, -16], target: [-0.4, 2.0, 0] },
  真上: { pos: [-0.4, 22, 0.01], target: [-0.4, 0, 0] },
  後方: { pos: [-14, 5, 6], target: [-1, 1.8, 0] },
};
function setCamera(name: keyof typeof presets) {
  const p = presets[name];
  camera.position.set(...p.pos);
  controls.target.set(...p.target);
  controls.update();
}
setCamera('斜め前');

// ---------- view modes ----------
function applyView() {
  const xray = view.mode === 'X線';
  for (const mat of xrayMaterials) {
    mat.alphaHash = xray;
    mat.opacity = xray ? 0.22 : 1;
    mat.needsUpdate = true;
  }
  model.setDetail(view.shape === '詳細');
  // 断面では、完全に右側（z > 0）にある部品は視界を遮るので隠す（R-15）
  const box = new Box3();
  for (const [id, proxy] of model.proxies) {
    const part = byId.get(id)!;
    let visible = view.header || !HEADER_MOUNTS.has(part.mount);
    if (view.mode === '断面') {
      box.setFromObject(proxy);
      if (box.min.z > 0) visible = false;
    }
    model.setPartVisible(id, visible);
  }
  section.setEnabled(view.mode === '断面');
  grid.visible = view.grid;
}

function setMode(m: typeof view.mode) {
  view.mode = m;
  applyView();
  if (m === '断面') setCamera('真横右');
}

// ---------- interference ----------
const checkEl = document.getElementById('check')!;
let violations: Violation[] = [];
function runCheck() {
  violations = checkPose(parts, pose, { skip: (p) => !view.header && HEADER_MOUNTS.has(p.mount) });
  model.highlight(new Set(violations.flatMap((v) => [v.a, v.b])));
  if (violations.length === 0) {
    checkEl.innerHTML = `<span class="badge ok">干渉 0 件</span> <span style="color:var(--muted)">${parts.length} 部品・${(parts.length * (parts.length - 1)) / 2} 組を検査</span>`;
  } else {
    const items = violations
      .map((v) => `<li>${byId.get(v.a)!.name} × ${byId.get(v.b)!.name}（隙間 ${(v.gap * 100).toFixed(1)} cm）</li>`)
      .join('');
    checkEl.innerHTML = `<span class="badge bad">干渉 ${violations.length} 件</span><ul>${items}</ul>`;
  }
}

function update() {
  model.setPose(pose);
  runCheck();
}

// ---------- picking ----------
const infoEl = document.getElementById('info')!;
const CONF = { source: '資料', estimate: '推定', design: '設計で決定' } as const;
const ray = new Raycaster();
const ndc = new Vector2();
let downAt: [number, number] | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(model.root, true).filter((h) => isDrawn(h.object));
  const hit = hits.find((h) => !(view.mode === '断面' && section.plane.distanceToPoint(h.point) < 0));
  showInfo(hit ? (hit.object.userData.partId as string) : null);
});

/** 実際に描かれているか（祖先がすべて表示、材質も表示）。 */
function isDrawn(o: Object3D): boolean {
  if (!(o as Mesh).material || !((o as Mesh).material as MeshStandardMaterial).visible) return false;
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function showInfo(id: string | null) {
  if (!id) {
    infoEl.hidden = true;
    return;
  }
  const p = byId.get(id)!;
  const b = new Box3().setFromObject(model.proxies.get(id)!);
  const size = b.getSize(new Vector3());
  const f = (n: number) => n.toFixed(2);
  const related = violations.filter((v) => v.a === id || v.b === id);
  infoEl.hidden = false;
  infoEl.innerHTML = `
    <div class="name">${p.name}</div>
    <dl>
      <dt>ID</dt><dd>${p.id}</dd>
      <dt>部品群</dt><dd>${GROUP_NAMES[p.group]}</dd>
      <dt>確度</dt><dd><span class="conf ${p.meta.confidence}">${CONF[p.meta.confidence]}</span></dd>
      <dt>根拠</dt><dd>${p.meta.source}</dd>
      <dt>範囲 x</dt><dd>${f(b.min.x)} 〜 ${f(b.max.x)} m</dd>
      <dt>範囲 y</dt><dd>${f(b.min.y)} 〜 ${f(b.max.y)} m</dd>
      <dt>範囲 z</dt><dd>${f(b.min.z)} 〜 ${f(b.max.z)} m</dd>
      <dt>外形</dt><dd>${f(size.x)} × ${f(size.y)} × ${f(size.z)} m</dd>
      ${related.length ? `<dt>干渉</dt><dd style="color:var(--bad)">${related.map((v) => byId.get(v.a === id ? v.b : v.a)!.name).join('、')}</dd>` : ''}
    </dl>`;
}

// ---------- GUI ----------
const ranges = poseRanges();
const gui = new GUI({ title: '操作' });
const fPose = gui.addFolder('姿勢');
const ctl = (key: keyof Pose, label: string, step: number) =>
  fPose.add(pose, key, ranges[key][0], ranges[key][1], step).name(label).onChange(update);
const poseCtls = [
  ctl('headerAngle', 'フィーダ角 [°]', 0.1),
  ctl('faceTilt', 'フェース前後チルト [°]', 0.5),
  ctl('lateralTilt', 'ヘッダ左右チルト [°]', 0.5),
  ctl('reelLift', 'リール上下 [m]', 0.01),
  ctl('reelSlide', 'リール前後 [m]', 0.01),
  ctl('augerDeploy', '排出オーガ [°]', 1),
  ctl('flaps', 'タンクフラップ [°]', 1),
  ctl('steer', '後輪操舵 [°]', 1),
];
const presetsPose = {
  作業: () => setPose(WORK_POSE),
  輸送: () => setPose(TRANSPORT_POSE),
  排出: () => setPose(UNLOAD_POSE),
  最大上昇: () => setPose({ ...WORK_POSE, headerAngle: ranges.headerAngle[1], reelLift: ranges.reelLift[1] }),
  既定: () => setPose(DEFAULT_POSE),
};
function setPose(p: Pose) {
  Object.assign(pose, p);
  poseCtls.forEach((c) => c.updateDisplay());
  update();
}
const fPre = gui.addFolder('姿勢プリセット');
for (const k of Object.keys(presetsPose) as Array<keyof typeof presetsPose>) fPre.add(presetsPose, k);

const fView = gui.addFolder('表示');
fView.add(view, 'mode', ['外観', 'X線', '断面']).name('モード').onChange(() => setMode(view.mode));
fView.add(view, 'shape', ['詳細', '検査用ブロック']).name('形状').onChange(applyView);
fView.add(view, 'header').name('ヘッダを表示').onChange(() => { applyView(); runCheck(); });
fView.add(view, 'grid').name('1 m グリッド').onChange(applyView);
const cams = Object.fromEntries(Object.keys(presets).map((k) => [k, () => setCamera(k as keyof typeof presets)]));
const fCam = gui.addFolder('カメラ');
for (const k of Object.keys(cams)) fCam.add(cams, k);
if (window.innerWidth < 640) gui.close();

// ---------- loop ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

update();
applyView();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// e2e テスト用の参照（本番動作には使わない）
(window as unknown as { __combine: unknown }).__combine = {
  get violations() { return violations; },
  setMode(m: typeof view.mode) { setMode(m); gui.controllersRecursive().forEach((c) => c.updateDisplay()); },
  setCamera,
  setPose,
  info: () => renderer.info.render,
};
