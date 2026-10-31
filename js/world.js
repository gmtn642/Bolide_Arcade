// =====================================================================
//  Construction du décor : piste, vibreurs, rails, tunnel, mer,
//  immeubles, arbres, tribunes, portique des feux, drapeau, ciel.
//  Décor 100 % statique (aucune animation le long du circuit).
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';
import * as TX from './textures.js';

const W = (x, y) => new THREE.Vector3(x, 0, -y); // carte (x,y) -> monde (x, 0, -y)
const ni = (g) => (g.index ? g.toNonIndexed() : g);

// ---------------------------------------------------------------------
//  Balayage d'une section le long du tracé
// ---------------------------------------------------------------------
function sweep(T, s0, s1, section, opts = {}) {
  // section : [{d, y, u}]  ; s en mètres (s1 peut dépasser N)
  const step = opts.step || 1.5;
  const vScale = opts.vScale || 8;
  const N = T.N;
  if (s1 <= s0) s1 += N;
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const pos = [], uv = [], idx = [];
  const m = section.length;
  for (let i = 0; i <= n; i++) {
    const s = s0 + (s1 - s0) * (i / n);
    const ss = ((s % N) + N) % N;
    const i0 = Math.floor(ss), i1 = (i0 + 1) % N, t = ss - i0;
    const px = T.px[i0] + (T.px[i1] - T.px[i0]) * t, py = T.py[i0] + (T.py[i1] - T.py[i0]) * t;
    let nx = T.nx[i0] + (T.nx[i1] - T.nx[i0]) * t, ny = T.ny[i0] + (T.ny[i1] - T.ny[i0]) * t;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    for (let k = 0; k < m; k++) {
      const c = section[k];
      const x = px + nx * c.d, y = py + ny * c.d;
      pos.push(x, c.y, -y);
      if (opts.swapUV) uv.push((opts.uSign || 1) * s / vScale, c.u); else uv.push(c.u, s / vScale);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < m - 1; k++) {
    const a = i * m + k, b = a + 1, c = a + m, d = c + 1;
    if (opts.flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const flat = (d0, d1, y0, y1 = y0, u0 = 0, u1 = 1) => [{ d: d0, y: y0, u: u0 }, { d: d1, y: y1, u: u1 }];

// grille spatiale pour tester la distance au tracé
function makeGrid(T) {
  const cell = 25, map = new Map();
  for (let i = 0; i < T.N; i += 2) {
    const k = Math.floor(T.px[i] / cell) + ',' + Math.floor(T.py[i] / cell);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  return {
    near(x, y) { // distance au plus proche point (<= ~25 m), sinon Infinity
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      let bd = Infinity, bi = -1;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const arr = map.get((cx + a) + ',' + (cy + b)); if (!arr) continue;
        for (const i of arr) { const d = (T.px[i] - x) ** 2 + (T.py[i] - y) ** 2; if (d < bd) { bd = d; bi = i; } }
      }
      return { d: Math.sqrt(bd), i: bi };
    },
  };
}

function curvatureRanges(T, thr, ext, minGap) {
  const N = T.N, k = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let o = -8; o <= 8; o++) s += Math.abs(T.curv[(i + o + N) % N]); k[i] = s / 17; }
  const ranges = [];
  let start = -1;
  for (let i = 0; i < N; i++) {
    if (k[i] > thr && start < 0) start = i;
    if ((k[i] <= thr || i === N - 1) && start >= 0) { ranges.push([start - ext, i + ext]); start = -1; }
  }
  const out = [];
  for (const r of ranges) { const l = out[out.length - 1]; if (l && r[0] - l[1] < minGap) l[1] = r[1]; else out.push(r); }
  return out;
}

// ---------------------------------------------------------------------
//  Ciel (dégradé + soleil + nuages statiques)
// ---------------------------------------------------------------------
export function skyMaterial(sky, sunDir) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(sky.top) },
      horizon: { value: new THREE.Color(sky.horizon) },
      sunDir: { value: sunDir.clone() },
      cover: { value: sky.clouds },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform float cover; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 col = mix(horizon, top, pow(y, 0.55));
        if (d.y < 0.0) col = horizon * 0.92;
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0,0.92,0.75) * (pow(sd, 900.0) * 18.0 + pow(sd, 12.0) * 0.25);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 1.6;
          float c = fbm(uv + vec2(3.1, 1.7));
          float cl = smoothstep(1.0 - cover, 1.15 - cover * 0.6, c) * smoothstep(0.0, 0.12, d.y);
          vec3 cc = mix(vec3(1.0), horizon * 0.85, smoothstep(0.55, 0.9, c) * 0.5);
          col = mix(col, cc * (1.0 + pow(sd, 6.0) * 0.4), cl * 0.9);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------
//  Monde complet
// ---------------------------------------------------------------------
export function buildWorld(T, renderer, quality) {
  const def = T.def;
  const scene = new THREE.Scene();
  const root = new THREE.Group(); scene.add(root);
  const grid = makeGrid(T);
  const N = T.N, hw = T.halfW, wallD = T.wallD;
  const rand = TX.rng(def.id.length * 977 + 13);

  // centre et étendue
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, T.px[i]); maxX = Math.max(maxX, T.px[i]); minY = Math.min(minY, T.py[i]); maxY = Math.max(maxY, T.py[i]); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  // --- Lumières ---------------------------------------------------------
  const el = def.sunElev * Math.PI / 180, az = def.sunAz * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  const hemi = new THREE.HemisphereLight(def.sky.horizon, def.ground === 'city' ? 0x8a8378 : 0x4d5e35, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.8);
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 10; sc.far = 450;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    sc.layers.enableAll();
  }
  scene.add(sun); scene.add(sun.target);

  // --- Ciel, brouillard, environnement -------------------------------------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), skyMaterial(def.sky, sunDir));
  sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(def.sky.horizon, def.ground === 'city' ? 0.00055 : 0.00042);
  {
    const envScene = new THREE.Scene();
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial(def.sky, sunDir));
    envScene.add(s2);
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: def.ground === 'city' ? 0x77736c : 0x4b6a32 }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = -5; envScene.add(gnd);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.035).texture;
    scene.environmentIntensity = 0.85;
    pm.dispose();
  }

  // --- Sol ------------------------------------------------------------------
  {
    const isCity = def.ground === 'city';
    const t = isCity ? TX.pavementTexture() : TX.grassTexture(true);
    const size = 9000, rep = isCity ? size / 10 : size / 26;
    t.repeat.set(rep, rep);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0, envMapIntensity: 0.5 }));
    g.rotation.x = -Math.PI / 2; g.position.set(cx, -0.06, -cy);
    g.receiveShadow = quality.shadows;
    root.add(g);
  }

  // --- Piste ----------------------------------------------------------------
  const asphaltTex = TX.asphaltTexture();
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9, metalness: 0, envMapIntensity: 0.55 });
  const tunnelAsphalt = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9, color: 0x3a3a3a, envMapIntensity: 0.05 });
  const add = (geo, mat, shadow = true, cast = false) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = shadow && quality.shadows; m.castShadow = cast && quality.shadows; root.add(m); return m; };
  const tun = T.tunnel;
  if (tun) {
    add(sweep(T, tun[1], tun[0] + N, flat(-hw, hw, 0.02), { vScale: 10 }), asphaltMat);
    add(sweep(T, tun[0], tun[1], flat(-hw, hw, 0.02), { vScale: 10 }), tunnelAsphalt);
  } else add(sweep(T, 0, N, flat(-hw, hw, 0.02), { vScale: 10 }), asphaltMat);

  // lignes blanches de bord
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  add(mergeGeometries([
    sweep(T, 0, N, flat(hw - 0.38, hw - 0.12, 0.03), { step: 2 }),
    sweep(T, 0, N, flat(-hw + 0.12, -hw + 0.38, 0.03), { step: 2 }),
  ]), lineMat);

  // dégagements (herbe / bitume / béton)
  const runTex = def.ground === 'city' ? TX.concreteTexture('#a9a59c') : (def.id === 'silverstone' ? TX.asphaltTexture() : TX.grassTexture(false, 1));
  const runMat = new THREE.MeshStandardMaterial({ map: runTex, roughness: 0.92, color: def.id === 'silverstone' ? 0x8a9aa8 : 0xffffff, envMapIntensity: 0.5 });
  add(mergeGeometries([
    sweep(T, 0, N, flat(hw, wallD + 0.6, 0.0, 0.0, 0, (wallD - hw) / 4), { vScale: 4, step: 2 }),
    sweep(T, 0, N, flat(-wallD - 0.6, -hw, 0.0, 0.0, 0, (wallD - hw) / 4), { vScale: 4, step: 2 }),
  ]), runMat);

  // vibreurs dans les virages
  const kerbMat = new THREE.MeshStandardMaterial({ map: TX.kerbTexture(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const kr = curvatureRanges(T, 0.011, 6, 20);
  T.kerbRanges = kr;
  const kg = [];
  for (const [a, b] of kr) {
    const k = T.kerb;
    kg.push(sweep(T, a, b, [{ d: hw - 0.05, y: 0.025, u: 0 }, { d: hw + k * 0.4, y: 0.06, u: 0.5 }, { d: hw + k, y: 0.035, u: 1 }], { vScale: 6, step: 1 }));
    kg.push(sweep(T, a, b, [{ d: -hw - k, y: 0.035, u: 1 }, { d: -hw - k * 0.4, y: 0.06, u: 0.5 }, { d: -hw + 0.05, y: 0.025, u: 0 }], { vScale: 6, step: 1 }));
  }
  if (kg.length) add(mergeGeometries(kg), kerbMat);

  // ligne de départ/arrivée (damier) + emplacements de grille
  const chk = TX.checkerTexture(8); chk.repeat.set(T.def.width / 1.6, 1);
  add(sweep(T, -0.8, 0.8, flat(-hw, hw, 0.032), { vScale: 1.6, step: 0.4 }), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  {
    const gg = [];
    for (let i = 0; i < 8; i++) {
      const s = gridSlot(i).s + 2.6, d = gridSlot(i).d;
      gg.push(sweep(T, s, s + 0.3, flat(d - 1.1, d + 1.1, 0.032), { step: 0.3 }));
      gg.push(sweep(T, s - 1.2, s + 0.3, flat(d + 1.0, d + 1.2, 0.032), { step: 0.5 }));
      gg.push(sweep(T, s - 1.2, s + 0.3, flat(d - 1.2, d - 1.0, 0.032), { step: 0.5 }));
    }
    add(mergeGeometries(gg), lineMat);
  }

  // --- Barrières --------------------------------------------------------------
  const isCity = def.ground === 'city';
  if (isCity) {
    const bt = TX.boardTexture([['#c8102e', '#fff'], ['#f4f4f4', '#c8102e'], ['#0b3d91', '#fff'], ['#f4f4f4', '#0b3d91']], ['MONACO', 'BOLIDE', 'ARCADE', 'GRAND PRIX']);
    const bm = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6, side: THREE.DoubleSide });
    const bmDark = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6, side: THREE.DoubleSide, color: 0x5a5a5a, envMapIntensity: 0.05 });
    const ranges = tun ? [[tun[1], tun[0] + N, bm], [tun[0], tun[1], bmDark]] : [[0, N, bm]];
    for (const [a, b, mat] of ranges) for (const sd of [1, -1]) add(sweep(T, a, b, [{ d: sd * wallD, y: 0, u: 0 }, { d: sd * wallD, y: 1.15, u: 1 }], { swapUV: true, vScale: 16, step: 2, flip: sd < 0, uSign: sd }), mat, true, true);
    const ft = TX.fenceTexture(); ft.repeat.set(1, 1);
    const fm = new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.35, transparent: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 });
    const fr = tun ? [[tun[1] + 2, tun[0] + N - 2]] : [[0, N]];
    for (const [a, b] of fr) for (const sd of [1, -1]) add(sweep(T, a, b, [{ d: sd * (wallD + 0.05), y: 1.15, u: 0 }, { d: sd * (wallD + 0.35), y: 3.6, u: 2.5 }], { swapUV: true, vScale: 1.2, step: 2 }), fm, false, false);
  } else {
    const at = TX.armcoTexture();
    const am = new THREE.MeshStandardMaterial({ map: at, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.75 });
    for (const sd of [1, -1]) add(sweep(T, 0, N, [{ d: sd * wallD, y: 0.05, u: 0 }, { d: sd * wallD, y: 0.95, u: 1 }], { swapUV: true, vScale: 4, step: 2 }), am, true, true);
    // panneaux le long de la ligne droite des stands
    const bt = TX.boardTexture([['#1d2c5e', '#fff'], ['#f2f2f2', '#1d2c5e'], ['#d71920', '#fff'], ['#111', '#ffd400']], ['BOLIDE', 'ARCADE', 'GRAND PRIX', 'BOLIDE']);
    const bm = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6, side: THREE.DoubleSide });
    add(sweep(T, -220, 140, [{ d: wallD + 1.2, y: 0, u: 0 }, { d: wallD + 1.2, y: 1.0, u: 1 }], { swapUV: true, vScale: 16, step: 2 }), bm, true, true);
  }

  // --- Tunnel (Monaco) ---------------------------------------------------------
  if (tun) {
    const concrete = new THREE.MeshStandardMaterial({ map: TX.concreteTexture('#8f8c86'), roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.05, color: 0x9a9a9a });
    const H = 6.6, ext = wallD + 1.2;
    add(sweep(T, tun[0], tun[1], flat(-ext, ext, H, H), { vScale: 6 }), concrete, true, true);
    for (const sd of [1, -1]) add(sweep(T, tun[0], tun[1], [{ d: sd * (wallD + 0.4), y: 0, u: 0 }, { d: sd * (wallD + 0.4), y: H, u: 1 }], { swapUV: true, vScale: 6, step: 2 }), concrete, true, true);
    // rampes lumineuses
    const lg = [];
    for (let s = tun[0] + 3; s < tun[1]; s += 7) {
      for (const sd of [1, -1]) {
        const p = sampleAt(T, s), d = sd * (hw - 1.5);
        const b = new THREE.BoxGeometry(0.5, 0.08, 2.4);
        b.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(p.tx, p.ty)));
        b.translate(p.x + p.nx * d, H - 0.05, -(p.y + p.ny * d));
        lg.push(b);
      }
    }
    add(mergeGeometries(lg), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), false);
    // immeuble (hôtel) au-dessus du tunnel
    const ht = TX.facadeTexture(31, '#d9cfbd', null);
    const hg = [];
    for (let s = tun[0]; s < tun[1] - 10; s += 22) {
      const p = sampleAt(T, s + 11);
      hg.push(buildingGeo(p.x - p.nx * 6, p.y - p.ny * 6, Math.atan2(p.ty, p.tx), 24, 2 * ext + 16, H, H + 26));
    }
    add(mergeGeometries(hg), new THREE.MeshStandardMaterial({ map: ht, roughness: 0.85, envMapIntensity: 0.6 }), true, true);
  }

  // --- Mer / port ---------------------------------------------------------------
  const nearestAll = (x, y) => { let bd = Infinity, bi = 0; for (let i = 0; i < N; i += 3) { const d = (T.px[i] - x) ** 2 + (T.py[i] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
  const inWater = (x, y) => {
    for (const z of T.zones) if (z.type === 'water') {
      const s = nearestAll(x, y); const inR = z.s0 <= z.s1 ? s >= z.s0 && s <= z.s1 : s >= z.s0 || s <= z.s1;
      if (!inR) continue;
      const d = (x - T.px[s]) * T.nx[s] + (y - T.py[s]) * T.ny[s];
      if (d * z.side > wallD + 2) return true;
    }
    return false;
  };
  for (const z of T.zones) if (z.type === 'water') {
    const nt = TX.waterNormalTexture(); nt.repeat.set(60, 60);
    const wm = new THREE.MeshStandardMaterial({ color: 0x0d4a6e, roughness: 0.12, metalness: 0.1, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide, envMapIntensity: 1.2 });
    const sd = z.side;
    const sec = sd > 0 ? flat(wallD + 4, wallD + 900, -0.03) : flat(-wallD - 900, -wallD - 4, -0.03);
    add(sweep(T, z.s0, z.s1, sec, { vScale: 60, step: 4 }), wm, false);
    // quai
    add(sweep(T, z.s0, z.s1, sd > 0 ? flat(wallD + 3.6, wallD + 4.1, 0.25) : flat(-wallD - 4.1, -wallD - 3.6, 0.25), { step: 3 }), new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.9 }), false);
    // yachts
    const yg = [];
    let placed = 0;
    for (let k = 0; k < 120 && placed < 22; k++) {
      const s = z.s0 + rand() * (z.s1 - z.s0);
      const p = sampleAt(T, s);
      const d = sd * (wallD + 12 + rand() * 90);
      const x = p.x + p.nx * d, y = p.y + p.ny * d;
      if (grid.near(x, y).d < wallD + 10) continue;
      yg.push(...yachtGeo(x, y, Math.atan2(p.ty, p.tx) + (rand() - 0.5) * 0.6, 14 + rand() * 22, rand));
      placed++;
    }
    if (yg.length) add(mergeGeometries(yg), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }), false, true);
  }

  // --- Bâtiments (Monaco) ---------------------------------------------------------
  const footprints = [];
  const clear = (x, y, r) => { for (const f of footprints) if ((f[0] - x) ** 2 + (f[1] - y) ** 2 < (f[2] + r) ** 2) return false; return true; };
  const okRect = (x, y, ang, w, dd, margin) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const px = x + ca * a * w / 2 - sa * b * dd / 2, py = y + sa * a * w / 2 + ca * b * dd / 2;
      if (grid.near(px, py).d < wallD + margin) return false;
      if (inWater(px, py)) return false;
    }
    return true;
  };
  if (def.scenery === 'city') {
    const styles = [
      { t: TX.facadeTexture(1, '#e9dcc2', '#5d7b4f'), g: [] },
      { t: TX.facadeTexture(2, '#e6b98f', '#7a5236'), g: [] },
      { t: TX.facadeTexture(3, '#f1e6d6', '#3f6a8c'), g: [] },
      { t: TX.facadeTexture(4, '#e8c6b8', '#6d6d6d'), g: [] },
      { t: TX.glassTowerTexture(5), g: [] },
    ];
    const roofs = [];
    for (let row = 0; row < 4; row++) {
      for (let s = rand() * 10; s < N; s += 14 + rand() * 14) {
        for (const sd of [1, -1]) {
          const p = sampleAt(T, s);
          const wB = 14 + rand() * 18, dB = 12 + rand() * 12;
          const d = sd * (wallD + 4 + dB / 2 + row * 26 + rand() * 6);
          const x = p.x + p.nx * d, y = p.y + p.ny * d;
          const ang = Math.atan2(p.ty, p.tx);
          if (!okRect(x, y, ang, wB, dB, 2.5)) continue;
          const r = Math.hypot(wB, dB) / 2 * 0.85;
          if (!clear(x, y, r)) continue;
          footprints.push([x, y, r]);
          const hgt = 14 + rand() * 18 + row * 14 + (rand() < 0.12 ? 40 : 0);
          const st = hgt > 55 && rand() < 0.6 ? styles[4] : styles[Math.floor(rand() * 4)];
          st.g.push(buildingGeo(x, y, ang, wB, dB, 0, hgt));
          roofs.push(colorizeSimple(roofGeo(x, y, ang, wB, dB, hgt), rand() < 0.5 ? 0xb5633e : 0x8d8a85));
        }
      }
    }
    for (const st of styles) if (st.g.length) add(mergeGeometries(st.g), new THREE.MeshStandardMaterial({ map: st.t, roughness: 0.8, envMapIntensity: 0.7 }), true, true);
    if (roofs.length) add(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), true, false);
    // collines de Monaco au nord
    root.add(mountains(cx, cy, 2300, 260, 620, 0x7c8a78, rand, [Math.PI * 0.05, Math.PI * 0.95]));
  }

  // --- Arbres (parc de Monza, campagne de Silverstone) ---------------------------------
  if (def.scenery === 'park' || def.scenery === 'fields') {
    const count = def.scenery === 'park' ? 950 : 380;
    const trunkG = new THREE.CylinderGeometry(0.25, 0.35, 1, 6); trunkG.translate(0, 0.5, 0);
    const leafG = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x4a3726 }), count);
    const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    const R = Math.max(maxX - minX, maxY - minY) / 2 + 320;
    for (let k = 0; k < count * 12 && n < count; k++) {
      let x, y;
      if (rand() < 0.65) { // près de la piste
        const p = sampleAt(T, rand() * N); const sd = rand() < 0.5 ? 1 : -1;
        const d = sd * (wallD + 9 + Math.pow(rand(), 1.5) * 120);
        x = p.x + p.nx * d; y = p.y + p.ny * d;
      } else { x = cx + (rand() * 2 - 1) * R; y = cy + (rand() * 2 - 1) * R; }
      const nd = grid.near(x, y).d;
      if (nd < wallD + 8) continue;
      if (!clear(x, y, 3)) continue;
      if (def.scenery === 'fields' && rand() < 0.5 && nd > 60) continue;
      const h = 6 + rand() * 9, r = 2.4 + rand() * 2.6;
      pv.set(x, 0, -y); sv.set(1, h * 0.45, 1);
      m.compose(pv, q.identity(), sv); trunks.setMatrixAt(n, m);
      pv.set(x, h * 0.45 + r * 0.8, -y); sv.set(r, r * (1.1 + rand() * 0.5), r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      m.compose(pv, q, sv); leaves.setMatrixAt(n, m);
      col.setHSL(0.24 + rand() * 0.08, 0.45 + rand() * 0.2, 0.2 + rand() * 0.12); leaves.setColorAt(n, col);
      n++;
    }
    trunks.count = n; leaves.count = n;
    trunks.castShadow = leaves.castShadow = false;
    trunks.layers.set(2); leaves.layers.set(2);
    root.add(trunks, leaves);
    root.add(mountains(cx, cy, 2400, 40, 140, 0x6f7f68, rand, null));
  }

  // --- Tribunes ---------------------------------------------------------------------
  const standTex = TX.standTexture();
  const standMat = new THREE.MeshStandardMaterial({ map: standTex, roughness: 0.85, side: THREE.DoubleSide });
  const concreteM = new THREE.MeshStandardMaterial({ map: TX.concreteTexture('#c9c6bf'), roughness: 0.9 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
  const standG = [], standC = [], standR = [];
  const placeStand = (s, side, len) => {
    const p = sampleAt(T, s);
    const depth = 14, d = side * (wallD + 5 + depth / 2);
    const x = p.x + p.nx * d, y = p.y + p.ny * d;
    const ang = Math.atan2(p.ty, p.tx);
    if (!okRect(x, y, ang, len, depth, 3)) return false;
    if (!clear(x, y, len / 2)) return false;
    footprints.push([x, y, len / 2 * 0.9]);
    const g = standGeo(x, y, ang, len, depth, side);
    standG.push(g.seats); standC.push(g.body); standR.push(g.roof);
    return true;
  };
  placeStand(-30, 1, 90);
  const cornerStands = { monza: ['Variante del Rettifilo', 'Parabolica', 'Variante Ascari', 'Lesmo 1'], silverstone: ['Copse', 'Luffield', 'Stowe', 'Club', 'Abbey', 'Village'], monaco: ['Sainte-Dévote', 'Piscine'] }[def.id] || [];
  for (const c of T.corners) if (cornerStands.includes(c.name)) {
    const k = T.curv[Math.floor(c.s + 10) % N];
    const outside = k > 0 ? -1 : 1;
    if (!placeStand(c.s + 15, outside, 60)) placeStand(c.s + 15, -outside, 50);
  }
  if (standG.length) {
    add(mergeGeometries(standG), standMat, true, false);
    add(mergeGeometries(standC), concreteM, true, true);
    add(mergeGeometries(standR), roofM, false, true);
  }

  // --- Stands / garages ---------------------------------------------------------------
  {
    const p0 = sampleAt(T, -60);
    const depth = 13, len = 160;
    for (const extra of [0, 6, 12]) {
      const d = -(wallD + 11 + extra + depth / 2);
      const x = p0.x + p0.nx * d, y = p0.y + p0.ny * d, ang = Math.atan2(p0.ty, p0.tx);
      if (okRect(x, y, ang, len, depth, 2) && clear(x, y, len / 2)) {
        footprints.push([x, y, len / 2]);
        const gt = TX.garageTexture(); gt.repeat.set(len / 32, 1);
        const gm = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.6 });
        const pit = new THREE.Mesh(new THREE.BoxGeometry(len, 9, depth), [concreteM, concreteM, roofM, concreteM, gm, concreteM]);
        pit.position.set(x, 4.5, -y); pit.rotation.y = ang;
        // la face +Z de la boîte regarde la piste
        pit.castShadow = pit.receiveShadow = quality.shadows;
        root.add(pit);
        add(sweep(T, -150, 30, flat(-(wallD + 11 + extra), -wallD - 0.6, 0.015), { vScale: 10 }), asphaltMat);
        break;
      }
    }
  }

  // --- Panneaux de distance avant les gros freinages (fusionnés) ------------------------
  {
    const v = T.vProf;
    const geos = { 150: [], 100: [], 50: [] }, posts = [];
    for (let i = 0; i < N; i++) {
      const a = v[(i - 1 + N) % N], b = v[i], c = v[(i + 1) % N];
      if (b <= a && b < c) { // minimum local
        let j = i, vmax = b;
        for (let k = 1; k < 260; k++) { const vv = v[(i - k + N) % N]; if (vv >= vmax) { vmax = vv; j = i - k; } else break; }
        if (vmax - b < 22) continue;
        const k2 = T.curv[(i + 8) % N];
        const side = k2 > 0 ? -1 : 1; // extérieur du virage
        for (const dist of [150, 100, 50]) {
          const s = i - 15 - dist;
          if (s < j - 40) continue;
          const p = sampleAt(T, s);
          const d = side * (wallD + 1.4);
          const x = p.x + p.nx * d, y = p.y + p.ny * d;
          const bg = new THREE.PlaneGeometry(1.1, 1.1);
          bg.rotateY(Math.atan2(-p.tx, p.ty)); bg.translate(x, 1.7, -y);
          geos[dist].push(bg);
          const pg = new THREE.BoxGeometry(0.08, 1.2, 0.08); pg.translate(x, 0.6, -y);
          posts.push(ni(pg));
        }
      }
    }
    for (const dist of [150, 100, 50]) if (geos[dist].length) {
      const m = add(mergeGeometries(geos[dist]), new THREE.MeshStandardMaterial({ map: TX.distanceBoardTexture(dist), roughness: 0.6 }), false);
      m.layers.set(2);
    }
    if (posts.length) { const m = add(mergeGeometries(posts), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.6, metalness: 0.5 }), false); m.layers.set(2); }
  }

  // --- Portique des feux de départ -------------------------------------------------------
  const lamps = [];
  let lampOffMat = null;
  {
    const p = sampleAt(T, 3.0);
    const g = new THREE.Group();
    g.position.copy(W(p.x, p.y));
    g.rotation.y = Math.atan2(p.ty, p.tx) - Math.PI / 2; // local -Z = sens de course
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 });
    const span = 2 * wallD + 1.5;
    const parts = [];
    const bm = new THREE.BoxGeometry(span, 0.5, 0.6); bm.translate(0, 6.8, 0); parts.push(ni(bm));
    for (const sd of [-1, 1]) { const pg = new THREE.BoxGeometry(0.4, 7, 0.4); pg.translate(sd * span / 2, 3.5, 0); parts.push(ni(pg)); }
    for (let i = 0; i < 5; i++) { const pn = new THREE.BoxGeometry(0.6, 1.3, 0.3); pn.translate((i - 2) * 0.75, 6.0, 0.25); parts.push(ni(pn)); }
    const frame = new THREE.Mesh(mergeGeometries(parts), steel); frame.castShadow = quality.shadows; g.add(frame);
    const offM = lampOffMat = new THREE.MeshStandardMaterial({ color: 0x2a0606, roughness: 0.3, metalness: 0.2 });
    for (let i = 0; i < 5; i++) {
      const px = (i - 2) * 0.75;
      const a = new THREE.CircleGeometry(0.2, 20); a.translate(px, 6.25, 0.41);
      const b = new THREE.CircleGeometry(0.2, 20); b.translate(px, 5.75, 0.41);
      const lamp = new THREE.Mesh(mergeGeometries([ni(a), ni(b)]), offM);
      g.add(lamp);
      lamps.push({ mesh: lamp, col: i });
    }
    root.add(g);
  }

  // --- Drapeau à damier (agité seulement à l'arrivée) ---------------------------------------
  let flag;
  {
    const p = sampleAt(T, -6);
    const d = wallD + 0.9;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }));
    const base = W(p.x + p.nx * d, p.y + p.ny * d);
    pole.position.set(base.x, 2.1, base.z); root.add(pole);
    const fg = new THREE.PlaneGeometry(2.0, 1.3, 16, 8);
    fg.translate(1.0, 0, 0);
    const ft = TX.checkerTexture(6); ft.repeat.set(1, 1);
    const fmesh = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.7 }));
    fmesh.position.set(base.x, 3.55, base.z);
    fmesh.rotation.y = Math.atan2(-p.tx, p.ty);
    root.add(fmesh);
    const orig = fg.attributes.position.array.slice();
    flag = {
      update(t, amp) {
        const a = fg.attributes.position.array;
        for (let i = 0; i < a.length; i += 3) {
          const x = orig[i];
          a[i + 2] = Math.sin(x * 3.2 - t * 9) * 0.18 * x * amp;
          a[i + 1] = orig[i + 1] - x * 0.04 * (1 - amp);
        }
        fg.attributes.position.needsUpdate = true;
        fg.computeVertexNormals();
      },
    };
    flag.update(0, 0);
  }

  return { scene, sun, hemi, sunDir, lamps, lampOffMat, flag, sky };
}

// ---------------------------------------------------------------------
//  Utilitaires de géométrie de décor
// ---------------------------------------------------------------------
export function sampleAt(T, s) {
  const N = T.N; s = ((s % N) + N) % N;
  const i0 = Math.floor(s), i1 = (i0 + 1) % N, t = s - i0;
  return {
    x: T.px[i0] + (T.px[i1] - T.px[i0]) * t, y: T.py[i0] + (T.py[i1] - T.py[i0]) * t,
    tx: T.tx[i0], ty: T.ty[i0], nx: T.nx[i0], ny: T.ny[i0],
  };
}

// grille de départ : 8 m entre voitures, décalage gauche/droite
export function gridSlot(i) {
  return { s: -7 - i * 8, d: (i % 2 === 0 ? 1 : -1) * 2.6 };
}

function colorizeSimple(g, color) {
  const n = g.attributes.position.count; const c = new Float32Array(n * 3); const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// immeuble : boîte sans fond, UV en mètres/12 (étages de 3 m)
function buildingGeo(x, y, ang, w, d, y0, y1) {
  const h = y1 - y0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = nrm.getX(i), ny = nrm.getY(i);
    const size = Math.abs(nx) > 0.5 ? d : w;
    if (Math.abs(ny) > 0.5) { uv.setXY(i, 0, 0); continue; }
    uv.setXY(i, uv.getX(i) * size / 12, uv.getY(i) * h / 12);
  }
  g.rotateY(ang);
  g.translate(x, y0 + h / 2, -y);
  return ni(g);
}

function roofGeo(x, y, ang, w, d, hgt) {
  const g = new THREE.BoxGeometry(w * 0.98, 0.6, d * 0.98);
  g.rotateY(ang); g.translate(x, hgt + 0.3, -y);
  const ng = ni(g); ng.deleteAttribute('uv');
  return ng;
}

function yachtGeo(x, y, ang, len, rand) {
  const parts = [];
  const w = len * 0.26;
  const hull = new THREE.Shape();
  hull.moveTo(-len / 2, -w / 2); hull.lineTo(len * 0.25, -w / 2); hull.quadraticCurveTo(len / 2, -w * 0.2, len / 2 + 0.5, 0);
  hull.quadraticCurveTo(len / 2, w * 0.2, len * 0.25, w / 2); hull.lineTo(-len / 2, w / 2); hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 1.8, bevelEnabled: false });
  hg.rotateX(-Math.PI / 2); hg.translate(0, -0.6, 0);
  parts.push(colorizeSimple(ni(hg), 0xf7f7f5));
  const blue = new THREE.BoxGeometry(len * 0.9, 0.25, w * 1.01); blue.translate(-len * 0.02, 0.0, 0);
  parts.push(colorizeSimple(ni(blue), rand() < 0.5 ? 0x1b2b4a : 0xf0f0f0));
  const decks = 1 + Math.floor(rand() * 3);
  for (let k = 0; k < decks; k++) {
    const dl = len * (0.55 - k * 0.12), dw = w * (0.8 - k * 0.1);
    const b = new THREE.BoxGeometry(dl, 1.3, dw); b.translate(-len * 0.08 - k * 0.6, 1.85 + k * 1.3, 0);
    parts.push(colorizeSimple(ni(b), 0xfafafa));
    const win = new THREE.BoxGeometry(dl * 0.92, 0.45, dw * 1.02); win.translate(-len * 0.08 - k * 0.6, 1.9 + k * 1.3, 0);
    parts.push(colorizeSimple(ni(win), 0x1b2430));
  }
  const m = new THREE.Matrix4().makeRotationY(ang).setPosition(x, 0, -y);
  for (const p of parts) { p.applyMatrix4(m); if (p.attributes.uv) p.deleteAttribute('uv'); }
  return parts;
}

function standGeo(x, y, ang, len, depth, side) {
  // profil : avant bas (côté piste) -> arrière haut ; "side" oriente la face vers la piste
  const H0 = 1.5, H1 = 11;
  const half = depth / 2;
  // face des gradins (quad incliné)
  const seats = new THREE.BufferGeometry();
  const f = -side; // direction "vers la piste" en coordonnées locales y(carte)
  const P = (a, dd, h) => { // a : le long, dd : profondeur (+ = vers la piste)
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const nx = -sa, ny = ca; // normale gauche
    const px = x + ca * a + nx * (dd * f), py = y + sa * a + ny * (dd * f);
    return [px, h, -py];
  };
  const v = [P(-len / 2, half, H0), P(len / 2, half, H0), P(-len / 2, -half, H1), P(len / 2, -half, H1)].flat();
  seats.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  seats.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, len / 10, 0, 0, 3, len / 10, 3], 2));
  seats.setIndex(side > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]);
  seats.computeVertexNormals();
  // corps : base + mur arrière
  const body = new THREE.BoxGeometry(len, H1, 1.0);
  body.translate(0, H1 / 2, 0);
  const front = new THREE.BoxGeometry(len, H0, 0.6); front.translate(0, H0 / 2, 0);
  const place = (g, dd) => { g.rotateY(ang); const p = P(0, dd, 0); g.translate(p[0], 0, p[2]); return ni(g); };
  const b1 = place(body, -half - 0.5), b2 = place(front, half);
  const bodyG = mergeGeometries([b1, b2]);
  const roof = new THREE.BoxGeometry(len, 0.25, depth + 2); roof.translate(0, H1 + 3.2, 0);
  const roofG = place(roof, -0.5);
  roofG.deleteAttribute('uv'); bodyG.deleteAttribute('uv');
  // on conserve les UV des gradins
  seats.computeVertexNormals();
  return { seats: ni(seats), body: addUV(bodyG), roof: addUV(roofG) };
}

function addUV(g) {
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

function mountains(cx, cy, R, hMin, hMax, color, rand, arc) {
  const seg = 160;
  const pos = [], idx = [];
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    let f = 0.5 + 0.25 * Math.sin(a * 3 + ph[0]) + 0.15 * Math.sin(a * 7 + ph[1]) + 0.1 * Math.sin(a * 17 + ph[2]);
    let h = hMin + (hMax - hMin) * Math.max(0, f);
    if (arc) { // seulement sur un secteur (collines au nord)
      const inArc = a > arc[0] && a < arc[1];
      const edge = Math.min(Math.abs(a - arc[0]), Math.abs(a - arc[1]));
      h = inArc ? h * Math.min(1, edge / 0.35) : 0;
    }
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    const x2 = cx + Math.cos(a) * (R + 400), y2 = cy + Math.sin(a) * (R + 400);
    pos.push(x, -2, -y, x2, h, -y2);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  return m;
}
