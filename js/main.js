// =====================================================================
//  BOLIDE ARCADE — boucle de jeu
//  Qualification (1 tour chrono) puis course (2 tours) contre 7 IA.
// =====================================================================
import * as THREE from 'three';
import { TRACKS, buildTrack, PHYS, latGrip, engineAccel, nearestIndex, project, sample } from './tracks.js';
import { buildWorld, gridSlot, sampleAt } from './world.js';
import { buildCar, buildSteeringWheel, sharedMaterials, LIVERIES, EYE, MIRRORS } from './car.js';
import { setMaxAniso, rng } from './textures.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const AUTO = params.has('auto');
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---------------------------------------------------------------------
//  Réglages
// ---------------------------------------------------------------------
const LEVELS = {
  debutant: { name: 'Débutant', ai: [0.72, 0.84], assist: 1.0, wallAssist: 1.6, grass: 0.6 },
  pilote:   { name: 'Pilote',   ai: [0.84, 0.93], assist: 1.18, wallAssist: 0.6, grass: 0.85 },
  champion: { name: 'Champion', ai: [0.92, 0.985], assist: 0, wallAssist: 0, grass: 1 },
};
const AI_NAMES = ['A. Moreau', 'L. Conti', 'T. Fischer', 'S. Okafor', 'K. Novak', 'R. Castro', 'J. Lindgren'];
const QUALI_CAP = 60;      // s : temps max de la qualification
const RACE_GRACE = 15;     // s : après l'arrivée du vainqueur
const RACE_CAP = 100;      // s : durée maxi de la course (partie < 3 min)
const MAX_STEER = 0.45;    // rad : braquage maxi des roues
const WHEELBASE = 3.5;

const store = {
  get(k, d) { try { const v = localStorage.getItem('bolide.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bolide.' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
};

const settings = {
  livery: store.get('livery', 'rouge'),
  track: store.get('track', 'monaco'),
  level: store.get('level', 'debutant'),
  name: store.get('name', ''),
  steerMode: store.get('steerMode', isTouch ? 'tilt' : 'keys'),
  sound: store.get('sound', true),
};
if (!isTouch && settings.steerMode !== 'keys') settings.steerMode = 'keys';
if (isTouch && settings.steerMode === 'keys') settings.steerMode = 'tilt';

// ---------------------------------------------------------------------
//  Rendu
// ---------------------------------------------------------------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
setMaxAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const quality = {
  pr: Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2),
  shadows: true,
  shadowSize: isTouch ? 1024 : 2048,
  mirrorEvery: isTouch ? 2 : 1,
};
renderer.setPixelRatio(quality.pr);

const halfFloat = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
const mirrorRT = [0, 1].map(() => new THREE.WebGLRenderTarget(400, 160, { type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 0 }));

const mainCam = new THREE.PerspectiveCamera(58, 1, 0.35, 4200);
mainCam.layers.enable(2); // arbres, panneaux : vue principale seulement
const cockCam = new THREE.PerspectiveCamera(58, 1, 0.03, 30);
const mirrorCams = MIRRORS.map((m, i) => {
  const c = new THREE.PerspectiveCamera(17, 2.5, 0.5, 900);
  c.position.set(m.x, m.y + 0.02, m.z + 0.03);
  c.rotation.set(-0.03, Math.PI + (i === 0 ? -0.1 : 0.1), 0);
  return c;
});

// Paysage forcé : si le système bascule l'écran en portrait pendant la
// partie (téléphone trop incliné en tournant le "volant"), on fait pivoter
// le jeu en CSS pour qu'il reste aligné avec le téléphone.
const app = $('app');
let baseAngle = 90, forcedRot = 0;
function viewSize() { return forcedRot % 180 !== 0 ? [window.innerHeight, window.innerWidth] : [window.innerWidth, window.innerHeight]; }
function updateRotation() {
  let rot = 0;
  if (isTouch && G && G.state !== 'menu') {
    const cur = screenAngle();
    if (cur === 90 || cur === 270) baseAngle = cur;
    else rot = ((baseAngle - cur) % 360 + 360) % 360;
  }
  if (rot !== forcedRot) {
    forcedRot = rot;
    if (!rot) app.style.cssText = '';
    else {
      const w = window.innerHeight, h = window.innerWidth;
      app.style.cssText = `left:${(window.innerWidth - w) / 2}px;top:${(window.innerHeight - h) / 2}px;width:${w}px;height:${h}px;right:auto;bottom:auto;transform:rotate(${rot}deg);`;
    }
  }
}
function resize() {
  updateRotation();
  const [w, h] = viewSize();
  if (forcedRot) app.style.left = ((window.innerWidth - w) / 2) + 'px', app.style.top = ((window.innerHeight - h) / 2) + 'px', app.style.width = w + 'px', app.style.height = h + 'px';
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  for (const c of [mainCam, cockCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
  if (preview) { preview.cam.aspect = w / h; preview.cam.updateProjectionMatrix(); }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => setTimeout(resize, 50));

// ---------------------------------------------------------------------
//  Circuits (construits une fois)
// ---------------------------------------------------------------------
const built = {};
for (const d of TRACKS) built[d.id] = buildTrack(d);

// ---------------------------------------------------------------------
//  Son
// ---------------------------------------------------------------------
const sound = new Sound();
sound.enabled = settings.sound;

// ---------------------------------------------------------------------
//  Entrées : pédales, clavier, inclinaison
// ---------------------------------------------------------------------
const input = { thr: false, brk: false, left: false, right: false, steer: 0, tilt: 0, tiltOK: false, tiltZero: 0, tiltSign: 1, gx: 0, gy: 0, lastMotion: 0 };
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function bindHold(el, prop) {
  const ids = new Set();
  const on = (e) => { e.preventDefault(); ids.add(e.pointerId); input[prop] = true; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* rien */ } };
  const off = (e) => { ids.delete(e.pointerId); if (!ids.size) { input[prop] = false; el.classList.remove('down'); } };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('lostpointercapture', off);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindHold($('gas'), 'thr');
bindHold($('brake'), 'brk');
bindHold($('btnLeft'), 'left');
bindHold($('btnRight'), 'right');

function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  if (typeof window.orientation === 'number') return (window.orientation + 360) % 360;
  return 0;
}
function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const ang = (isTouch && G.state !== 'menu' ? baseAngle : screenAngle()) * Math.PI / 180;
  const sx = a.x * Math.cos(ang) - a.y * Math.sin(ang);
  const sy = a.x * Math.sin(ang) + a.y * Math.cos(ang);
  const mag = Math.hypot(a.x, a.y, a.z || 0) || 1; // m/s² ou g selon l'appareil
  input.gx += (sx / mag - input.gx) * 0.35;
  input.gy += (sy / mag - input.gy) * 0.35;
  if (Math.abs(input.gy) > 0.3) input.tiltSign = input.gy > 0 ? 1 : -1;
  const s = input.tiltSign;
  if (Math.hypot(input.gx, input.gy) > 0.15) input.tilt = Math.atan2(-input.gx * s, input.gy * s) * 180 / Math.PI;
  input.tiltOK = true;
  input.lastMotion = performance.now();
}
async function enableTilt() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') return false;
    }
    window.addEventListener('devicemotion', onMotion);
    return true;
  } catch (err) { return false; }
}

function readSteer(dt) {
  let target = 0;
  if (settings.steerMode === 'tilt' && input.tiltOK) {
    const a = input.tilt - input.tiltZero;
    const dead = 1.5, max = 26;
    const m = Math.max(0, Math.abs(a) - dead) / (max - dead);
    target = Math.sign(a) * Math.min(1, Math.pow(m, 1.25));
    input.steer += (target - input.steer) * Math.min(1, dt * 18);
  } else {
    const l = input.left || keys.ArrowLeft || keys.KeyA || keys.KeyQ;
    const r = input.right || keys.ArrowRight || keys.KeyD;
    target = (r ? 1 : 0) - (l ? 1 : 0);
    const rate = target === 0 ? 7 : 3.2;
    input.steer += Math.max(-rate * dt, Math.min(rate * dt, target - input.steer));
  }
  return input.steer;
}
const throttle = () => input.thr || keys.ArrowUp || keys.KeyW || keys.KeyZ;
const braking = () => input.brk || keys.ArrowDown || keys.KeyS || keys.Space;

// ---------------------------------------------------------------------
//  État de jeu
// ---------------------------------------------------------------------
var G = {
  state: 'menu', t: 0, T: null, world: null, cars: [], player: null,
  raceTime: 0, lights: 0, lightsOutAt: 0, qualiTimes: [], results: null,
  shake: 0, paused: false, kerbT: 0, finishT: 0, leaderDone: -1, frame: 0,
};
window.__bolide = G;

class Car {
  constructor(o) { Object.assign(this, o); this.v = 0; this.prog = 0; this.d = 0; this.idx = 0; this.finished = false; this.finishTime = 0; this.steer = 0; this.lat = 0; this.hdg = 0; this.react = 0; this.passOff = 0; this.dPrev = 0; }
}

// ---------------------------------------------------------------------
//  Scène cockpit (voiture du joueur vue de l'intérieur)
// ---------------------------------------------------------------------
let cockpit = null;
function buildCockpit(livery) {
  if (cockpit) disposeObject(cockpit.scene);
  const scene = new THREE.Scene();
  const rig = new THREE.Group(); scene.add(rig);
  const car = buildCar(livery, null, { noDriver: true });
  rig.add(car);
  const wheel = buildSteeringWheel(livery);
  rig.add(wheel.root);
  // vitres des rétroviseurs (texture rendue, inversée horizontalement)
  MIRRORS.forEach((m, i) => {
    const g = new THREE.PlaneGeometry(0.30, 0.118);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k));
    const glass = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: mirrorRT[i].texture, color: 0xe8ecf0 }));
    glass.position.set(m.x, m.y, m.z + 0.0265);
    rig.add(glass);
  });
  rig.add(cockCam);
  cockCam.position.copy(EYE);
  const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x5a5850, 0.9);
  const dir = new THREE.DirectionalLight(0xfff1dc, 2.6);
  scene.add(hemi, dir, dir.target);
  cockpit = { scene, rig, car, wheel, hemi, dir };
}

// ---------------------------------------------------------------------
//  Préparation d'une partie
// ---------------------------------------------------------------------
function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m === sharedMaterials().paint || m === sharedMaterials().matte || m === sharedMaterials().metal) continue;
        for (const k of ['map', 'normalMap', 'alphaMap', 'roughnessMap']) if (m[k] && !mirrorRT.some(r => r.texture === m[k])) m[k].dispose();
        m.dispose();
      }
    }
  });
}

function setupGame() {
  const T = built[settings.track];
  G.T = T;
  if (G.world) { disposeObject(G.world.scene); if (G.world.scene.environment) G.world.scene.environment.dispose(); }
  const world = buildWorld(T, renderer, quality);
  G.world = world;
  // rig du joueur dans le monde : caméra, rétroviseurs, ombre portée
  const rig = new THREE.Group(); world.scene.add(rig);
  rig.add(mainCam); mainCam.position.copy(EYE);
  for (const c of mirrorCams) rig.add(c);
  const shadowCar = buildCar(settings.livery, null, { shadows: true, noDriver: true });
  shadowCar.traverse(o => o.layers.set(1));
  rig.add(shadowCar);
  world.rig = rig;
  buildCockpit(settings.livery);
  cockpit.scene.environment = world.scene.environment;
  cockpit.dir.position.copy(world.sunDir).multiplyScalar(10);

  // équipes : 4 livrées x 2 voitures
  const all = ['rouge', 'bleu', 'argent'];
  const others = all.filter(l => l !== settings.livery);
  const lv = [settings.livery, others[0], others[0], others[1], others[1], 'orange', 'orange'];
  const lvl = LEVELS[settings.level];
  const r = rng(Date.now() & 0xffff);
  const ks = []; for (let i = 0; i < 7; i++) ks.push(lvl.ai[0] + (lvl.ai[1] - lvl.ai[0]) * (i / 6));
  for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ks[i], ks[j]] = [ks[j], ks[i]]; }
  const nums = [3, 5, 11, 14, 22, 31, 44, 63, 77, 81, 16, 27];
  for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
  G.cars = [];
  const player = new Car({ id: 0, isPlayer: true, livery: settings.livery, number: 1, name: (settings.name || 'TOI').toUpperCase().slice(0, 12) });
  G.cars.push(player); G.player = player;
  for (let i = 0; i < 7; i++) {
    const c = new Car({ id: i + 1, isPlayer: false, livery: lv[i], number: nums[i], name: AI_NAMES[i], k: ks[i] });
    c.mesh = buildCar(c.livery, c.number, { shadows: quality.shadows });
    c.mesh.visible = false;
    world.scene.add(c.mesh);
    G.cars.push(c);
  }
  // temps de qualification simulés de l'IA
  for (const c of G.cars) if (!c.isPlayer) c.qTime = simulateLapTime(T, c.k) * (1 + (r() - 0.5) * 0.012);
}

// tour lancé depuis l'arrêt, sur la trajectoire, à k x profil idéal
function simulateLapTime(T, k) {
  let v = 0, s = 0, t = 0; const dt = 1 / 60;
  while (s < T.N && t < 300) {
    const q = sample(T, s);
    const vt = k * q.v;
    v = Math.min(vt, v + (engineAccel(v) - PHYS.drag * v * v) * dt);
    s += v * dt / Math.max(0.5, 1 - q.k * q.rl); t += dt;
  }
  return t;
}

function placeCar(c, prog, d) {
  const T = G.T;
  c.prog = prog; c.d = d; c.v = 0; c.finished = false; c.finishTime = 0; c.passOff = 0;
  const p = sample(T, prog);
  c.x = p.x + p.nx * d; c.y = p.y + p.ny * d;
  c.psi = Math.atan2(p.ty, p.tx); c.hdg = c.psi;
  c.idx = nearestIndex(T, c.x, c.y, -1);
  c.lapStart = 0; c.lastLap = 0; c.bestLap = 0; c.laps = 0;
}

// ---------------------------------------------------------------------
//  Physique du joueur
// ---------------------------------------------------------------------
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

function stepPlayer(c, dt, canDrive) {
  const T = G.T, lvl = LEVELS[settings.level];
  let steer, thr, brk;
  if (AUTO) { // pilote automatique (tests)
    const look = sample(T, c.prog + 6 + c.v * 0.35);
    const tx = look.x + look.nx * look.rl, ty = look.y + look.ny * look.rl;
    const want = Math.atan2(ty - c.y, tx - c.x);
    steer = Math.max(-1, Math.min(1, -angDiff(want, c.psi) * 3));
    const vt = sample(T, c.prog + 2).v * 0.97;
    thr = c.v < vt; brk = c.v > vt + 1.5;
  } else {
    steer = readSteer(dt); thr = throttle(); brk = braking();
  }
  c.steer = steer; c.thr = thr ? 1 : 0; c.brk = brk ? 1 : 0;
  if (!canDrive) { c.v = 0; return; }
  const v = c.v;
  let a = 0;
  if (thr) a += engineAccel(v);
  if (brk) a -= PHYS.brake;
  if (!thr && !brk) a -= PHYS.coast;
  a -= PHYS.drag * v * v;
  // aide au freinage (Débutant / Pilote)
  if (lvl.assist > 0 && !AUTO) {
    const lim = sample(T, c.prog + 3).v * lvl.assist;
    if (v > lim) a = Math.min(a, -PHYS.brake * Math.min(1, (v - lim) / 3));
  }
  // surface
  const off = Math.abs(c.d) - T.halfW;
  c.onKerb = off > -0.2 && off < T.kerb;
  c.onGrass = off > T.kerb + 0.2;
  if (c.onGrass) a -= (T.def.id === 'silverstone' ? (2 + 0.03 * v) : (6 + 0.08 * v)) * lvl.grass;
  c.v = Math.max(0, v + a * dt);
  // direction
  const vv = Math.max(c.v, 0.1);
  const yawMax = Math.min(vv * Math.tan(MAX_STEER) / WHEELBASE, latGrip(vv) / vv);
  c.yaw = -steer * yawMax;
  c.psi += c.yaw * dt;
  c.latG = Math.abs(c.yaw * c.v) / 9.81;
  // aide anti-mur (Débutant surtout)
  const pr0 = project(T, c.x, c.y, c.idx);
  const th = Math.atan2(pr0.hy, pr0.hx);
  if (lvl.wallAssist > 0 && !AUTO) {
    const rel = angDiff(c.psi, th);
    const near = Math.abs(pr0.d) > T.halfW - 2.2;
    if (near && pr0.d * rel > 0) c.psi -= rel * Math.min(1, lvl.wallAssist * dt * 2.5);
  }
  c.x += Math.cos(c.psi) * c.v * dt;
  c.y += Math.sin(c.psi) * c.v * dt;
  // projection sur le tracé
  c.idx = nearestIndex(T, c.x, c.y, c.idx, 12);
  const pr = project(T, c.x, c.y, c.idx);
  let ds = pr.s - (((c.prog % T.N) + T.N) % T.N);
  if (ds > T.N / 2) ds -= T.N; if (ds < -T.N / 2) ds += T.N;
  c.prog += ds; c.d = pr.d;
  // murs
  const lim = T.wallD - 1.0;
  if (Math.abs(pr.d) > lim) {
    const sg = Math.sign(pr.d), over = Math.abs(pr.d) - lim;
    const nx = -pr.hy, ny = pr.hx;
    c.x -= nx * sg * over; c.y -= ny * sg * over; c.d = sg * lim;
    const thw = Math.atan2(pr.hy, pr.hx);
    const rel = angDiff(c.psi, thw);
    if (sg * rel > 0) {
      const imp = Math.abs(Math.sin(rel));
      const loss = Math.min(0.75, 0.15 + imp * 1.4);
      if (c.v > 4 && imp > 0.03) { sound.crash(imp * c.v / 40); G.shake = Math.max(G.shake, Math.min(1, imp * c.v / 25)); vibrate(25 + imp * 60); }
      c.v *= (1 - loss * Math.min(1, imp * 4));
      c.psi = thw + rel * 0.2;
    }
  }
}

function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(Math.round(ms)); } catch (e) { /* rien */ } }

// ---------------------------------------------------------------------
//  IA
// ---------------------------------------------------------------------
function stepAI(c, dt, canDrive, raceT) {
  const T = G.T;
  if (!canDrive || raceT < c.react) { c.v = 0; return; }
  const p = G.player;
  let k = c.k;
  if (G.state === 'race' && !c.finished) { // élastique léger pour garder la course serrée
    const gap = c.prog - p.prog;
    if (gap > 120) k *= 0.965; else if (gap < -120) k = Math.min(1.0, k * 1.035);
  }
  if (c.finished) k *= 0.6;
  const sm = sample(T, c.prog);
  let target = k * sm.v;
  // trafic devant
  let blocker = null, bgap = 1e9;
  for (const o of G.cars) {
    if (o === c || !o.active) continue;
    let gs = ((o.prog - c.prog) % T.N + T.N) % T.N; if (gs > T.N / 2) continue;
    if (gs < 28 && Math.abs(o.d - c.d) < 2.3 && gs < bgap) { bgap = gs; blocker = o; }
  }
  const lim = T.halfW - 1.3;
  if (blocker && blocker.v < target + 0.5) {
    // tenter un dépassement du côté le plus libre
    const l = blocker.d + 2.9, r = blocker.d - 2.9;
    const roomL = l < lim, roomR = r > -lim;
    let want = null;
    if (roomL && roomR) want = Math.abs(l - c.d) < Math.abs(r - c.d) ? l : r;
    else if (roomL) want = l; else if (roomR) want = r;
    if (want != null) c.passOff = want - sm.rl;
    if (bgap < 9 && (want == null || Math.abs(c.d - want) > 1.2)) target = Math.min(target, blocker.v - 0.4);
  } else c.passOff *= Math.max(0, 1 - dt * 0.6);
  // retour progressif sur la trajectoire depuis la grille
  const sinceStart = c.prog - (c.gridProg ?? c.prog);
  const blend = Math.min(1, Math.max(0, sinceStart / 160));
  let wantD = (c.gridD ?? 0) * (1 - blend) + (sm.rl + c.passOff) * blend;
  wantD = Math.max(-lim, Math.min(lim, wantD));
  const latRate = 1.5 + c.v * 0.07;
  const dd = Math.max(-latRate * dt, Math.min(latRate * dt, wantD - c.d));
  c.d += dd;
  // vitesse
  if (c.v < target) c.v = Math.min(target, c.v + (engineAccel(c.v) - PHYS.drag * c.v * c.v) * dt);
  else c.v = Math.max(target, c.v - PHYS.brake * 1.1 * dt);
  c.prog += c.v * dt / Math.max(0.5, 1 - sm.k * c.d); // abscisse curviligne : l'intérieur avance plus vite
  const q = sample(T, c.prog);
  c.x = q.x + q.nx * c.d; c.y = q.y + q.ny * c.d;
  const th = Math.atan2(q.ty, q.tx);
  const latV = dd / Math.max(dt, 1e-4);
  c.psi = th + Math.atan2(latV, Math.max(5, c.v));
  c.yaw = 0;
}

// ---------------------------------------------------------------------
//  Collisions entre voitures (repère s, d)
// ---------------------------------------------------------------------
function collide() {
  const T = G.T, cs = G.cars.filter(c => c.active);
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    let ds = ((a.prog - b.prog) % T.N + T.N) % T.N; if (ds > T.N / 2) ds -= T.N;
    const dd = a.d - b.d;
    if (Math.abs(ds) > 4.9 || Math.abs(dd) > 1.85) continue;
    const oS = 4.9 - Math.abs(ds), oD = 1.85 - Math.abs(dd);
    const rel = Math.abs(a.v - b.v);
    if (oD < oS * 0.7) { // contact latéral
      const push = oD / 2 + 0.02, sg = dd >= 0 ? 1 : -1;
      moveLat(a, sg * push); moveLat(b, -sg * push);
      a.v *= 0.995; b.v *= 0.995;
    } else { // accrochage par l'arrière
      const rear = ds < 0 ? a : b, front = ds < 0 ? b : a;
      rear.v = Math.min(rear.v, front.v * 0.97);
      front.v += 0.3;
      moveLong(rear, -oS);
    }
    if ((a.isPlayer || b.isPlayer) && rel > 2.5) { sound.crash(Math.min(1, rel / 25)); G.shake = Math.max(G.shake, Math.min(0.8, rel / 20)); vibrate(30); }
  }
}
function moveLat(c, delta) {
  const T = G.T, lim = T.halfW - 1.0;
  if (c.isPlayer) { const p = sample(T, c.prog); c.x += p.nx * delta; c.y += p.ny * delta; c.d += delta; }
  else c.d = Math.max(-lim, Math.min(lim, c.d + delta));
}
function moveLong(c, delta) {
  if (c.isPlayer) { const p = sample(G.T, c.prog); c.x += p.tx * delta; c.y += p.ty * delta; c.prog += delta; }
  else c.prog += delta;
}

// ---------------------------------------------------------------------
//  Machine d'états
// ---------------------------------------------------------------------
function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
function message(txt, cls = '') { const m = $('msg'); m.textContent = txt; m.className = cls; m.classList.toggle('hidden', !txt); }
function fmt(t) {
  if (!isFinite(t)) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
}

function setLights(n) {
  G.lights = n;
  const els = document.querySelectorAll('#lights .col');
  els.forEach((e, i) => e.classList.toggle('on', i < n));
  if (G.world) for (const l of G.world.lamps) l.mesh.material = l.col < n ? lampOn : G.world.lampOffMat;
}
const lampOn = new THREE.MeshBasicMaterial({ color: 0xff2414, toneMapped: false });

function startQuali() {
  const p = G.player;
  for (const c of G.cars) { c.active = c.isPlayer; if (c.mesh) c.mesh.visible = false; }
  placeCar(p, 0, 0);
  G.state = 'quali_intro'; G.t = 0; G.raceTime = 0;
  setLights(0); show('lights', false);
  show('hud'); show('flagCv', false);
  $('posBox').classList.add('hidden');
  $('lapLbl').textContent = 'QUALIF';
  message('QUALIFICATIONS', 'big');
  $('sub').textContent = '1 tour chrono';
}

function startRace() {
  const T = G.T;
  // grille selon la qualif
  const order = G.cars.slice().sort((a, b) => a.qTime - b.qTime);
  order.forEach((c, i) => {
    const gs = gridSlot(i);
    placeCar(c, gs.s, gs.d);
    c.grid = i + 1; c.gridProg = gs.s; c.gridD = gs.d;
    c.active = true;
    c.react = c.isPlayer ? 0 : 0.18 + Math.random() * 0.3;
    if (c.mesh) c.mesh.visible = true;
  });
  G.state = 'race_grid'; G.t = 0; G.raceTime = 0; G.leaderDone = -1;
  G.lightsOutAt = 4.6 + 0.7 + Math.random() * 1.6;
  setLights(0); show('lights'); show('hud'); show('flagCv', false);
  $('posBox').classList.remove('hidden');
  message('COURSE · ' + T.def.laps + ' TOURS', 'big');
  $('sub').textContent = 'Attends l’extinction des feux';
}

function finishQuali(time) {
  const p = G.player;
  p.qTime = time;
  G.state = 'quali_done'; G.t = 0;
  message(isFinite(time) ? 'TOUR : ' + fmt(time) : 'TEMPS ÉCOULÉ', 'big');
  sound.beep(880, 0.25);
}

function showQualiResults() {
  G.state = 'quali_res'; G.t = 0;
  const order = G.cars.slice().sort((a, b) => a.qTime - b.qTime);
  const pole = order[0].qTime;
  const rows = order.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:#${new THREE.Color(LIVERIES[c.livery].primary).getHexString()}"></span>${c.name}</td><td>${fmt(c.qTime)}</td><td>${i === 0 ? '' : isFinite(c.qTime) ? '+' + (c.qTime - pole).toFixed(3) : ''}</td></tr>`).join('');
  const myPos = order.indexOf(G.player) + 1;
  $('qTitle').textContent = myPos === 1 ? 'POLE POSITION !' : 'Tu pars en P' + myPos;
  $('qTable').innerHTML = rows;
  show('qualiRes'); message('');
  let n = 6;
  $('btnRace').textContent = 'COURSE ! (' + n + ')';
  clearInterval(G.qTimer);
  G.qTimer = setInterval(() => {
    n--; $('btnRace').textContent = 'COURSE ! (' + n + ')';
    if (n <= 0) { clearInterval(G.qTimer); goRace(); }
  }, 1000);
}
function goRace() { clearInterval(G.qTimer); show('qualiRes', false); startRace(); }

function finishRace(forced) {
  G.state = 'race_flag'; G.t = 0;
  const p = G.player;
  if (!p.finished) { p.finished = true; p.finishTime = G.raceTime; p.dnfLap = forced; }
  message(forced ? 'COURSE TERMINÉE' : 'ARRIVÉE !', 'big');
  show('flagCv');
  sound.beep(1046, 0.4, 0.2);
}

function classify() {
  const T = G.T, laps = T.def.laps;
  return G.cars.slice().sort((a, b) => {
    const fa = a.finished && !a.dnfLap, fb = b.finished && !b.dnfLap;
    if (fa && fb) return a.finishTime - b.finishTime;
    if (fa !== fb) return fa ? -1 : 1;
    return b.prog - a.prog;
  });
}

function showRaceResults() {
  G.state = 'race_res'; G.t = 0;
  show('flagCv', false); message('');
  const order = classify();
  const win = order[0];
  const T = G.T;
  const rows = order.map((c, i) => {
    let gap = '';
    if (i === 0) gap = fmt(c.finishTime);
    else if (c.finished && !c.dnfLap) gap = '+' + (c.finishTime - win.finishTime).toFixed(3);
    else { const est = G.raceTime + Math.max(0, T.def.laps * T.N - c.prog) / Math.max(25, c.v || 40); gap = '+' + (est - win.finishTime).toFixed(1) + ' s'; }
    return `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:#${new THREE.Color(LIVERIES[c.livery].primary).getHexString()}"></span>${c.name}</td><td>${gap}</td><td>${c.grid ? 'P' + c.grid : ''}</td></tr>`;
  }).join('');
  const pos = order.indexOf(G.player) + 1;
  const titles = { 1: 'VICTOIRE !', 2: '2e PLACE !', 3: '3e PLACE !' };
  $('rTitle').textContent = titles[pos] || pos + 'e place';
  $('rSub').textContent = pos <= 3 ? 'Sur le podium à ' + T.def.name + ' !' : (pos <= 5 ? 'Bien joué, encore un effort pour le podium.' : 'Retente ta chance, tu vas progresser !');
  $('podium').className = 'podium p' + Math.min(pos, 4);
  $('rTable').innerHTML = rows;
  show('raceRes'); show('hud', false);
  sound.silence();
  try { const best = store.get('best_' + T.def.id + '_' + settings.level, 99); if (pos < best) store.set('best_' + T.def.id + '_' + settings.level, pos); } catch (e) { /* rien */ }
}

// ---------------------------------------------------------------------
//  Mise à jour
// ---------------------------------------------------------------------
const FIXED = 1 / 120;
let acc = 0;

function update(dt) {
  G.t += dt;
  const T = G.T, p = G.player;
  const st = G.state;
  if (st === 'quali_intro') {
    const n = 3 - Math.floor((G.t - 1.2) / 0.7);
    if (G.t > 1.2 && n >= 1 && n <= 3) { if ($('msg').textContent !== String(n)) { message(String(n), 'count'); sound.beep(520, 0.15); } }
    stepPlayerOnly(dt, false);
    if (G.t >= 1.2 + 2.1) { G.state = 'quali'; G.t = 0; G.raceTime = 0; message('GO !', 'count go'); sound.beep(1040, 0.3); }
    return;
  }
  if (st === 'quali') {
    if (G.t > 0.8 && $('msg').textContent === 'GO !') message('');
    G.raceTime += dt;
    stepPlayerOnly(dt, true);
    if (p.prog >= T.N) {
      const over = (p.prog - T.N) / Math.max(1, p.v);
      finishQuali(G.raceTime - over);
    } else if (G.raceTime > QUALI_CAP) finishQuali(Infinity);
    return;
  }
  if (st === 'quali_done') {
    stepPlayerOnly(dt, true, true);
    if (G.t > 2.2) showQualiResults();
    return;
  }
  if (st === 'quali_res') return;
  if (st === 'race_grid') {
    const n = Math.min(5, Math.floor((G.t - 0.6) / 1.0) + 1);
    if (G.t > 0.6 && n !== G.lights && n >= 1) { setLights(n); sound.beep(440, 0.14, 0.14); if (n === 1) message(''); }
    stepAll(dt, false);
    if (G.t >= G.lightsOutAt) { setLights(0); G.state = 'race'; G.t = 0; G.raceTime = 0; message('C’EST PARTI !', 'count go'); sound.beep(880, 0.2, 0.12); }
    return;
  }
  if (st === 'race') {
    G.raceTime += dt;
    if (G.t > 1.4 && $('msg').classList.contains('go')) message('');
    if (G.t > 2.5) show('lights', false);
    stepAll(dt, true);
    // tours / arrivées
    const laps = T.def.laps;
    for (const c of G.cars) {
      const done = Math.floor(c.prog / T.N);
      if (done > (c.laps || 0) && c.prog > 0) {
        c.laps = done;
        if (c.isPlayer && done === laps - 1) { message('DERNIER TOUR', 'big'); setTimeout(() => { if ($('msg').textContent === 'DERNIER TOUR') message(''); }, 1600); }
      }
      if (!c.finished && c.prog >= laps * T.N) {
        c.finished = true;
        c.finishTime = G.raceTime - (c.prog - laps * T.N) / Math.max(1, c.v);
        if (G.leaderDone < 0) G.leaderDone = G.raceTime;
        if (c.isPlayer) finishRace(false);
      }
    }
    if (G.state === 'race' && ((G.leaderDone >= 0 && G.raceTime - G.leaderDone > RACE_GRACE) || G.raceTime > RACE_CAP)) finishRace(true);
    return;
  }
  if (st === 'race_flag') {
    G.raceTime += dt;
    stepAll(dt, true, true);
    for (const c of G.cars) if (!c.finished && c.prog >= T.def.laps * T.N) { c.finished = true; c.finishTime = G.raceTime; }
    if (G.t > 3.6) showRaceResults();
  }
}

function stepPlayerOnly(dt, drive, coast) {
  acc += dt;
  while (acc >= FIXED) {
    acc -= FIXED;
    if (coast) coastPlayer(FIXED); else stepPlayer(G.player, FIXED, drive);
  }
}
function coastPlayer(dt) { // après l'arrivée : la voiture ralentit seule sur la trajectoire
  const c = G.player, T = G.T;
  c.thr = 0; c.brk = 0;
  c.v = Math.max(0, c.v - 6 * dt);
  const look = sample(T, c.prog + 8 + c.v * 0.3);
  const want = Math.atan2(look.y + look.ny * c.d - c.y, look.x + look.nx * c.d - c.x);
  c.psi += angDiff(want, c.psi) * Math.min(1, dt * 3);
  c.steer = Math.max(-1, Math.min(1, -angDiff(want, c.psi) * 2));
  c.x += Math.cos(c.psi) * c.v * dt; c.y += Math.sin(c.psi) * c.v * dt;
  c.idx = nearestIndex(T, c.x, c.y, c.idx, 12);
  const pr = project(T, c.x, c.y, c.idx);
  let ds = pr.s - (((c.prog % T.N) + T.N) % T.N); if (ds > T.N / 2) ds -= T.N; if (ds < -T.N / 2) ds += T.N;
  c.prog += ds; c.d = pr.d;
}
function stepAll(dt, drive, playerCoast) {
  acc += dt;
  while (acc >= FIXED) {
    acc -= FIXED;
    if (playerCoast) coastPlayer(FIXED); else stepPlayer(G.player, FIXED, drive);
    for (const c of G.cars) if (!c.isPlayer) stepAI(c, FIXED, drive, G.raceTime);
    collide();
  }
}

// ---------------------------------------------------------------------
//  Rendu d'une image de course
// ---------------------------------------------------------------------
const tmpV = new THREE.Vector3();
let camShake = new THREE.Vector3(), pitchS = 0, rollS = 0, fovS = 58, tunnelF = 0;

function renderRace(dt) {
  const T = G.T, W = G.world, p = G.player;
  // voitures IA
  for (const c of G.cars) if (!c.isPlayer && c.mesh) {
    c.mesh.position.set(c.x, 0, -c.y);
    c.mesh.rotation.y = c.psi - Math.PI / 2;
  }
  // rig joueur
  const rig = W.rig;
  rig.position.set(p.x, 0, -p.y);
  rig.rotation.y = p.psi - Math.PI / 2;
  // effets caméra
  const acc = (p.thr ? 1 : 0) - (p.brk ? 1.4 : 0);
  pitchS += ((p.v > 1 ? acc * 0.012 : 0) - pitchS) * Math.min(1, dt * 4);
  rollS += ((p.yaw || 0) * p.v * 0.0009 - rollS) * Math.min(1, dt * 5);
  G.shake *= Math.exp(-dt * 6);
  const kerbJ = p.onKerb && p.v > 8 ? 0.006 : 0;
  const sp = p.v / 90;
  const j = 0.0006 * sp + kerbJ + G.shake * 0.03;
  camShake.set((Math.random() - 0.5) * j, (Math.random() - 0.5) * j, 0);
  mainCam.position.copy(EYE).add(camShake);
  mainCam.rotation.set(-0.075 + pitchS, 0, rollS);
  fovS += (58 + sp * 7 - fovS) * Math.min(1, dt * 2);
  if (Math.abs(mainCam.fov - fovS) > 0.05) { mainCam.fov = fovS; mainCam.updateProjectionMatrix(); cockCam.fov = fovS; cockCam.updateProjectionMatrix(); }
  // cockpit : même transformation
  cockpit.rig.position.copy(rig.position); cockpit.rig.rotation.copy(rig.rotation);
  cockCam.position.copy(mainCam.position); cockCam.rotation.copy(mainCam.rotation);
  cockpit.wheel.spin.rotation.z = -p.steer * 1.25;
  // tunnel : assombrissement
  const inT = T.tunnel ? tunnelFactor(((p.prog % T.N) + T.N) % T.N, T.tunnel) : 0;
  tunnelF += (inT - tunnelF) * Math.min(1, dt * 4);
  const M = sharedMaterials();
  M.paint.envMapIntensity = 1.25 - tunnelF * 1.0; M.matte.envMapIntensity = 0.8 - tunnelF * 0.65; M.metal.envMapIntensity = 1.3 - tunnelF;
  cockpit.dir.intensity = 2.6 * (1 - tunnelF * 0.85); cockpit.hemi.intensity = 0.9 * (1 - tunnelF * 0.6);
  W.hemi.intensity = 0.9 * (1 - tunnelF * 0.45);
  renderer.toneMappingExposure = 1.0 + tunnelF * 0.35;
  // soleil / ombres suivent le joueur
  W.sun.target.position.set(p.x, 0, -p.y);
  W.sun.position.copy(W.sun.target.position).addScaledVector(W.sunDir, 220);
  W.sun.target.updateMatrixWorld();
  W.sky.position.set(p.x, 0, -p.y);
  // drapeau
  const lastLap = G.state === 'race' && p.prog > (T.def.laps - 1) * T.N + T.N - 260;
  W.flag.update(performance.now() / 1000, (lastLap || G.state === 'race_flag') ? 1 : 0);
  // volant : écran
  const g = gearFor(p.v);
  const posTxt = G.state.startsWith('race') ? 'P' + (classify().indexOf(p) + 1) : '';
  cockpit.wheel.update(p.v < 0.5 && !p.thr ? 'N' : g.gear, Math.round(p.v * 3.6), g.rpm, posTxt);
  sound.engine(G.state === 'race_grid' && p.thr ? 0.55 + Math.random() * 0.05 : g.rpm, p.thr, true);
  // son de l'adversaire le plus proche
  let near = null, nd = 1e9;
  for (const c of G.cars) if (!c.isPlayer && c.active) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < nd) { nd = d; near = c; } }
  if (near) {
    const dx = near.x - p.x, dy = near.y - p.y;
    const right = Math.cos(p.psi) * dy - Math.sin(p.psi) * dx; // >0 : à gauche
    sound.opponent(nd, near.v, -right / Math.max(4, nd));
  } else sound.opponent(999, 0, 0);
  const squeal = p.latG > 3.2 && p.v > 20 ? Math.min(1, (p.latG - 3.2) / 1.5) : (p.brk && p.v > 30 ? 0.25 : 0);
  sound.surfaces(squeal, p.onKerb && p.v > 8 ? 1 : (p.onGrass && p.v > 5 ? 0.6 : 0), sp);

  // --- rendu ---
  renderer.shadowMap.needsUpdate = quality.shadows;
  G.frame++;
  if (G.frame % quality.mirrorEvery === 0) {
    for (let i = 0; i < 2; i++) { renderer.setRenderTarget(mirrorRT[i]); renderer.render(W.scene, mirrorCams[i]); }
  }
  renderer.setRenderTarget(null);
  renderer.autoClear = true;
  renderer.render(W.scene, mainCam);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(cockpit.scene, cockCam);
  renderer.autoClear = true;
}

function tunnelFactor(s, t) {
  const a = t[0], b = t[1];
  if (s < a - 20 || s > b + 20) return 0;
  return Math.min(1, Math.max(0, (s - (a - 5)) / 20), Math.max(0, ((b + 5) - s) / 20));
}

const GEARS = [0, 19, 29, 39, 49, 59, 68, 77, 92];
function gearFor(v) {
  let gIdx = 1;
  while (gIdx < 8 && v > GEARS[gIdx]) gIdx++;
  const lo = gIdx === 1 ? 0 : GEARS[gIdx - 1] * 0.82, hi = GEARS[gIdx];
  const rpm = Math.max(0.12, Math.min(1, (v - lo) / (hi - lo)));
  return { gear: gIdx, rpm: 0.35 + rpm * 0.65 };
}

// ---------------------------------------------------------------------
//  HUD (DOM) + mini-carte
// ---------------------------------------------------------------------
const mm = $('minimap'), mmx = mm.getContext('2d');
let mmBg = null, mmXf = null;
function prepMinimap() {
  const T = G.T;
  const sz = mm.width;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < T.N; i++) { minX = Math.min(minX, T.px[i]); maxX = Math.max(maxX, T.px[i]); minY = Math.min(minY, T.py[i]); maxY = Math.max(maxY, T.py[i]); }
  const sc = (sz - 24) / Math.max(maxX - minX, maxY - minY);
  const ox = (sz - (maxX - minX) * sc) / 2, oy = (sz - (maxY - minY) * sc) / 2;
  mmXf = (x, y) => [ox + (x - minX) * sc, sz - oy - (y - minY) * sc];
  mmBg = document.createElement('canvas'); mmBg.width = mmBg.height = sz;
  const g = mmBg.getContext('2d');
  g.lineJoin = g.lineCap = 'round';
  const path = () => { g.beginPath(); for (let i = 0; i <= T.N; i += 3) { const [a, b] = mmXf(T.px[i % T.N], T.py[i % T.N]); i ? g.lineTo(a, b) : g.moveTo(a, b); } g.closePath(); };
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9; path(); g.stroke();
  g.strokeStyle = '#e8ecf2'; g.lineWidth = 4; path(); g.stroke();
  const [sx, sy] = mmXf(T.px[0], T.py[0]);
  g.fillStyle = '#fff'; g.fillRect(sx - 4, sy - 4, 8, 8); g.fillStyle = '#000'; g.fillRect(sx - 4, sy - 4, 4, 4); g.fillRect(sx, sy, 4, 4);
}
function drawMinimap() {
  const sz = mm.width;
  mmx.clearRect(0, 0, sz, sz);
  mmx.drawImage(mmBg, 0, 0);
  const cars = G.cars.filter(c => c.active).sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
  for (const c of cars) {
    const [x, y] = mmXf(c.x, c.y);
    mmx.beginPath(); mmx.arc(x, y, c.isPlayer ? 7 : 5, 0, Math.PI * 2);
    mmx.fillStyle = '#' + new THREE.Color(LIVERIES[c.livery].primary).getHexString(); mmx.fill();
    mmx.lineWidth = c.isPlayer ? 3 : 1.5; mmx.strokeStyle = c.isPlayer ? '#ffe600' : '#fff'; mmx.stroke();
  }
}
let hudT = 0;
function updateHUD(dt) {
  hudT += dt; if (hudT < 1 / 15) return; hudT = 0;
  const p = G.player, T = G.T;
  const st = G.state;
  if (st.startsWith('quali')) {
    $('timer').textContent = fmt(st === 'quali_intro' ? 0 : (st === 'quali_done' ? p.qTime : G.raceTime));
    if (st === 'quali') $('sub').textContent = 'Reste : ' + Math.max(0, QUALI_CAP - G.raceTime).toFixed(0) + ' s';
  } else {
    $('timer').textContent = fmt(G.raceTime);
    const order = classify();
    const pos = order.indexOf(p) + 1;
    $('pos').textContent = 'P' + pos; $('posOf').textContent = '/' + G.cars.length;
    const lap = Math.min(T.def.laps, Math.max(1, Math.floor(p.prog / T.N) + 1));
    $('lapLbl').textContent = 'TOUR ' + lap + '/' + T.def.laps;
    if (st === 'race') {
      const ahead = order[pos - 2], behind = order[pos];
      let s = '';
      if (ahead) s = 'Devant : ' + ahead.name + ' +' + ((ahead.prog - p.prog) / Math.max(20, p.v)).toFixed(1) + ' s';
      else if (behind) s = 'Tu mènes ! ' + behind.name + ' à ' + ((p.prog - behind.prog) / Math.max(20, behind.v)).toFixed(1) + ' s';
      $('sub').textContent = s;
    }
  }
  drawMinimap();
}

// ---------------------------------------------------------------------
//  Drapeau à damier animé (overlay)
// ---------------------------------------------------------------------
const fcv = $('flagCv'), fctx = fcv.getContext('2d');
function drawFlag(t) {
  const w = fcv.width = fcv.clientWidth * Math.min(2, window.devicePixelRatio || 1);
  const h = fcv.height = fcv.clientHeight * Math.min(2, window.devicePixelRatio || 1);
  fctx.clearRect(0, 0, w, h);
  const cols = 12, rows = 8;
  const fw = Math.min(w * 0.55, h * 0.9), fh = fw * 0.62;
  const x0 = (w - fw) / 2, y0 = (h - fh) / 2 - h * 0.04;
  // mât
  fctx.fillStyle = '#ddd'; fctx.fillRect(x0 - fw * 0.03, y0 - fh * 0.05, fw * 0.022, fh * 1.6);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const u0 = i / cols, u1 = (i + 1) / cols;
    const wave = (u) => Math.sin(u * 7 - t * 9) * fh * 0.07 * u;
    const shade = (u) => 0.75 + 0.25 * Math.cos(u * 7 - t * 9);
    const ax = x0 + u0 * fw, bx = x0 + u1 * fw;
    const ay = y0 + (j / rows) * fh + wave(u0), by = y0 + (j / rows) * fh + wave(u1);
    const ch = fh / rows;
    const dark = (i + j) % 2 === 0;
    const sh = shade((u0 + u1) / 2);
    const c = dark ? Math.round(20 * sh) : Math.round(245 * sh);
    fctx.fillStyle = `rgb(${c},${c},${c})`;
    fctx.beginPath(); fctx.moveTo(ax, ay); fctx.lineTo(bx, by); fctx.lineTo(bx, by + ch + 0.6); fctx.lineTo(ax, ay + ch + 0.6); fctx.closePath(); fctx.fill();
  }
}

// ---------------------------------------------------------------------
//  Garage (menu) : aperçu 3D tournant
// ---------------------------------------------------------------------
let preview = null;
function buildPreview() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e16);
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 30), new THREE.MeshBasicMaterial({ color: 0x2a2f38, side: THREE.BackSide }));
  env.add(room);
  for (const [x, y, z, w, h] of [[0, 5.9, 0, 18, 6], [-14.9, 3, 0, 0.2, 4], [14.9, 3, 4, 0.2, 4]]) {
    const pnl = new THREE.Mesh(new THREE.BoxGeometry(w || 0.2, 0.2, h), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pnl.position.set(x, y, z); if (!w || w < 1) { pnl.geometry = new THREE.BoxGeometry(0.2, h, 8); }
    env.add(pnl);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose();
  const floorCv = document.createElement('canvas'); floorCv.width = floorCv.height = 256;
  const fg = floorCv.getContext('2d'); const gr = fg.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#3a4252'); gr.addColorStop(0.6, '#161b25'); gr.addColorStop(1, '#0a0e16');
  fg.fillStyle = gr; fg.fillRect(0, 0, 256, 256);
  const ft = new THREE.CanvasTexture(floorCv); ft.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.4, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 3); scene.add(key);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202020, 0.6));
  const cam = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
  const turn = new THREE.Group(); scene.add(turn);
  preview = { scene, cam, turn, car: null, livery: null };
}
function setPreviewCar(livery) {
  if (!preview) buildPreview();
  if (preview.livery === livery) return;
  if (preview.car) { preview.turn.remove(preview.car); disposeObject(preview.car); }
  preview.car = buildCar(livery, 1, {});
  preview.turn.add(preview.car);
  preview.livery = livery;
}
function renderPreview(dt) {
  const pv = preview;
  pv.turn.rotation.y += dt * 0.45;
  const wide = window.innerWidth > window.innerHeight;
  pv.cam.position.set(wide ? 4.2 : 0, 2.3, wide ? 8.6 : 11);
  pv.cam.lookAt(wide ? 2.6 : 0, 0.35, 0);
  renderer.setRenderTarget(null);
  renderer.toneMappingExposure = 1.0;
  renderer.render(pv.scene, pv.cam);
}

// ---------------------------------------------------------------------
//  Menu
// ---------------------------------------------------------------------
function buildMenu() {
  // voitures
  const carBox = $('cars');
  carBox.innerHTML = '';
  for (const k of ['rouge', 'bleu', 'argent']) {
    const L = LIVERIES[k];
    const b = document.createElement('button');
    b.className = 'swatch' + (settings.livery === k ? ' sel' : '');
    b.innerHTML = `<span class="chip" style="background:linear-gradient(135deg,#${hex(L.primary)} 0 55%,#${hex(L.secondary)} 55% 72%,#${hex(L.accent)} 72%)"></span>${L.name}`;
    b.onclick = () => { settings.livery = k; store.set('livery', k); buildMenu(); };
    carBox.appendChild(b);
  }
  setPreviewCar(settings.livery);
  // circuits
  const tb = $('tracks');
  tb.innerHTML = '';
  for (const d of TRACKS) {
    const b = document.createElement('button');
    b.className = 'track' + (settings.track === d.id ? ' sel' : '');
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 90;
    drawThumb(cv, built[d.id], settings.track === d.id);
    const best = store.get('best_' + d.id + '_' + settings.level, 0);
    b.appendChild(cv);
    const lab = document.createElement('div'); lab.className = 'tl';
    lab.innerHTML = `<b>${d.name}</b><small>${d.country}${best ? ' · meilleur : P' + best : ''}</small>`;
    b.appendChild(lab);
    b.onclick = () => { settings.track = d.id; store.set('track', d.id); buildMenu(); };
    tb.appendChild(b);
  }
  $('trackInfo').textContent = TRACKS.find(t => t.id === settings.track).info;
  // niveaux
  const lb = $('levels'); lb.innerHTML = '';
  for (const k of Object.keys(LEVELS)) {
    const b = document.createElement('button');
    b.className = 'lvl' + (settings.level === k ? ' sel' : '');
    b.textContent = LEVELS[k].name;
    b.onclick = () => { settings.level = k; store.set('level', k); buildMenu(); };
    lb.appendChild(b);
  }
  // direction
  const sb = $('steerModes'); sb.innerHTML = '';
  const modes = isTouch ? [['tilt', 'Inclinaison'], ['buttons', 'Boutons']] : [['keys', 'Clavier ← → ↑ ↓']];
  for (const [k, n] of modes) {
    const b = document.createElement('button');
    b.className = 'lvl' + (settings.steerMode === k ? ' sel' : '');
    b.textContent = n;
    b.onclick = () => { settings.steerMode = k; store.set('steerMode', k); buildMenu(); };
    sb.appendChild(b);
  }
  $('name').value = settings.name;
  $('btnSound').textContent = settings.sound ? '🔊' : '🔇';
}
function hex(c) { return new THREE.Color(c).getHexString(); }
function drawThumb(cv, T, sel) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < T.N; i++) { minX = Math.min(minX, T.px[i]); maxX = Math.max(maxX, T.px[i]); minY = Math.min(minY, T.py[i]); maxY = Math.max(maxY, T.py[i]); }
  const sc = Math.min((cv.width - 16) / (maxX - minX), (cv.height - 16) / (maxY - minY));
  const ox = (cv.width - (maxX - minX) * sc) / 2, oy = (cv.height - (maxY - minY) * sc) / 2;
  g.lineJoin = 'round'; g.strokeStyle = sel ? '#ffd400' : '#cfd6e0'; g.lineWidth = 3.5;
  g.beginPath();
  for (let i = 0; i <= T.N; i += 4) { const x = ox + (T.px[i % T.N] - minX) * sc, y = cv.height - oy - (T.py[i % T.N] - minY) * sc; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.stroke();
}
$('name').addEventListener('input', (e) => { settings.name = e.target.value.replace(/[<>]/g, '').slice(0, 12); store.set('name', settings.name); });
$('btnSound').onclick = () => { settings.sound = !settings.sound; store.set('sound', settings.sound); sound.setEnabled(settings.sound); $('btnSound').textContent = settings.sound ? '🔊' : '🔇'; };

async function onStart() {
  sound.init(); sound.setEnabled(settings.sound);
  // l'autorisation du capteur doit être demandée immédiatement (geste utilisateur, iOS)
  const tiltP = settings.steerMode === 'tilt' ? enableTilt() : Promise.resolve(true);
  let fsP = Promise.resolve();
  if (isTouch) {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      fsP = el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => (screen.orientation && screen.orientation.lock) ? screen.orientation.lock('landscape') : null)
        .catch(() => {});
    }
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { G.wake = w; }).catch(() => {}); } catch (e) { /* rien */ }
    const cur = screenAngle();
    baseAngle = (cur === 90 || cur === 270) ? cur : 90;
  }
  const ok = await tiltP;
  await fsP;
  if (settings.steerMode === 'tilt') {
    if (!ok) { settings.steerMode = 'buttons'; toast('Inclinaison refusée : direction par boutons'); }
    else setTimeout(() => { if (settings.steerMode === 'tilt' && !input.tiltOK) { settings.steerMode = 'buttons'; applyControlsLayout(); toast('Capteur indisponible : direction par boutons'); } }, 1800);
  }
  show('menu', false); show('loading');
  await new Promise(r => setTimeout(r, 30));
  setupGame();
  G.state = 'loading'; resize();
  prepMinimap();
  applyControlsLayout();
  show('loading', false);
  startQuali();
  if (settings.steerMode === 'tilt') toast('Tourne le téléphone comme un volant', 3500);
  else if (settings.steerMode === 'keys') toast('← → pour tourner · ↑ accélérer · ↓ freiner', 3500);
}
$('btnStart').onclick = onStart;
$('btnRace').onclick = goRace;
$('btnAgain').onclick = () => { show('raceRes', false); startQualiAgain(); };
$('btnMenu').onclick = () => { show('raceRes', false); toMenu(); };
function startQualiAgain() { for (const c of G.cars) if (!c.isPlayer) c.qTime = simulateLapTime(G.T, c.k) * (1 + (Math.random() - 0.5) * 0.012); show('hud'); startQuali(); }
function toMenu() {
  G.state = 'menu'; show('hud', false); show('pauseScr', false); show('qualiRes', false); clearInterval(G.qTimer);
  sound.silence(); buildMenu(); show('menu'); message(''); resize();
  try { if (G.wake) { G.wake.release(); G.wake = null; } } catch (e) { /* rien */ }
}

function applyControlsLayout() {
  const btns = settings.steerMode === 'buttons';
  document.body.classList.toggle('btnsteer', btns);
  document.body.classList.toggle('keysteer', settings.steerMode === 'keys');
}

let toastT = null;
function toast(t, ms = 2600) { const e = $('toast'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.add('hidden'), ms); }

// pause
function togglePause() {
  if (!G.state.startsWith('quali') && !G.state.startsWith('race')) return;
  if (G.state === 'quali_res' || G.state === 'race_res') return;
  G.paused = !G.paused;
  show('pauseScr', G.paused);
  if (G.paused) sound.suspend(); else { sound.resume(); last = performance.now(); }
}
$('btnPause').onclick = togglePause;
$('btnResume').onclick = togglePause;
$('btnCalib').onclick = () => { input.tiltZero = input.tilt; toast('Volant recalé au centre'); togglePause(); };
$('btnQuit').onclick = () => { G.paused = false; sound.resume(); toMenu(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && !G.paused && (G.state === 'quali' || G.state === 'race')) togglePause(); });


// ---------------------------------------------------------------------
//  Boucle principale + qualité adaptative
// ---------------------------------------------------------------------
let last = performance.now(), perfAcc = 0, perfN = 0, perfChecked = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000; last = now;
  if (dt > (TEST ? 0.25 : 0.05)) dt = TEST ? 0.25 : 0.05;
  if (G.freeze) return;
  if (G.state === 'menu') { renderPreview(dt); return; }
  if (!G.world) return;
  if (!G.paused) update(dt);
  renderRace(G.paused ? 0 : dt);
  updateHUD(dt);
  if (G.state === 'race_flag') drawFlag(now / 1000);
  // qualité adaptative (après quelques secondes de jeu)
  if ((G.state === 'quali' || G.state === 'race') && !G.paused && perfChecked < 2) {
    perfAcc += dt; perfN++;
    if (perfAcc > 4) {
      const fps = perfN / perfAcc;
      if (fps < 40) degrade();
      perfAcc = 0; perfN = 0; perfChecked++;
    }
  }
}
function degrade() {
  if (quality.pr > 1.05) { quality.pr = Math.max(1, quality.pr * 0.72); renderer.setPixelRatio(quality.pr); resize(); }
  else if (quality.mirrorEvery < 3) quality.mirrorEvery++;
  else if (quality.shadows) { quality.shadows = false; G.world.sun.castShadow = false; }
}

// ---------------------------------------------------------------------
//  Démarrage
// ---------------------------------------------------------------------
buildPreview();
buildMenu();
resize();
show('loading', false);
show('menu');
requestAnimationFrame(loop);

// accès pour les tests automatiques
if (TEST) {
  window.__bolideAPI = {
    start: async (track, livery, level) => { if (track) settings.track = track; if (livery) settings.livery = livery; if (level) settings.level = level; settings.steerMode = 'keys'; await onStart(); },
    G, settings, input, keys, quality, renderer, onMotion, THREE,
    topView(size) { const T = G.T; let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; for (let i=0;i<T.N;i++){x0=Math.min(x0,T.px[i]);x1=Math.max(x1,T.px[i]);y0=Math.min(y0,T.py[i]);y1=Math.max(y1,T.py[i]);} const h=Math.max(x1-x0,y1-y0)/2+size; const cam=new THREE.OrthographicCamera(-h,h,h,-h,1,3000); cam.position.set((x0+x1)/2,1500,-(y0+y1)/2); cam.lookAt((x0+x1)/2,0,-(y0+y1)/2); cam.layers.enableAll(); G.freeze=true; renderer.setRenderTarget(null); renderer.setSize(800,800,false); renderer.render(G.world.scene, cam); },

    simulate(sec, step = 1 / 30) { for (let t = 0; t < sec; t += step) { if (G.state === 'quali_res' || G.state === 'race_res') break; update(step); } return G.state; },
    goRace,
    teleport(sv, d = 0) { placeCar(G.player, sv, d); G.player.v = 30; },
    skipTo(state) { if (state === 'race') { for (const c of G.cars) c.qTime = c.isPlayer ? 40 : c.qTime; show('qualiRes', false); startRace(); } },
  };
}
