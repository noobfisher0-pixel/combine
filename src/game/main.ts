/**
 * ゲームの画面（docs/game-design.md §7、G0〜G1）。
 * シミュレーション（src/game/sim）を実時間 60 Hz の固定刻みで進め、毎フレーム描く。
 * 機体は原点に固定し、圃場（FieldView.root）を機体の位置の逆変換で動かす（M6 と同じ）。
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FlowSystem } from '../flow/system';
import { motionRates, type MachineState } from '../model/machine';
import { buildParts } from '../model/parts';
import { Animator } from '../view/animator';
import { buildCartModel, FieldView, FIELD_SKY } from '../view/fieldView';
import { FlowView } from '../view/flowView';
import { MaterialLib } from '../view/materials';
import { buildModel } from '../view/scene';
import { BALANCE, REAL_DT, type Difficulty } from './balance';
import { standardMap, type GameMap } from './map';
import { KEY } from './sim/combine';
import { GameSim, type GameEvent } from './sim/game';
import { SPOUT } from './sim/cart';
import { toMachine } from '../field/field';
import { spec } from '../spec/spec';

// ---------- renderer / scene ----------
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = FIELD_SKY;
scene.fog = new Fog(FIELD_SKY.getHex(), 120, 320);
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
scene.add(new HemisphereLight(0xdfeeea, 0x2a2420, 0.6));
const sun = new DirectionalLight(0xffffff, 1.6);
sun.position.set(6, 10, 8);
scene.add(sun);

const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;

// ---------- combine ----------
const lib = new MaterialLib();
const model = buildModel(buildParts(), lib);
model.setDetail(true);
scene.add(model.root);
const animator = new Animator(model.root, model.proxies);
const flow = new FlowSystem(1);
const flowView = new FlowView(flow);
scene.add(flowView.root);
const machine: MachineState = { engineOn: true, separatorOn: true, headerOn: true, unloadOn: false, groundSpeed: 0, reelIndex: 1.2, timeScale: BALANCE.timeScale };

// ---------- round ----------
let map: GameMap;
let sim: GameSim;
let fieldView: FieldView | null = null;
let quality: 'high' | 'low' = new URLSearchParams(location.search).get('q') === 'low' ? 'low' : 'high';
let started = false;
let paused = false;
let camPsi = 0;
let difficulty: Difficulty = 'normal';
let tutorial = false;

// カート（圃場座標で動かす）、経路の線、待つ場所の旗
const cartModel = buildCartModel();
const pathLine = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xe0ae4e }));
pathLine.frustumCulled = false;
const flag = new Group();
{
  const pole = new Mesh(new CylinderGeometry(0.06, 0.06, 3, 8), new MeshStandardMaterial({ color: 0xdddddd }));
  pole.position.y = 1.5;
  const cloth = new Mesh(new ConeGeometry(0.5, 1.2, 3).rotateZ(-Math.PI / 2), new MeshStandardMaterial({ color: 0xe0ae4e, roughness: 0.6 }));
  cloth.position.set(0.6, 2.6, 0);
  flag.add(pole, cloth);
}
let lastPath: unknown = null;

function newRound() {
  map = standardMap();
  sim = new GameSim(map, { difficulty, roundTime: tutorial ? Infinity : undefined });
  if (fieldView) scene.remove(fieldView.root);
  fieldView = new FieldView(map.field, { headland: map.headland });
  fieldView.setQuality(quality);
  fieldView.root.add(buildProps(map), cartModel, pathLine, flag);
  scene.add(fieldView.root);
  flow.clear();
  camPsi = sim.combine.psi;
  model.setPose(sim.pose);
  resultEl.hidden = true;
  lastEventShown = 0;
  lastPath = null;
  tutStep = 0;
  tutTurn = 0;
  tutOdo = 0;
  tutSteered = false;
  $('tut').hidden = !tutorial;
  renderTutorial();
}

/** カートの形・経路・旗を、シミュレーションの状態に合わせる（圃場座標） */
function syncCart() {
  const c = sim.cart;
  cartModel.position.set(c.x, 0, c.z);
  cartModel.rotation.y = c.psi;
  const grain = cartModel.userData.grain as Mesh;
  grain.visible = c.load > 1;
  grain.position.y = 1.1 + (c.load / BALANCE.cart.capacity) * (spec.field.cart.top - 1.2);
  if (c.path !== lastPath) {
    lastPath = c.path;
    const pts = c.path ?? [];
    pathLine.geometry.setAttribute('position', new Float32BufferAttribute(pts.flatMap(([x, z]) => [x, 0.3, z]), 3));
    pathLine.geometry.computeBoundingSphere();
  }
  pathLine.visible = !!c.path && (c.state === 'toCombine' || c.state === 'waiting' || c.state === 'toTruck');
  flag.visible = c.state === 'waiting' && !!c.waitPoint;
  if (c.waitPoint) flag.position.set(c.waitPoint[0], 0, c.waitPoint[1]);
}

/** 柵とトラック（圃場座標） */
function buildProps(m: GameMap): Group {
  const g = new Group();
  const w = m.world;
  const post = new BoxGeometry(0.12, 1.2, 0.12);
  const postMat = new MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.9 });
  const pts: Array<[number, number]> = [];
  for (let x = w.x0; x <= w.x1; x += 4) pts.push([x, w.z0], [x, w.z1]);
  for (let z = w.z0 + 4; z < w.z1; z += 4) pts.push([w.x0, z], [w.x1, z]);
  const posts = new InstancedMesh(post, postMat, pts.length);
  const mtx = new Matrix4();
  pts.forEach(([x, z], i) => posts.setMatrixAt(i, mtx.makeTranslation(x, 0.6, z)));
  g.add(posts);
  const railMat = new MeshStandardMaterial({ color: 0x8a7a63, roughness: 0.9 });
  for (const [x0, z0, x1, z1] of [[w.x0, w.z0, w.x1, w.z0], [w.x0, w.z1, w.x1, w.z1], [w.x0, w.z0, w.x0, w.z1], [w.x1, w.z0, w.x1, w.z1]]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rail = new Mesh(new BoxGeometry(len, 0.08, 0.06), railMat);
    rail.position.set((x0 + x1) / 2, 1.0, (z0 + z1) / 2);
    rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    g.add(rail);
  }
  // トラック（運転台と、穀物を積む荷台のトレーラー）。実在の配色は使わない
  const truck = new Group();
  const cabMat = new MeshStandardMaterial({ color: 0x9a3b2f, roughness: 0.5, metalness: 0.2 });
  const trailerMat = new MeshStandardMaterial({ color: 0xb8bcb6, roughness: 0.4, metalness: 0.4 });
  const dark = new MeshStandardMaterial({ color: 0x202426, roughness: 0.9 });
  const add = (geo: BoxGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number) => {
    const mm = new Mesh(geo, mat);
    mm.position.set(x, y, z);
    truck.add(mm);
  };
  add(new BoxGeometry(2.4, 2.6, 2.5), cabMat, 7.6, 2.0, 0);
  add(new BoxGeometry(12, 1.6, 2.5), trailerMat, -0.5, 2.3, 0);
  add(new BoxGeometry(12, 0.3, 2.3), dark, -0.5, 1.2, 0);
  for (const x of [-5.5, -4.2, 5.8, 7.6]) for (const z of [-1.05, 1.05]) add(new BoxGeometry(1.0, 1.0, 0.4), dark, x, 0.5, z);
  truck.position.set(m.truck.x, 0, m.truck.z);
  truck.rotation.y = m.truck.psi;
  g.add(truck);
  return g;
}

// ---------- input ----------
const held = new Set<string>();
let edges = 0;
const CODE: Record<string, number> = {
  KeyW: KEY.up, ArrowUp: KEY.up, KeyS: KEY.down, ArrowDown: KEY.down,
  KeyA: KEY.left, ArrowLeft: KEY.left, KeyD: KEY.right, ArrowRight: KEY.right,
};
const EDGE: Record<string, number> = { Space: KEY.header, KeyQ: KEY.auger, KeyF: KEY.hold, KeyE: KEY.cart };
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !started) return start();
  if (e.code === 'KeyE' && e.shiftKey && !e.repeat) {
    held.add(e.code);
    edges |= KEY.cart | KEY.cartForce;
    return;
  }
  if (e.code === 'Escape') return setPaused(!paused);
  if (e.code === 'KeyR' && paused) return retry();
  if (e.code === 'KeyC' && !e.repeat) return cycleCamera();
  if (CODE[e.code] !== undefined || EDGE[e.code] !== undefined) e.preventDefault();
  if (e.repeat) return;
  held.add(e.code);
  if (EDGE[e.code] !== undefined) edges |= EDGE[e.code];
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => {
  held.clear();
  if (started && !sim.over) setPaused(true);
});
function keysNow(): number {
  let k = edges;
  for (const c of held) k |= CODE[c] ?? 0;
  return k;
}

// ---------- camera ----------
type CamMode = '追従' | '高い追従' | '真上' | '自由';
const CAMS: CamMode[] = ['追従', '高い追従', '真上', '自由'];
let camMode: CamMode = '追従';
function cycleCamera() {
  camMode = CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length];
  controls.enabled = camMode === '自由';
  if (camMode === '自由') {
    controls.target.set(2, 1, 0);
    controls.update();
  }
  toast(`カメラ：${camMode}`);
}
const rot = new Matrix4();
function updateCamera(dtReal: number) {
  if (camMode === '自由') {
    controls.update();
    return;
  }
  // 少し遅れてついてくる：遅れた向き camPsi と今の向きの差だけ、機体座標で回す
  camPsi += (sim.combine.psi - camPsi) * (1 - Math.exp(-dtReal / 0.5));
  rot.makeRotationY(camPsi - sim.combine.psi);
  const [pos, look] =
    camMode === '追従' ? [new Vector3(-15, 7, 0), new Vector3(6, 0.5, 0)]
    : camMode === '高い追従' ? [new Vector3(-24, 22, 0), new Vector3(10, 0, 0)]
    : [new Vector3(-4, 70, 0), new Vector3(8, 0, 0)];
  camera.position.copy(pos.applyMatrix4(rot));
  camera.up.set(0, 1, 0);
  camera.lookAt(look.applyMatrix4(rot));
}

// ---------- HUD ----------
const $ = (id: string) => document.getElementById(id)!;
const startEl = $('start');
const pauseEl = $('pause');
const resultEl = $('result');
const toastEl = $('toast');
let toastTimer = 0;
function toast(text: string, kind: '' | 'warn' | 'bad' = '') {
  toastEl.textContent = text;
  toastEl.className = `toast ${kind}`;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 2200);
}
let lastEventShown = 0;
const EVENT_TEXT: Record<GameEvent['kind'], [string, '' | 'warn' | 'bad']> = {
  cartCalled: ['カートを呼びました', ''],
  cartRecalled: ['カートをトラックへ帰します', ''],
  cartNoLane: ['左側に通り道がありません。行程の出口で待ちます', 'warn'],
  cartArrived: ['カートが横に来ました（Q で排出）', ''],
  cartFull: ['カートが満杯：トラックへ戻ります', ''],
  cartStuck: ['カートが進めません：トラックへ戻ります', 'bad'],
  cartDumped: ['トラックに下ろしました', ''],
  spill: ['カートがいません：地面にこぼれています', 'bad'],
  noCart: ['カートが横にいないので排出しません', 'warn'],
  tank70: ['タンク 70 %', 'warn'],
  tank90: ['タンク 90 % ― もうすぐ満杯', 'warn'],
  full: ['タンクが満杯：刈った小麦は入りません', 'bad'],
  autoStop: ['満杯になるので自動で止まりました', 'warn'],
  collision: ['衝突！ 2 秒動けません', 'bad'],
  timeUp: ['時間切れ', ''],
};
const t1 = (kg: number) => (kg / 1000).toFixed(1);
function renderHud() {
  const c = sim.combine;
  const h = sim.harvest;
  const rem = sim.remaining / BALANCE.timeScale; // 表示は実時間
  $('time').textContent = `${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}`;
  $('time').classList.toggle('low', rem < 30);
  $('score').innerHTML = `${t1(sim.truck)}<span class="unit">t</span>`;
  const ho = sim.lastHandoff / BALANCE.timeScale;
  const hoEl = $('handoff');
  hoEl.textContent = Number.isFinite(ho) ? (ho > 0 ? `${Math.floor(ho / 60)}:${String(Math.floor(ho % 60)).padStart(2, '0')}` : '間に合わない') : '―';
  hoEl.classList.toggle('low', Number.isFinite(ho) && ho < 30);
  const cart = sim.cart;
  const CART_NAMES = { idle: '待機', toCombine: '向かう', waiting: '待つ', alongside: '並走', toTruck: '帰る', dumping: '荷下ろし' } as const;
  const cs = $('cartState');
  const eta = cart.state === 'toCombine' || cart.state === 'toTruck' ? ` ${Math.ceil(cart.eta / BALANCE.timeScale)} 秒` : '';
  cs.textContent = CART_NAMES[cart.state] + eta + (cart.force ? '（強行）' : '');
  cs.className = `tag ${cart.state === 'alongside' ? 'on' : cart.state === 'waiting' ? 'warn' : ''}`;
  $('cartLoad').textContent = `${t1(cart.load)} / ${t1(BALANCE.cart.capacity)} t`;
  $('unloadState').textContent = sim.unloading ? (sim.cart.accepts(sim.combineView) ? '排出中' : 'こぼれている') : c.augerPos > 0 ? 'オーガ出し' : '';
  // 並走の範囲の図：スパウトの位置を荷台の座標で（横 ±1.2 m・前後 ±2.5 m が点線）
  const sp = sim.cart.state === 'alongside' ? toMachine(cart.place, ...spoutField()) : null;
  const dot = $('winSpout');
  dot.setAttribute('visibility', sp && c.augerPos > 0 ? 'visible' : 'hidden');
  if (sp) {
    dot.setAttribute('cx', String(100 + Math.max(-95, Math.min(95, sp[0] * 12))));
    dot.setAttribute('cy', String(20 + Math.max(-18, Math.min(18, sp[1] * 10))));
  }
  $('speed').textContent = (c.v * 3.6).toFixed(1);
  $('target').textContent = `目標 ${c.vTarget.toFixed(2)}`;
  const hdr = $('header');
  hdr.textContent = sim.headerDown ? '下（刈る）' : c.headerPos > 0.95 ? '上' : '動作中';
  hdr.className = `tag ${sim.headerDown ? 'on' : ''}`;
  const hold = $('hold');
  hold.textContent = c.loadHold ? '入' : '切';
  hold.className = `tag ${c.loadHold ? 'on' : ''}`;
  const load = h.load;
  $('load').textContent = (load * 100).toFixed(0);
  $('loadMark').innerHTML = load > 1 ? '<span class="tag bad">▲ 取りこぼし</span>' : load > 0.9 ? '<span class="tag warn">! 上限近く</span>' : '';
  const lm = $('loadMeter');
  lm.className = `meter ${load > 1 ? 'bad' : load > 0.9 ? 'warn' : ''}`;
  $('loadBar').style.width = `${Math.min(100, (load / (4 / 3)) * 100)}%`;
  const pm = $('predMark');
  pm.style.display = h.predicted > 0 ? '' : 'none';
  pm.style.left = `${Math.min(100, (h.predicted / (4 / 3)) * 100)}%`;
  const cap = BALANCE.tank.capacity;
  $('tank').textContent = t1(h.tank);
  const fill = h.tank / cap;
  const all = (h.tank + h.inTransit) / cap;
  $('tankBar').style.width = `${Math.min(100, fill * 100)}%`;
  $('transitBar').style.width = `${Math.min(100, all * 100)}%`;
  $('tankMeter').className = `meter ${fill >= 1 ? 'bad' : all >= 0.9 ? 'warn' : ''}`;
  $('transitTxt').textContent = `搬送中 ${t1(h.inTransit)} t`;
  const s = h.stats;
  const lost = s.overflow + s.rotorLoss + s.lodgedLoss + s.flattenLoss;
  $('lossTxt').textContent = lost > 1 ? `失った量 ${t1(lost)} t` : '';
  for (; lastEventShown < sim.events.length; lastEventShown++) {
    const ev = sim.events[lastEventShown];
    const [text, kind] = EVENT_TEXT[ev.kind];
    toast(text, kind);
  }
}

function spoutField(): [number, number] {
  const p = sim.place;
  const c = Math.cos(p.psi);
  const s = Math.sin(p.psi);
  return [p.x + c * SPOUT.x + s * SPOUT.z, p.z - s * SPOUT.x + c * SPOUT.z];
}

function showResult() {
  const s = sim.harvest.stats;
  $('resultRank').textContent = sim.rank;
  $('resultScore').textContent = `${t1(sim.truck)} t`;
  $('resultRatio').textContent = `理論上の上限 ${t1(sim.upperBound)} t の ${(sim.ratio * 100).toFixed(0)} %`;
  const rows: Array<[string, string]> = [
    ['刈ってタンクに入った量', `${t1(s.harvested)} t`],
    ['時間切れで最後に移した量', `${t1(sim.finalTransfer)} t`],
    ['数えなかった量（タンクに残った）', `${t1(sim.leftInTank)} t`],
    ['あふれ（満杯）', `${t1(s.overflow)} t`],
    ['取りこぼし（負荷）', `${t1(s.rotorLoss)} t`],
    ['こぼし（カートなしで排出）', `${t1(sim.spill)} t`],
    ['押し倒し（コンバイン）', `${t1(s.flattenLoss)} t`],
    ['踏み倒し（カート）', `${t1(sim.cart.trampleLoss)} t`],
    ['カートを待った時間', `${(sim.cart.waitTime / BALANCE.timeScale).toFixed(0)} 秒`],
    ['刈った面積', `${((s.cutCells * map.field.cell * map.field.cell) / 10000).toFixed(2)} ha`],
    ['衝突', `${sim.collisions} 回`],
  ];
  $('resultStats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  resultEl.hidden = false;
}

// ---------- tutorial（§7.3） ----------
let tutStep = 0;
let tutTurn = 0;
let tutOdo = 0;
let tutSteered = false;
const TUT: Array<{ text: string; done: () => boolean }> = [
  { text: 'W で走り出し、A / D で曲がってみましょう。後輪で曲がるので、後ろが外へ振れます。', done: () => tutOdo > 15 && tutSteered },
  { text: 'Space でヘッダを下げて刈りましょう。左下の負荷が 100 % を超えないように速さを合わせます（F で自動）。', done: () => sim.harvest.stats.cutCells > 400 },
  { text: 'E でカートを呼び、横に来たら Q で排出オーガを出します。カートは刈った跡と枕地しか走れません。', done: () => sim.cart.load > 2000 },
  { text: '排出は左側です。左が刈り跡になるように回ります（回り刈り）。畑の端では枕地へ出て、左へ大きく回って次の辺へ。半周（180°）回ってみましょう。', done: () => tutTurn > Math.PI },
  { text: 'E でカートを帰しましょう。トラックに入った量が得点です。', done: () => sim.truck > 0 },
];
function renderTutorial() {
  if (!tutorial) return;
  if (tutStep >= TUT.length) {
    $('tutStep').textContent = '完了';
    $('tutText').textContent = 'これで全部です。Esc → 「やり直し」でもう一度、またはタイトルから本番を始めましょう。';
    return;
  }
  $('tutStep').textContent = `${tutStep + 1} / ${TUT.length}`;
  $('tutText').textContent = TUT[tutStep].text;
}
let prevPsi = 0;
function updateTutorial() {
  if (!tutorial || tutStep >= TUT.length) return;
  tutOdo += Math.abs(sim.combine.v) * BALANCE.timeScale / 60;
  if (Math.abs(sim.combine.steer) > 10) tutSteered = true;
  tutTurn += Math.abs(sim.combine.psi - prevPsi);
  prevPsi = sim.combine.psi;
  if (TUT[tutStep].done()) {
    tutStep++;
    tutTurn = 0;
    renderTutorial();
    toast(tutStep >= TUT.length ? 'チュートリアル完了！' : 'よくできました');
  }
}

// ---------- flow ----------
function start(tut = false) {
  const sel = document.querySelector<HTMLInputElement>('input[name=diff]:checked');
  difficulty = (sel?.value as Difficulty) ?? 'normal';
  tutorial = tut;
  newRound();
  prevPsi = sim.combine.psi;
  started = true;
  startEl.hidden = true;
}
function setPaused(on: boolean) {
  if (!started || sim.over) return;
  paused = on;
  pauseEl.hidden = !on;
  held.clear();
}
function retry() {
  paused = false;
  pauseEl.hidden = true;
  newRound();
}
$('startBtn').addEventListener('click', () => start(false));
$('tutBtn').addEventListener('click', () => start(true));
$('titleBtn').addEventListener('click', () => {
  started = false;
  resultEl.hidden = true;
  startEl.hidden = false;
});
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('retryBtn').addEventListener('click', retry);
$('againBtn').addEventListener('click', () => newRound());
$('qualityBtn').addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  fieldView?.setQuality(quality);
  $('qualityBtn').textContent = `小麦の描画：${quality === 'high' ? '詳細' : '軽量'}`;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- loop ----------
newRound();
let acc = 0;
let last = performance.now();
let frames = 0;
let elapsed = 0;
const tmpVec = new Vector3();
renderer.setAnimationLoop((now) => {
  frames++;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const running = started && !paused && !sim.over;
  if (running) {
    acc += dt;
    let n = 0;
    while (acc >= REAL_DT && n < 10) {
      sim.step(keysNow());
      edges = 0;
      acc -= REAL_DT;
      n++;
      updateTutorial();
    }
    if (n === 10) acc = 0;
    if (sim.over) showResult();
  }
  model.setPose(sim.pose);
  machine.groundSpeed = sim.combine.v * 3.6;
  machine.unloadOn = sim.unloading;
  const ts = running ? BALANCE.timeScale : 0;
  animator.update(dt, ts, motionRates(machine));
  flow.update(dt * ts, {
    pose: sim.pose, engineOn: true, headerOn: true, separatorOn: true, unloadOn: false,
    groundSpeed: machine.groundSpeed, yield: map.yield, cropHeight: map.cropHeight,
    draperSide: motionRates(machine).draperSide, draperCenter: 3.5, elevator: 3,
    feedKgS: sim.harvest.feedKgS, tank: { mass: sim.harvest.tank, unloading: sim.unloading },
    unloadFloor: sim.cart.accepts(sim.combineView) ? spec.field.cart.top - 0.3 : undefined,
  });
  syncCart();
  flowView.sync();
  elapsed += dt;
  const h = sim.harvest;
  fieldView!.update({ place: sim.place, knifeX: h.knifeX, knifeY: h.knifeY, headerDown: sim.headerDown, pose: sim.pose }, camera.getWorldPosition(tmpVec), elapsed);
  updateCamera(dt);
  renderHud();
  renderer.render(scene, camera);
});

// e2e テスト用の参照（本番動作には使わない）
(window as unknown as { __game: unknown }).__game = {
  get sim() { return sim; },
  get frames() { return frames; },
  get nearChunks() { return fieldView?.nearChunks ?? 0; },
  start: (tut = false) => start(tut),
  /** キーを押したままにする（e2e 用） */
  press: (code: string, on: boolean) => { if (on) { held.add(code); if (EDGE[code] !== undefined) edges |= EDGE[code]; } else held.delete(code); },
  setQuality: (q: 'high' | 'low') => { quality = q; fieldView?.setQuality(q); },
  /** 描かずに n 刻み進める（e2e 用。keys は毎刻みの入力） */
  fastForward: (n: number, keys = 0) => {
    for (let i = 0; i < n && !sim.over; i++) {
      sim.step(keysNow() | keys);
      edges = 0;
    }
    if (sim.over) showResult();
  },
  info: () => renderer.info.render,
};

