import * as THREE from 'three';
import { makeRow, difficultyOf, gapSeconds } from './gen';
import type { Kind } from './gen';

/* ============ konfigurasi (angka gameplay) ============ */
const LANES = [-2.4, 0, 2.4];
const SWITCH_RATE = 16;
const GRAVITY = 34;
const JUMP_V = 11;
const ROLL_TIME = 0.6;
const SPAWN_Z = -170;
const DESPAWN_Z = 14;
const START_SPEED = 16;
const MAX_SPEED = 38;
const ACCEL = 0.28;
const STEP = 1 / 60;
const PLAYER_HW = 0.34;
const PLAYER_HD = 0.35;
const STAND_H = 1.7;
const ROLL_H = 0.85;

/* ============ util ============ */
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/* ============ simpan progres (v1) ============ */
interface Save { version: 1; coins: number; bestScore: number; muted: boolean }
const SAVE_KEY = 'runner.save.v1';
function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.version === 1) {
        return { version: 1, coins: Number(d.coins) || 0, bestScore: Number(d.bestScore) || 0, muted: !!d.muted };
      }
    }
  } catch { /* storage ditolak/rusak: pakai default */ }
  return { version: 1, coins: 0, bestScore: 0, muted: false };
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* abaikan */ }
}
const save = loadSave();

/* ============ audio sederhana ============ */
let actx: AudioContext | null = null;
let muted = save.muted;
function unlockAudio() {
  if (!actx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) actx = new AC();
  }
  if (actx && actx.state === 'suspended') void actx.resume();
}
function tone(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.05) {
  if (!actx || muted) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const sfx = {
  coin: () => tone(900, 1500, 0.12, 'triangle', 0.06),
  jump: () => tone(300, 620, 0.15, 'square', 0.035),
  move: () => tone(520, 430, 0.05, 'sine', 0.04),
  roll: () => tone(420, 200, 0.18, 'sine', 0.05),
  crash: () => tone(170, 40, 0.5, 'sawtooth', 0.12),
};

/* ============ renderer & scene ============ */
const canvas = $<HTMLCanvasElement>('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const BG = 0x120a2e;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 40, 160);
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 300);
const camBase = new THREE.Vector3(0, 4.3, 7.2);
scene.add(new THREE.HemisphereLight(0x9bb0ff, 0x2a1850, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(6, 14, 8);
scene.add(sun);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 82 : camera.aspect < 1.2 ? 72 : 62;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ============ material & geometri ============ */
const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const mat = {
  ground: std(0x17122e, { roughness: 0.95 }),
  rail: std(0x9aa0c8, { metalness: 0.6, roughness: 0.4 }),
  sleeper: std(0x2d2558, { roughness: 1 }),
  trains: [0x2f6bff, 0xff3c8e, 0x19c9a8, 0x8a4dff].map((c) => std(c, { roughness: 0.5, metalness: 0.2 })),
  trainWin: std(0x111111, { emissive: 0xfff2b0, emissiveIntensity: 0.9 }),
  trainStripe: std(0xffffff, { emissive: 0x333333 }),
  low: std(0xffb020, { emissive: 0x663d00 }),
  bar: std(0xff4d4d, { emissive: 0x660000 }),
  post: std(0x4a4a70),
  coin: std(0xffc94d, { emissive: 0x8a5a00, metalness: 0.8, roughness: 0.3 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
};
const coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 18);
coinGeo.rotateX(Math.PI / 2);

/* ============ dunia statis: tanah, rel ============ */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 420), mat.ground);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -160;
scene.add(ground);
const railGeo = new THREE.BoxGeometry(0.12, 0.12, 420);
for (const lx of LANES) {
  for (const off of [-0.6, 0.6]) {
    const r = new THREE.Mesh(railGeo, mat.rail);
    r.position.set(lx + off, 0.06, -160);
    scene.add(r);
  }
}
// bantalan rel yang berputar (memberi rasa kecepatan)
const SLEEPER_N = 46, SLEEPER_GAP = 3.2, SLEEPER_LEN = SLEEPER_N * SLEEPER_GAP;
const sleeperGeo = new THREE.BoxGeometry(7.6, 0.08, 0.45);
const sleepers: THREE.Mesh[] = [];
for (let i = 0; i < SLEEPER_N; i++) {
  const m = new THREE.Mesh(sleeperGeo, mat.sleeper);
  m.position.set(0, 0.04, DESPAWN_Z - i * SLEEPER_GAP);
  scene.add(m);
  sleepers.push(m);
}

/* ============ gedung samping ============ */
function windowTexture(seed: number) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  const r = mulberry32(seed);
  const cols = ['#ffd36b', '#6be7ff', '#ff7bd0'];
  for (let y = 4; y < 124; y += 10)
    for (let x = 4; x < 60; x += 10)
      if (r() < 0.45) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, 6, 6); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const bMats = [11, 22, 33].map((s, i) =>
  new THREE.MeshStandardMaterial({ color: [0x1b1646, 0x241a52, 0x15113a][i], emissive: 0xffffff, emissiveMap: windowTexture(s), emissiveIntensity: 0.9, roughness: 0.9 }));
const bGeo = new THREE.BoxGeometry(1, 1, 1);
const BUILD_N = 14, BUILD_GAP = 14, BUILD_LEN = BUILD_N * BUILD_GAP;
const buildings: THREE.Mesh[] = [];
function rerollBuilding(m: THREE.Mesh, side: number) {
  const w = 5 + rng() * 5, h = 10 + rng() * 26, d = 8 + rng() * 4;
  m.scale.set(w, h, d);
  m.position.x = side * (9 + w / 2 + rng() * 3);
  m.position.y = h / 2;
  m.material = bMats[Math.floor(rng() * bMats.length)];
}
for (const side of [-1, 1]) {
  for (let i = 0; i < BUILD_N; i++) {
    const m = new THREE.Mesh(bGeo, bMats[0]);
    rerollBuilding(m, side);
    m.userData.side = side;
    m.position.z = DESPAWN_Z - i * BUILD_GAP;
    scene.add(m);
    buildings.push(m);
  }
}

/* ============ pemain (kurir neon, model prosedural) ============ */
function limb(w: number, h: number, d: number, color: number, x: number, y: number) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color));
  m.position.y = -h / 2;
  pivot.add(m);
  return pivot;
}
const model = new THREE.Group();
const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.42), std(0x19e3c4));
bodyM.position.y = 1.05;
const headM = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), std(0xffd9b8));
headM.position.y = 1.72;
const capM = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.56), std(0xff3c8e, { emissive: 0x551133 }));
capM.position.y = 1.95;
const packM = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), std(0xffb020));
packM.position.set(0, 1.1, 0.32);
const armL = limb(0.2, 0.7, 0.2, 0x13b8a0, -0.47, 1.42);
const armR = limb(0.2, 0.7, 0.2, 0x13b8a0, 0.47, 1.42);
const legL = limb(0.24, 0.65, 0.26, 0x2a2a66, -0.18, 0.65);
const legR = limb(0.24, 0.65, 0.26, 0x2a2a66, 0.18, 0.65);
model.add(bodyM, headM, capM, packM, armL, armR, legL, legR);
const playerGroup = new THREE.Group();
playerGroup.add(model);
scene.add(playerGroup);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), mat.shadow);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.03;
scene.add(blob);

const p = { lane: 1, x: 0, y: 0, vy: 0, rolling: false, rollT: 0, queueRoll: false, alive: true };

/* ============ rintangan & koin (dengan pooling) ============ */
interface Obstacle { obj: THREE.Group; kind: Kind; minY: number; maxY: number; halfW: number; halfD: number }
interface Coin { obj: THREE.Mesh }
const obstacles: Obstacle[] = [];
const coins: Coin[] = [];
const obstaclePool: Record<Kind, THREE.Group[]> = { train: [], low: [], high: [] };
const coinPool: THREE.Mesh[] = [];

function makeObstacleObj(kind: Kind): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'train') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.0, 6), mat.trains[0]);
    body.position.y = 1.5;
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.7, 5.2), mat.trainWin);
    win.position.y = 2.1;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.03, 0.3, 6.02), mat.trainStripe);
    stripe.position.y = 0.7;
    g.add(body, win, stripe);
    g.userData.body = body;
  } else if (kind === 'low') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.5), mat.low);
    b.position.y = 0.35;
    g.add(b);
  } else {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 0.5), mat.bar);
    bar.position.y = 1.7;
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), mat.post);
    pL.position.set(-1.1, 1.1, 0);
    const pR = pL.clone();
    pR.position.x = 1.1;
    g.add(bar, pL, pR);
  }
  return g;
}
function addObstacle(kind: Kind, x: number, z: number) {
  const obj = obstaclePool[kind].pop() ?? makeObstacleObj(kind);
  obj.position.set(x, 0, z);
  if (kind === 'train') {
    (obj.userData.body as THREE.Mesh).material = mat.trains[Math.floor(rng() * mat.trains.length)];
  }
  scene.add(obj);
  const spec = kind === 'train' ? { minY: 0, maxY: 3, halfW: 0.92, halfD: 3 }
    : kind === 'low' ? { minY: 0, maxY: 0.7, halfW: 1.1, halfD: 0.25 }
    : { minY: 1.2, maxY: 2.2, halfW: 1.15, halfD: 0.25 };
  obstacles.push({ obj, kind, ...spec });
}
function releaseObstacle(o: Obstacle) {
  scene.remove(o.obj);
  obstaclePool[o.kind].push(o.obj);
}
function addCoin(x: number, z: number) {
  const obj = coinPool.pop() ?? new THREE.Mesh(coinGeo, mat.coin);
  obj.position.set(x, 1.0, z);
  scene.add(obj);
  coins.push({ obj });
}
function releaseCoin(c: Coin) {
  scene.remove(c.obj);
  coinPool.push(c.obj);
}

/* ============ status permainan ============ */
type State = 'menu' | 'playing' | 'paused' | 'over';
let state: State = 'menu';
let speed = START_SPEED;
let elapsed = 0;
let distance = 0;
let runCoins = 0;
let lastSafe = 1;
let lastRowZ = -45;
let pendingGap = 20;
let shake = 0;
let animT = 0;

function spawnRow(z: number) {
  const d = difficultyOf(speed, START_SPEED, MAX_SPEED);
  const row = makeRow(rng, lastSafe, d);
  lastSafe = row.safe;
  pendingGap = gapSeconds(d) * speed;
  row.slots.forEach((k, lane) => { if (k) addObstacle(k, LANES[lane], z); });
  // jalur koin di jalur aman, berhenti sebelum baris berikutnya
  const end = z - pendingGap + 6;
  let cz = z - 6, n = 0;
  while (cz > end && n < 8) { addCoin(LANES[row.safe], cz); cz -= 2.2; n++; }
}

function reset() {
  for (const o of obstacles.splice(0)) releaseObstacle(o);
  for (const c of coins.splice(0)) releaseCoin(c);
  rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  elapsed = 0; speed = START_SPEED; distance = 0; runCoins = 0; lastSafe = 1; shake = 0;
  Object.assign(p, { lane: 1, x: 0, y: 0, vy: 0, rolling: false, rollT: 0, queueRoll: false, alive: true });
  let z = -45;
  while (z > SPAWN_Z) {
    spawnRow(z);
    lastRowZ = z;
    z -= pendingGap;
  }
}

function score() { return Math.floor(distance) + runCoins * 5; }

/* ============ HUD & layar ============ */
const hud = $('hud'), menu = $('menu'), over = $('over'), pauseEl = $('pause'), flash = $('flash');
function show(el: HTMLElement, on: boolean) { el.classList.toggle('hidden', !on); }
function refreshMenu() {
  $('menuBest').textContent = String(save.bestScore);
  $('menuCoins').textContent = String(save.coins);
  $('best').textContent = String(save.bestScore);
}
refreshMenu();
const muteBtn = $<HTMLButtonElement>('mute');
muteBtn.textContent = muted ? '🔇' : '🔊';

function start() {
  unlockAudio();
  reset();
  state = 'playing';
  show(menu, false); show(over, false); show(pauseEl, false); show(hud, true);
}
function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  show(pauseEl, true);
}
function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  lastTime = performance.now();
  show(pauseEl, false);
}
function crash() {
  p.alive = false;
  state = 'over';
  sfx.crash();
  shake = 0.7;
  flash.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove('on')));
  const final = score();
  const isBest = final > save.bestScore;
  if (isBest) save.bestScore = final;
  save.coins += runCoins;
  writeSave();
  setTimeout(() => {
    if (state !== 'over') return;
    $('overScore').textContent = String(final);
    $('overCoins').textContent = String(runCoins);
    $('overBest').textContent = String(save.bestScore);
    show($('newBest'), isBest);
    refreshMenu();
    show(hud, false);
    show(over, true);
  }, 450);
}

/* ============ input ============ */
type Cmd = 'left' | 'right' | 'up' | 'down';
function startRoll() { p.rolling = true; p.rollT = ROLL_TIME; sfx.roll(); }
function cmd(c: Cmd) {
  if (state !== 'playing' || !p.alive) return;
  if (c === 'left' && p.lane > 0) { p.lane--; sfx.move(); }
  else if (c === 'right' && p.lane < 2) { p.lane++; sfx.move(); }
  else if (c === 'up' && p.y <= 0.001) { p.vy = JUMP_V; p.rolling = false; p.rollT = 0; sfx.jump(); }
  else if (c === 'down') {
    if (p.y > 0.001) { p.vy = Math.min(p.vy, -18); p.queueRoll = true; }
    else if (!p.rolling) startRoll();
  }
}
window.addEventListener('keydown', (e) => {
  unlockAudio();
  const k = e.key;
  if (state === 'playing') {
    if (e.repeat) return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') cmd('left');
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') cmd('right');
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') cmd('up');
    else if (k === 'ArrowDown' || k === 's' || k === 'S') cmd('down');
    else if (k === 'Escape' || k === 'p' || k === 'P') pause();
    else return;
    e.preventDefault();
  } else if (state === 'paused') {
    if (k === 'Escape' || k === 'p' || k === 'P' || k === 'Enter' || k === ' ') { resume(); e.preventDefault(); }
  } else if (k === 'Enter' || k === ' ') {
    start(); e.preventDefault();
  }
});
// geser (swipe) lewat Pointer Events
let sx = 0, sy = 0, tracking = false;
const SWIPE_MIN = 28;
window.addEventListener('pointerdown', (e) => { unlockAudio(); sx = e.clientX; sy = e.clientY; tracking = true; });
window.addEventListener('pointermove', (e) => {
  if (!tracking || state !== 'playing') return;
  const dx = e.clientX - sx, dy = e.clientY - sy;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  if (Math.abs(dx) > Math.abs(dy)) cmd(dx < 0 ? 'left' : 'right');
  else cmd(dy < 0 ? 'up' : 'down');
  sx = e.clientX; sy = e.clientY;
});
const endTrack = () => { tracking = false; };
window.addEventListener('pointerup', endTrack);
window.addEventListener('pointercancel', endTrack);
$('playBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('resumeBtn').addEventListener('click', resume);
muteBtn.addEventListener('click', () => {
  unlockAudio();
  muted = !muted; save.muted = muted; writeSave();
  muteBtn.textContent = muted ? '🔇' : '🔊';
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', pause);

/* ============ update ============ */
function scrollWorld(dz: number) {
  for (const s of sleepers) { s.position.z += dz; if (s.position.z > DESPAWN_Z) s.position.z -= SLEEPER_LEN; }
  for (const b of buildings) {
    b.position.z += dz;
    if (b.position.z > DESPAWN_Z + 10) { b.position.z -= BUILD_LEN; rerollBuilding(b, b.userData.side as number); }
  }
}

function update(dt: number) {
  elapsed += dt;
  speed = Math.min(MAX_SPEED, START_SPEED + elapsed * ACCEL);
  const dz = speed * dt;
  distance += dz * 0.5;
  scrollWorld(dz);

  for (const o of obstacles) o.obj.position.z += dz;
  for (const c of coins) { c.obj.position.z += dz; c.obj.rotation.y += dt * 5; }
  lastRowZ += dz;
  if (lastRowZ - SPAWN_Z >= pendingGap) { spawnRow(SPAWN_Z); lastRowZ = SPAWN_Z; }

  // pemain
  p.x += (LANES[p.lane] - p.x) * (1 - Math.exp(-SWITCH_RATE * dt));
  if (p.y > 0 || p.vy > 0) {
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; if (p.queueRoll) { p.queueRoll = false; startRoll(); } }
  }
  if (p.rolling) { p.rollT -= dt; if (p.rollT <= 0) p.rolling = false; }
  const ph = p.rolling ? ROLL_H : STAND_H;

  // tabrakan
  for (const o of obstacles) {
    const oz = o.obj.position.z;
    if (Math.abs(oz) > o.halfD + PLAYER_HD) continue;
    if (Math.abs(o.obj.position.x - p.x) > o.halfW + PLAYER_HW) continue;
    if (p.y + ph > o.minY + 0.02 && p.y < o.maxY - 0.02) { crash(); return; }
  }
  // koin
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i].obj;
    if (Math.abs(c.position.z) < 0.9 && Math.abs(c.position.x - p.x) < 0.8 && p.y < 1.8 && p.y + ph > 0.2) {
      releaseCoin(coins[i]); coins.splice(i, 1); runCoins++; sfx.coin();
    }
  }
  // buang yang sudah lewat
  for (let i = obstacles.length - 1; i >= 0; i--) if (obstacles[i].obj.position.z > DESPAWN_Z) { releaseObstacle(obstacles[i]); obstacles.splice(i, 1); }
  for (let i = coins.length - 1; i >= 0; i--) if (coins[i].obj.position.z > DESPAWN_Z) { releaseCoin(coins[i]); coins.splice(i, 1); }

  animT += dt * (9 + speed * 0.2);
  $('score').textContent = String(score());
  $('runCoins').textContent = String(runCoins);
  if (score() > save.bestScore) $('best').textContent = String(score());
}

function poseAndCamera(dt: number, running: boolean) {
  const swing = running ? Math.sin(animT) * 0.9 : 0;
  const airborne = p.y > 0.01;
  armL.rotation.x = airborne ? -2.2 : swing;
  armR.rotation.x = airborne ? -2.2 : -swing;
  legL.rotation.x = airborne ? -0.6 : -swing;
  legR.rotation.x = airborne ? 0.5 : swing;
  const rollK = p.rolling ? 1 : 0;
  model.scale.y += ((rollK ? 0.5 : 1) - model.scale.y) * Math.min(1, dt * 20);
  model.rotation.x += ((rollK ? -0.6 : 0) - model.rotation.x) * Math.min(1, dt * 20);
  playerGroup.position.set(p.x, p.y, 0);
  playerGroup.rotation.z = (p.x - LANES[p.lane]) * 0.1;
  playerGroup.position.y += running && !airborne && !p.rolling ? Math.abs(Math.sin(animT)) * 0.08 : 0;
  blob.position.x = p.x;
  blob.scale.setScalar(Math.max(0.4, 1 - p.y * 0.25));

  shake = Math.max(0, shake - dt * 2);
  camera.position.set(
    camBase.x + p.x * 0.45 + (Math.random() - 0.5) * shake,
    camBase.y + (Math.random() - 0.5) * shake * 0.6,
    camBase.z);
  camera.lookAt(p.x * 0.25, 1.4, -9);
}

/* ============ loop (langkah tetap 60 Hz) ============ */
let lastTime = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  if (state === 'playing') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5 && state === 'playing') { update(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    poseAndCamera(dt, true);
  } else if (state === 'menu') {
    scrollWorld(7 * dt);
    animT += dt * 10;
    poseAndCamera(dt, true);
  } else if (state === 'over') {
    poseAndCamera(dt, false);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
reset();
requestAnimationFrame(frame);
