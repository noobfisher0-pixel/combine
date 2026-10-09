import GUI from 'lil-gui';
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
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
import { activeParts, buildParts } from './model/parts';
import { describePart } from './model/descriptions';
import type { HeaderType } from './model/types';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { spec } from './spec/spec';
import type { Pose } from './model/types';
import { approachPose, DEFAULT_MACHINE, LIMITS, motionRates } from './model/machine';
import { minHeaderAngle } from './model/limits';
import { defaultConditions, harvestReport, suggestedReelLift, type HarvestReport } from './model/harvest';
import { Animator } from './view/animator';
import { FlowSystem } from './flow/system';
import { FlowView, FLOW_COLORS, FLOW_NAMES } from './view/flowView';
import { MaterialLib } from './view/materials';
import { buildModel, GROUP_NAMES } from './view/scene';
import { SectionView } from './view/section';
import { HarvestScenario, defaultScenarioParams, type ScenarioParams, type ScenarioReport } from './field/scenario';
import { FieldView, FIELD_SKY } from './view/fieldView';

/** 画面には両方のヘッダの部品を作り、付いているヘッダだけを表示・検査する（M5） */
const parts = buildParts(undefined, 'all');
const byId = new Map(parts.map((p) => [p.id, p]));
let headerType: HeaderType = 'draper';
const active = () => activeParts(parts, headerType);

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
// 断面で切るのは外装だけ。内部機構は切らずに見せる（design §8.1）
const exteriorVisuals = visualMeshes.filter((m) => byId.get(m.userData.partId)!.layer === 'exterior');
const section = new SectionView(
  [...exteriorProxies, ...exteriorVisuals.filter((m) => m.userData.closed)],
  exteriorVisuals.filter((m) => !m.userData.closed),
);
section.attachCapTo(scene);
const xrayMaterials = new Set<MeshStandardMaterial>([
  ...exteriorProxies.map((m) => m.material),
  ...lib.exteriorOpaque,
]);

/** pose = 実際の姿勢、target = 操作の目標（油圧で速度制限つきで近づく） */
let pose: Pose = { ...WORK_POSE };
const target: Pose = { ...WORK_POSE };
const machine = { ...DEFAULT_MACHINE };
const animator = new Animator(model.root, model.proxies);
const flow = new FlowSystem(1);
const flowView = new FlowView(flow);
scene.add(flowView.root);
const view = { paused: false, explode: 0, flow: true, labels: false, headerKind: 'ドレーパー（小麦）', mode: '外観' as '外観' | 'X線' | '断面', shape: '詳細' as '詳細' | '検査用ブロック', header: true, grid: true };

// ---------- camera presets ----------
const presets: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  斜め前: { pos: [15, 8, -15], target: [-0.6, 1.6, 0] },
  真横右: { pos: [-0.4, 2.2, 16], target: [-0.4, 2.0, 0] },
  真横左: { pos: [-0.4, 2.2, -16], target: [-0.4, 2.0, 0] },
  真上: { pos: [-0.4, 22, 0.01], target: [-0.4, 0, 0] },
  後方: { pos: [-14, 5, 6], target: [-1, 1.8, 0] },
  キャブ視点: { pos: [1.0, 3.35, -0.25], target: [9, 0.4, -0.25] },
  ヘッダ正面: { pos: [15, 2.6, 0.01], target: [3.5, 1.0, 0] },
  刈り取りの近く: { pos: [9.5, 1.7, -8.2], target: [5.2, 0.6, -4.6] },
  圃場の上空: { pos: [-30, 70, -40], target: [0, 0, 4] },
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
  // X線：外装を薄い半透明にする。ディザ透過（alphaHash）はざらつきで中が読みにくかったので、
  // 奥行きを書かない半透明にした（外装どうしの前後の並べ替えのちらつきは、薄いので目立たない）
  const xray = view.mode === 'X線';
  for (const mat of xrayMaterials) {
    mat.transparent = xray;
    mat.depthWrite = !xray;
    mat.opacity = xray ? 0.12 : 1;
    mat.needsUpdate = true;
  }
  const harvestDetails = document.querySelector<HTMLDetailsElement>('.harvest details');
  if (harvestDetails && (view.mode !== '外観' || view.explode > 0 || headerType === 'corn' || view.labels)) harvestDetails.open = false;
  model.setDetail(view.shape === '詳細');
  // 断面では、完全に右側（z > 0）にある部品は視界を遮るので隠す（R-15）
  const box = new Box3();
  for (const [id, proxy] of model.proxies) {
    const part = byId.get(id)!;
    let visible = (view.header || !HEADER_MOUNTS.has(part.mount)) && (!part.variant || part.variant === headerType);
    if (view.mode === '断面') {
      box.setFromObject(proxy);
      if (box.min.z > 0) visible = false;
    }
    model.setPartVisible(id, visible);
  }
  section.setEnabled(view.mode === '断面');
  grid.visible = view.grid && !fieldCfg.show;
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
  if (view.explode > 0) {
    violations = [];
    model.highlight(new Set());
    checkEl.innerHTML = '<span class="badge">分解表示中</span> <span style="color:var(--muted)">組み立てた状態に戻すと検査します</span>';
    return;
  }
  violations = checkPose(active(), pose, { skip: (p) => !view.header && HEADER_MOUNTS.has(p.mount) });
  model.highlight(new Set(violations.flatMap((v) => [v.a, v.b])));
  if (violations.length === 0) {
    const n = active().length;
    checkEl.innerHTML = `<span class="badge ok">干渉 0 件</span> <span style="color:var(--muted)">${n} 部品・${(n * (n - 1)) / 2} 組を検査</span>`;
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

// ---------- ground limit ----------
let headerMin = poseRanges().headerAngle[0];
/** 目標の姿勢を、ヘッダが地面に潜らない範囲に収める（§14.3、M2）。 */
function clampTarget() {
  headerMin = minHeaderAngle(target, active());
  if (target.headerAngle < headerMin) target.headerAngle = headerMin;
}

// ---------- harvest checks (design §16 段階 1) ----------
const crop = { ...defaultConditions(), autoMog: true, mog: spec.crop.wheat.mogRatio };
const harvestEl = document.getElementById('harvest')!;
let report: HarvestReport | null = null;
function renderHarvest() {
  const summary = document.querySelector('.harvest summary');
  if (summary) summary.textContent = fieldCfg.show ? '圃場シナリオ（100 m × 50 m の小麦）' : '収穫の成立チェック（小麦）';
  if (fieldCfg.show) {
    renderScenario();
    return;
  }
  report = harvestReport(pose, {
    yield: crop.yield,
    cropHeight: crop.cropHeight,
    speed: machine.engineOn ? machine.groundSpeed : 0,
    reelIndex: machine.reelIndex,
    mogRatio: crop.autoMog ? undefined : crop.mog,
  });
  const r = report;
  const checks = r.checks
    .map((c) => `<li><span class="mark ${c.ok ? 'ok' : 'ng'}">${c.ok ? '✓' : '✗'} ${c.id}</span><span>${c.name}</span><span class="detail">${c.detail}</span></li>`)
    .join('');
  const v = Math.max(machine.groundSpeed, 0.01);
  const rows = r.stages
    .map((st) => {
      const ratio = st.load / st.capacity;
      return `<tr><td>${st.name}</td><td>${(ratio * 100).toFixed(0)}%</td><td><div class="bar" title="${st.basis}"><i class="${ratio > 1 ? 'over' : ''}" style="width:${Math.min(100, ratio * 100)}%"></i></div></td><td>${st.limitSpeed.toFixed(1)} km/h</td></tr>`;
    })
    .join('');
  harvestEl.innerHTML =
    (headerType === 'corn' ? '<p class="note-corn">いまはコーンヘッドです。小麦のチェック（W-1〜W-6）はドレーパーヘッダが前提なので、参考値として見てください。</p>' : '') +
    `<ul>${checks}</ul>` +
    `<table aria-label="段ごとの負荷率"><tr><td colspan="4" style="border-top:0;color:var(--muted)">段ごとの負荷率（地速 ${v.toFixed(1)} km/h）と、能力いっぱいになる地速</td></tr>${rows}</table>` +
    `<div class="sum">刈高さ <b>${(r.cut * 100).toFixed(0)} cm</b> · 最大速度 <b>${r.maxSpeed.toFixed(1)} km/h</b>（${r.bottleneck.name}）· タンク満杯 <b>${r.fillMinutes.toFixed(0)} 分</b></div>`;
}

// ---------- field scenario (design §16.6・§21、M6) ----------
// 小さい画面（スマートフォン）は株を描かない軽量表示から始める
const fieldCfg = { show: false, running: false, speedUp: 3, quality: (window.innerWidth < 640 ? '軽量' : '詳細') as '詳細' | '軽量', ...defaultScenarioParams() };
let scenario: HarvestScenario | null = null;
let fieldView: FieldView | null = null;
let fieldTime = 0;
const defaultBackground = scene.background.clone();
function scenarioParams(): ScenarioParams {
  const { show, running, speedUp, quality, ...p } = fieldCfg;
  void show; void running; void speedUp; void quality;
  return p;
}
function resetScenario() {
  scenario = new HarvestScenario(scenarioParams());
  if (!fieldView) {
    fieldView = new FieldView(scenario.field);
    scene.add(fieldView.root);
    scene.add(fieldView.cart);
    fieldView.setQuality(fieldCfg.quality === '軽量' ? 'low' : 'high');
  } else fieldView.setField(scenario.field);
  flow.clear();
  pose = { ...scenario.pose };
  Object.assign(target, pose);
  update();
  fieldView.update(scenario, camera.position, fieldTime);
  renderScenario(true);
}
function setFieldMode(on: boolean) {
  fieldCfg.show = on;
  if (on) {
    if (headerType !== 'draper') setHeader('draper');
    if (!scenario) resetScenario();
    scene.background = FIELD_SKY;
    const harvestDetails = document.querySelector<HTMLDetailsElement>('.harvest details');
    if (harvestDetails) harvestDetails.open = true;
  } else {
    fieldCfg.running = false;
    scene.background = defaultBackground;
    machine.groundSpeed = DEFAULT_MACHINE.groundSpeed;
    machine.unloadOn = false;
    setPose(WORK_POSE);
    flow.clear();
  }
  fieldView?.setVisible(on);
  ground.visible = !on;
  applyView();
  renderHarvest();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}
/** 最後まで（固定の刻みで）進める。画面の圃場もその状態になる */
function finishScenario() {
  if (!scenario) return;
  scenario.runToEnd();
  fieldCfg.running = false;
  flow.clear();
  renderScenario(true);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function sparkline(series: Array<[number, number]>, total: number): string {
  if (series.length < 2) return '';
  const W = 300;
  const H = 40;
  const tx = (t: number) => (t / Math.max(total, 1)) * W;
  const pts = series.map(([t, v]) => `${tx(t).toFixed(1)},${(H - v * H).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark" role="img" aria-label="タンク量の推移"><line x1="0" x2="${W}" y1="0.5" y2="0.5" class="cap"/><polyline points="${pts}"/></svg>`;
}
let lastScenarioHtml = 0;
function renderScenario(force = false) {
  if (!scenario || !fieldCfg.show) return;
  const now = performance.now();
  if (!force && now - lastScenarioHtml < 250) return;
  lastScenarioHtml = now;
  const sc = scenario;
  const r: ScenarioReport = sc.report();
  const pass = sc.place.pass > 0 ? `行程 ${sc.place.pass} / ${r.passes}` : '枕地で旋回';
  const tankPct = (sc.tankMass / sc.capacityKg) * 100;
  const unload = sc.unloadFlowing ? '<b>排出中</b>（運搬車へ）' : sc.unloadReq && !sc.laneClear ? '<span class="warn">運搬車待ち（左側に作物）</span>' : sc.unloadReq ? '排出の準備' : '';
  const checks = r.checks
    .map((c) => {
      const live = !r.done && (c.id === 'W-7' || c.id === 'W-8');
      return `<li><span class="mark ${live ? 'live' : c.ok ? 'ok' : 'ng'}">${live ? '…' : c.ok ? '✓' : '✗'} ${c.id}</span><span>${c.name}</span><span class="detail">${c.detail}</span></li>`;
    })
    .join('');
  const rows = r.peaks
    .map((p) => `<tr><td>${p.name}</td><td>${(p.peak * 100).toFixed(0)}%</td><td><div class="bar"><i class="${p.peak > 1 ? 'over' : ''}" style="width:${Math.min(100, p.peak * 100)}%"></i></div></td><td>平均 ${(p.avg * 100).toFixed(0)}%</td></tr>`)
    .join('');
  const log = r.log.slice(-4).map(([t, s]) => `<span>${mmss(t)} ${s}</span>`).join(' · ');
  harvestEl.innerHTML =
    `<div class="sum">${r.done ? '<b>完了</b>' : fieldCfg.running ? '実行中' : '停止中'} · ${pass} · 工程時間 <b>${mmss(r.time)}</b> · 地速 <b>${(sc.v * 3.6).toFixed(1)} km/h</b></div>` +
    `<div class="sum">刈った面積 <b>${r.areaHa.toFixed(3)} ha</b> · 収穫 <b>${(r.harvestedKg / 1000).toFixed(2)} t</b> · 排出 <b>${(r.unloadedKg / 1000).toFixed(1)} t</b> · 能率 ${r.fieldRate.toFixed(1)} ha/h（旋回込み）</div>` +
    `<div class="sum">タンク <b>${tankPct.toFixed(0)}%</b>（${(sc.tankMass / 1000).toFixed(1)} t）${unload ? ' · ' + unload : ''}</div>` +
    sparkline(r.tankSeries, Math.max(r.time, 60)) +
    `<ul>${checks}</ul>` +
    `<table aria-label="段ごとの負荷率のピーク"><tr><td colspan="4" style="border-top:0;color:var(--muted)">段ごとの負荷率（実走のピークと平均、刈っている間）</td></tr>${rows}</table>` +
    `<div class="log">${log}</div>`;
}

// ---------- header type (M5) ----------
function setHeader(h: HeaderType) {
  if (h !== 'draper' && fieldCfg.show) setFieldMode(false);
  headerType = h;
  view.headerKind = h === 'corn' ? 'コーン（12 条）' : 'ドレーパー（小麦）';
  if (h === 'corn') flow.clear();
  applyView();
  clampTarget();
  runCheck();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// ---------- labels (design §8.1、R-31) ----------
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
labelRenderer.domElement.hidden = true;
document.body.appendChild(labelRenderer.domElement);
const labelRoot = new Group();
labelRoot.visible = false;
scene.add(labelRoot);
const LABEL_IDS = [
  'header.reel', 'header.cutterbar', 'corn.snout6', 'corn.auger', 'feeder.housing', 'cab', 'tank', 'unload.tube', 'engine',
  'thresher.rotor', 'thresher.cage', 'shoe.fan', 'shoe.chaffer', 'shoe.sieve', 'grain.elevator', 'residue.chopper', 'residue.spreaderL', 'wheel.frontL',
];
const labels = LABEL_IDS.filter((id) => byId.has(id)).map((id) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'label';
  el.textContent = byId.get(id)!.name;
  el.addEventListener('click', () => showInfo(id));
  const obj = new CSS2DObject(el);
  labelRoot.add(obj);
  return { id, obj, el };
});
const labelRay = new Raycaster();
let lastLabel = 0;
function updateLabels(now: number) {
  if (!view.labels || now - lastLabel < 300) return;
  lastLabel = now;
  const box = new Box3();
  for (const l of labels) {
    const proxy = model.proxies.get(l.id)!;
    const part = byId.get(l.id)!;
    const shown = (!part.variant || part.variant === headerType) && (view.header || !HEADER_MOUNTS.has(part.mount));
    l.obj.visible = shown;
    if (!shown) continue;
    box.setFromObject(proxy);
    box.getCenter(l.obj.position);
    // 奥に隠れている部品のラベルは薄くする（カメラから部品の中心までの間に、ほかの部品があるか）
    const dir = l.obj.position.clone().sub(camera.position);
    const dist = dir.length();
    labelRay.set(camera.position, dir.normalize());
    labelRay.far = dist;
    const hit = labelRay.intersectObject(model.root, true).find((h) => isDrawn(h.object) && h.object.userData.partId !== l.id && h.distance < dist - 0.3);
    l.el.classList.toggle('behind', !!hit);
  }
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
    <p class="desc">${describePart(p.id) ?? ''}</p>
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
const fField = gui.addFolder('圃場シナリオ（M6）');
fField.add(fieldCfg, 'show').name('圃場を表示').onChange((on: boolean) => setFieldMode(on));
fField.add(fieldCfg, 'running').name('実行').onChange((on: boolean) => { if (on && !fieldCfg.show) setFieldMode(true); if (on && scenario?.done) resetScenario(); });
fField.add(fieldCfg, 'speedUp', 1, 20, 1).name('早送り（×実時間）');
fField.add(fieldCfg, 'quality', ['詳細', '軽量']).name('小麦の描画').onChange(() => fieldView?.setQuality(fieldCfg.quality === '軽量' ? 'low' : 'high'));
const fieldActions = {
  やり直し: () => { fieldCfg.running = false; resetScenario(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); },
  最後まで計算: () => { if (!fieldCfg.show) setFieldMode(true); finishScenario(); },
};
fField.add(fieldActions, 'やり直し');
fField.add(fieldActions, '最後まで計算');
const fParams = fField.addFolder('条件（変えるとやり直し）');
const reset = () => { fieldCfg.running = false; if (fieldCfg.show) resetScenario(); else scenario = null; };
fParams.add(fieldCfg, 'speed', 2, 8, 0.1).name('地速 [km/h]').onFinishChange(reset);
fParams.add(fieldCfg, 'yield', spec.crop.wheat.yieldRange[0], spec.crop.wheat.yieldRange[1], 0.1).name('収量 [t/ha]').onFinishChange(reset);
fParams.add(fieldCfg, 'cropHeight', spec.crop.wheat.heightRange[0], spec.crop.wheat.heightRange[1], 0.01).name('草丈 [m]').onFinishChange(reset);
fParams.add(fieldCfg, 'cutHeight', spec.crop.wheat.stubbleRange[0], 0.3, 0.01).name('刈高さ [m]').onFinishChange(reset);
fParams.add(fieldCfg, 'overlap', -1, 1, 0.05).name('行程の重なり [m]').onFinishChange(reset);
fParams.add(fieldCfg, 'roundTrips', 1, 2, 1).name('往復数').onFinishChange(reset);
fParams.add(fieldCfg, 'startTank', 0, 1, 0.05).name('開始時のタンク').onFinishChange(reset);
fParams.add(fieldCfg, 'unloadAt', 0.3, 1, 0.05).name('運搬車を呼ぶタンク量').onFinishChange(reset);
fParams.close();
const fRun = gui.addFolder('運転');
fRun.add(machine, 'engineOn').name('エンジン');
fRun.add(machine, 'headerOn').name('ヘッダ（刈取部）');
fRun.add(machine, 'separatorOn').name('脱穀・選別部');
fRun.add(machine, 'unloadOn').name('排出（オーガを 90° 以上振り出す）');
fRun.add(machine, 'groundSpeed', LIMITS.groundSpeed[0], LIMITS.groundSpeed[1], 0.1).name('地速 [km/h]');
fRun.add(machine, 'reelIndex', LIMITS.reelIndex[0], LIMITS.reelIndex[1], 0.01).name('リール周速比');
fRun.add(machine, 'timeScale', LIMITS.timeScale[0], LIMITS.timeScale[1], 0.01).name('再生速度（×実時間）');
fRun.add(view, 'paused').name('一時停止');

const fCrop = gui.addFolder('作物（小麦）');
fCrop.add(crop, 'yield', spec.crop.wheat.yieldRange[0], spec.crop.wheat.yieldRange[1], 0.1).name('収量 [t/ha]').onChange(renderHarvest);
fCrop.add(crop, 'cropHeight', spec.crop.wheat.heightRange[0], spec.crop.wheat.heightRange[1], 0.01).name('草丈 [m]').onChange(renderHarvest);
fCrop.add(crop, 'autoMog').name('MOG 比を刈高さから推定').onChange(renderHarvest);
fCrop.add(crop, 'mog', spec.crop.wheat.mogRange[0], spec.crop.wheat.mogRange[1], 0.01).name('MOG/穀粒').onChange(renderHarvest);
const cropActions = {
  リールを推奨位置へ: () => setPose({ ...target, reelLift: suggestedReelLift(pose, { ...crop, speed: machine.groundSpeed, reelIndex: machine.reelIndex }) }),
  最大速度に合わせる: () => {
    machine.groundSpeed = Math.floor((report?.maxSpeed ?? machine.groundSpeed) * 10) / 10;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
};
const tankActions = {
  タンクを空に: () => flow.setTankMass(0),
  タンクをほぼ満杯に: () => flow.setTankMass(flow.tankCapacityMass * 0.95),
  作物フローをリセット: () => flow.clear(),
};
fCrop.add(tankActions, 'タンクを空に');
fCrop.add(tankActions, 'タンクをほぼ満杯に');
fCrop.add(tankActions, '作物フローをリセット');
fCrop.add(cropActions, 'リールを推奨位置へ');
fCrop.add(cropActions, '最大速度に合わせる');

const fPose = gui.addFolder('姿勢（目標）');
const ctl = (key: keyof Pose, label: string, step: number) =>
  fPose.add(target, key, ranges[key][0], ranges[key][1], step).name(label).onChange(() => {
    clampTarget();
    poseCtls.forEach((c) => c.updateDisplay());
  });
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
/** immediate = true なら油圧の動きを待たずにその姿勢にする（テスト用）。 */
function setPose(p: Pose, immediate = false) {
  Object.assign(target, p);
  clampTarget();
  if (immediate) {
    pose = { ...target };
    update();
  }
  poseCtls.forEach((c) => c.updateDisplay());
}
const fPre = gui.addFolder('姿勢プリセット');
for (const k of Object.keys(presetsPose) as Array<keyof typeof presetsPose>) fPre.add(presetsPose, k);

const fView = gui.addFolder('表示');
fView.add(view, 'mode', ['外観', 'X線', '断面']).name('モード').onChange(() => setMode(view.mode));
fView.add(view, 'headerKind', ['ドレーパー（小麦）', 'コーン（12 条）']).name('ヘッダ').onChange(() => setHeader(view.headerKind === 'コーン（12 条）' ? 'corn' : 'draper'));
fView.add(view, 'shape', ['詳細', '検査用ブロック']).name('形状').onChange(applyView);
fView.add(view, 'labels').name('名称ラベル').onChange(() => { labelRoot.visible = view.labels; labelRenderer.domElement.hidden = !view.labels; applyView(); });
fView.add(view, 'explode', 0, 1, 0.01).name('分解').onChange(() => { model.setExplode(view.explode); runCheck(); applyView(); });
fView.add(view, 'header').name('ヘッダを表示').onChange(() => { applyView(); runCheck(); });
fView.add(view, 'grid').name('1 m グリッド').onChange(applyView);
fView.add(view, 'flow').name('作物フロー').onChange(() => { flowView.root.visible = view.flow; });
const cams = Object.fromEntries(Object.keys(presets).map((k) => [k, () => setCamera(k as keyof typeof presets)]));
const fCam = gui.addFolder('カメラ');
for (const k of Object.keys(cams)) fCam.add(cams, k);
for (const f of [fPre, fView, fCam, fPose]) f.close();
if (window.innerWidth < 640) gui.close();

function flowReadout(): string {
  if (!view.flow) return '';
  const st = flow.stats();
  const pct = (st.tankMass / st.tankCapacityMass) * 100;
  const total = Object.values(st.count).reduce((a, b) => a + b, 0);
  const sw = (f: keyof typeof FLOW_COLORS) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#${FLOW_COLORS[f].toString(16).padStart(6, '0')};margin:0 3px 0 6px"></span>${FLOW_NAMES[f]}`;
  const unloading = machine.unloadOn && pose.augerDeploy >= 90 && st.tankMass > 0;
  return (
    `<div>タンク <b>${pct.toFixed(0)}%</b>（${(st.tankMass / 1000).toFixed(1)} t / ${(st.tankCapacityMass / 1000).toFixed(1)} t）· ` +
    `${st.cutting ? '刈り取り中' : '刈り取り停止'}${unloading ? ' · <b>排出中</b>' : machine.unloadOn ? ' · 排出は「排出オーガ」を 90° 以上に' : ''}</div>` +
    `<div>${(['crop', 'straw', 'grain', 'chaff', 'tailings', 'unload'] as const).map(sw).join('')} · 粒子 ${total}（1 粒 ≈ 40 g）</div>`
  );
}

// ---------- loop ----------
window.addEventListener('resize', () => {
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- readout ----------
const readoutEl = document.getElementById('readout')!;
const KEY_NAMES: Record<string, string> = { knife: 'ナイフ', reel: 'リール', wheelFront: '前輪', wheelRear: '後輪', screen: 'スクリーン', draperSide: 'ドレーパー', draperCenter: '中央ベルト', shoe: 'シュー', rotor: 'ロータ', beater: 'ビータ', fan: 'ファン', chopper: 'チョッパ', spreader: 'スプレッダ', auger: 'オーガ', crossAuger: 'タンク底オーガ', elevator: 'エレベータ' };
function renderReadout(rates: ReturnType<typeof motionRates>) {
  const rpm = (w: number) => Math.abs((w * 60) / (2 * Math.PI)).toFixed(0);
  const blur = [...animator.blurred].map((k) => KEY_NAMES[k]).join('、');
  const limited = target.headerAngle <= headerMin + 1e-6 && headerMin > poseRanges().headerAngle[0] + 1e-6;
  readoutEl.innerHTML =
    (fieldCfg.show
      ? `<div>圃場シナリオ：再生 <b>実時間の ${fieldCfg.speedUp} 倍</b>${fieldCfg.running && !view.paused ? '' : '（停止中）'} · 油圧も同じ時間</div>`
      : `<div>再生 <b>${machine.timeScale === 1 ? '実時間' : `実時間の ${machine.timeScale.toFixed(2)} 倍`}</b>${view.paused ? '（一時停止）' : ''} · 油圧は実時間</div>`) +
    `<div>実機の値：地速 <b>${machine.engineOn ? machine.groundSpeed.toFixed(1) : '0.0'} km/h</b> · リール <b>${rates.reelRpm.toFixed(0)} rpm</b> · 前輪 <b>${rpm(rates.wheelFrontOmegaZ)} rpm</b> · ナイフ <b>${rates.knifeHz} Hz</b> · シュー <b>${rates.shoeHz} Hz</b></div>` +
    (blur ? `<div>速すぎて見えない動きはブラー表示：${blur}</div>` : '') +
    (limited ? `<div class="warn">フィーダ角は地面で制限中（下限 ${headerMin.toFixed(1)}°）</div>` : '') +
    flowReadout();
}

// ---------- loop ----------
update();
applyView();
let last = performance.now();
let lastCheck = 0;
let lastReadout = 0;
let groundDist = 0;
let frames = 0;
renderer.setAnimationLoop((now) => {
  frames++;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // 圃場シナリオ：機体の動きと姿勢はシナリオが決める（工程の時間で、早送りつき）
  const fieldOn = fieldCfg.show && !!scenario && !!fieldView;
  if (fieldOn && scenario) {
    if (fieldCfg.running && !view.paused) {
      scenario.advance(dt * fieldCfg.speedUp);
      if (scenario.done) {
        fieldCfg.running = false;
        renderScenario(true);
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
      }
    }
    machine.groundSpeed = scenario.v * 3.6;
    machine.unloadOn = scenario.unloadFlowing;
    Object.assign(target, scenario.pose);
    pose = { ...scenario.pose };
    model.setPose(pose);
  }
  // 油圧（実時間）
  const next = approachPose(pose, target, dt);
  const moved = (Object.keys(next) as Array<keyof Pose>).some((k) => next[k] !== pose[k]);
  if (moved) {
    pose = next;
    model.setPose(pose);
    if (now - lastCheck > 150) {
      lastCheck = now;
      runCheck();
    }
  } else if (lastCheck !== -1 && now - lastCheck > 150) {
    lastCheck = -1; // 止まったら最終姿勢で 1 回検査
    runCheck();
  }
  // 工程（再生倍率つき）
  const rates = motionRates(machine);
  const ts = view.paused ? 0 : fieldOn ? (fieldCfg.running ? fieldCfg.speedUp : 0) : machine.timeScale;
  if (fieldOn && scenario && fieldView) {
    fieldTime += dt;
    fieldView.update(scenario, camera.position, fieldTime);
  }
  animator.update(dt, ts, rates);
  if (view.flow && view.explode === 0) {
    const sc = fieldOn ? scenario : null;
    // 早送りでも粒子が経路を外れないように、1 回に進める時間を 1/30 s 以下に分ける
    const total = dt * ts;
    const n = Math.max(1, Math.ceil(total / (1 / 30)));
    for (let i = 0; i < n; i++) flow.update(total / n, {
      intake: headerType === 'draper',
      feedKgS: sc ? sc.feedKgS : undefined,
      tank: sc ? { mass: sc.tankMass, unloading: sc.unloadFlowing } : undefined,
      unloadFloor: sc && fieldView?.cart.visible ? spec.field.cart.top - 0.3 : undefined,
      pose,
      engineOn: machine.engineOn,
      headerOn: machine.headerOn,
      separatorOn: machine.separatorOn,
      unloadOn: machine.unloadOn,
      groundSpeed: machine.groundSpeed,
      yield: crop.yield,
      cropHeight: crop.cropHeight,
      mogRatio: crop.autoMog ? undefined : crop.mog,
      draperSide: rates.draperSide,
      draperCenter: rates.draperCenter,
      elevator: rates.elevator,
    });
    flowView.sync();
  }
  flowView.root.visible = view.flow && view.explode === 0;
  if (fieldOn) groundDist = 0;
  groundDist = (groundDist + rates.ground * dt * ts) % 1;
  grid.position.x = -groundDist;
  if (now - lastReadout > 250) {
    lastReadout = now;
    renderReadout(rates);
    renderHarvest();
  }
  controls.update();
  renderer.render(scene, camera);
  if (view.labels) {
    updateLabels(now);
    labelRenderer.render(scene, camera);
  }
});

// e2e テスト用の参照（本番動作には使わない）
(window as unknown as { __combine: unknown }).__combine = {
  get violations() { return violations; },
  setMode(m: typeof view.mode) { setMode(m); gui.controllersRecursive().forEach((c) => c.updateDisplay()); },
  setCamera,
  setPose: (p: Pose) => setPose(p, true),
  setMachine: (m: Partial<typeof machine>) => Object.assign(machine, m),
  setExplode: (f: number) => { view.explode = f; model.setExplode(f); runCheck(); applyView(); },
  get animatedCount() { return animator.count; },
  get frames() { return frames; },
  get harvest() { return report; },
  get flow() { return flow.stats(); },
  setTankMass: (kg: number) => flow.setTankMass(kg),
  setHeader,
  setLabels: (on: boolean) => { view.labels = on; labelRoot.visible = on; labelRenderer.domElement.hidden = !on; applyView(); },
  get blurred() { return [...animator.blurred]; },
  phaseOf: (k: Parameters<typeof animator.phaseOf>[0]) => animator.phaseOf(k),
  info: () => renderer.info.render,
  field: {
    show: (on: boolean) => setFieldMode(on),
    run: (on: boolean, speedUp?: number) => { if (speedUp) fieldCfg.speedUp = speedUp; fieldCfg.running = on; },
    finish: () => { finishScenario(); return scenario!.report(); },
    reset: (p: Partial<ScenarioParams>) => { Object.assign(fieldCfg, p); resetScenario(); },
    get report() { return scenario?.report() ?? null; },
    get t() { return scenario?.t ?? 0; },
    get nearChunks() { return fieldView?.nearChunks ?? 0; },
    quality: (q: '詳細' | '軽量') => { fieldCfg.quality = q; fieldView?.setQuality(q === '軽量' ? 'low' : 'high'); gui.controllersRecursive().forEach((c) => c.updateDisplay()); },
  },
};
