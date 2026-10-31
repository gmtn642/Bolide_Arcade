// =====================================================================
//  Modèle 3D de monoplace (procédural) + volant de cockpit
//  Repère local : avant = -Z, haut = +Y, droite = +X. Origine au sol,
//  au milieu de l'empattement (3,5 m).
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';
import { numberTexture } from './textures.js';

export const LIVERIES = {
  rouge:  { name: 'Rouge',     primary: 0xc80a14, secondary: 0xf4f4f4, accent: 0x151515, helmet: 0xffd200 },
  bleu:   { name: 'Bleu nuit', primary: 0x16244f, secondary: 0xd2202c, accent: 0xb8bcc4, helmet: 0xf5f5f5 },
  argent: { name: 'Argent',    primary: 0xb9c0c7, secondary: 0x141414, accent: 0x00a59d, helmet: 0x1d1d1d },
  orange: { name: 'Orange',    primary: 0xff7a10, secondary: 0x1c2a4a, accent: 0x2e87ff, helmet: 0xff7a10 },
  vert:   { name: 'Vert',      primary: 0x0c5c3e, secondary: 0xc8f03c, accent: 0x111111, helmet: 0xc8f03c },
};

export const EYE = new THREE.Vector3(0, 0.95, 0.10);       // œil du pilote
export const MIRRORS = [
  { x: -0.62, y: 0.86, z: -0.70 },
  { x: 0.62, y: 0.86, z: -0.70 },
];

// Matériaux partagés (couleurs par sommet)
let SHARED = null;
export function sharedMaterials() {
  if (SHARED) return SHARED;
  SHARED = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.35, envMapIntensity: 1.25 }),
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.3 }),
  };
  return SHARED;
}

// ---------------------------------------------------------------------
//  Géométries utilitaires
// ---------------------------------------------------------------------
function colorize(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (typeof color === 'function') {
      color(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i), col);
    } else col.set(color);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  // ne garder que les attributs communs
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

// Corps "loft" : sections superellipses le long de Z
function loft(sections, radial = 24, sub = 3, xOff = 0) {
  // sous-échantillonnage linéaire des sections
  const S = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      S.push(a.map((v, j) => v + (b[j] - v) * t));
    }
  }
  S.push(sections[sections.length - 1]);
  const pos = [], idx = [];
  const p = 2.6; // exposant superellipse
  for (const [z, w, top, bot] of S) {
    const mid = (top + bot) / 2, hh = (top - bot) / 2;
    for (let r = 0; r < radial; r++) {
      const t = (r / radial) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const x = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
      const y = mid + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
      pos.push(x + xOff, y, z);
    }
  }
  for (let i = 0; i < S.length - 1; i++) {
    for (let r = 0; r < radial; r++) {
      const a = i * radial + r, b = i * radial + (r + 1) % radial;
      const c = (i + 1) * radial + r, d = (i + 1) * radial + (r + 1) % radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  // bouchons
  const capF = pos.length / 3; { const [z, , top, bot] = S[0]; pos.push(xOff, (top + bot) / 2, z); }
  for (let r = 0; r < radial; r++) idx.push(capF, r, (r + 1) % radial);
  const last = (S.length - 1) * radial;
  const capB = pos.length / 3; { const [z, , top, bot] = S[S.length - 1]; pos.push(xOff, (top + bot) / 2, z); }
  for (let r = 0; r < radial; r++) idx.push(capB, last + (r + 1) % radial, last + r);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

function rod(a, b, r = 0.012) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(r * 2.4, r, len);
  const m = new THREE.Matrix4().lookAt(A, B, new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(m);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

function tube(points, r, closed = false, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
  return new THREE.TubeGeometry(curve, seg, r, 8, closed);
}

function tire(radius, width) {
  const w = width / 2;
  const pts = [
    [radius * 0.64, -w], [radius * 0.88, -w], [radius * 0.96, -w + 0.012], [radius, -w + 0.05],
    [radius, w - 0.05], [radius * 0.96, w - 0.012], [radius * 0.88, w], [radius * 0.64, w],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 30);
  g.rotateZ(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------
//  Construction de la voiture
// ---------------------------------------------------------------------
export function buildCar(liveryKey, number, opts = {}) {
  const L = LIVERIES[liveryKey];
  const M = sharedMaterials();
  const paint = [], matte = [], metal = [];
  const P = new THREE.Color(L.primary), S2 = new THREE.Color(L.secondary), A = new THREE.Color(L.accent);
  const carbon = 0x1a1b1e, rubber = 0x121212;

  const bodyColor = (x, y, z, out) => {
    if (z < -2.3) out.copy(S2);                         // pointe du nez
    else if (Math.abs(x) < 0.09 && y > 0.78 && z > 0.3) out.copy(S2); // arête capot moteur
    else if (y < 0.16) out.set(carbon);                 // bas de caisse
    else if (z > 1.9 && y < 0.5) out.copy(A);
    else out.copy(P);
  };
  // monocoque + capot moteur
  paint.push(colorize(loft([
    [-2.80, 0.07, 0.22, 0.12],
    [-2.45, 0.10, 0.30, 0.12],
    [-2.00, 0.15, 0.42, 0.13],
    [-1.60, 0.19, 0.50, 0.12],
    [-1.15, 0.25, 0.60, 0.10],
    [-0.75, 0.30, 0.67, 0.08],
    [-0.62, 0.31, 0.50, 0.07],
    [0.30, 0.34, 0.50, 0.06],
    [0.42, 0.33, 0.90, 0.06],
    [0.75, 0.29, 0.94, 0.07],
    [1.20, 0.24, 0.82, 0.08],
    [1.70, 0.17, 0.62, 0.10],
    [2.15, 0.11, 0.46, 0.14],
    [2.40, 0.07, 0.38, 0.18],
  ]), bodyColor));
  // pontons latéraux
  const podColor = (x, y, z, out) => {
    if (y > 0.5 && z < 0.2) out.copy(A);
    else if (y < 0.16) out.set(carbon);
    else out.copy(P);
  };
  for (const sx of [-1, 1]) {
    paint.push(colorize(loft([
      [-0.62, 0.19, 0.52, 0.17],
      [-0.45, 0.25, 0.56, 0.12],
      [0.10, 0.26, 0.55, 0.08],
      [0.70, 0.22, 0.45, 0.08],
      [1.25, 0.13, 0.32, 0.09],
      [1.65, 0.06, 0.22, 0.10],
    ], 20, 2, sx * 0.52), podColor));
    // entrée d'air du ponton
    matte.push(colorize(box(0.30, 0.28, 0.02, sx * 0.53, 0.35, -0.625), 0x050505));
    // bordures du cockpit
    paint.push(colorize(loft([
      [-0.62, 0.05, 0.62, 0.48],
      [-0.40, 0.065, 0.72, 0.48],
      [0.05, 0.065, 0.74, 0.48],
      [0.33, 0.05, 0.80, 0.48],
    ], 12, 2, sx * 0.29), P));
  }
  // intérieur sombre du cockpit
  matte.push(colorize(box(0.56, 0.01, 0.92, 0, 0.505, -0.16), 0x0a0a0b));
  // prise d'air au-dessus du pilote
  matte.push(colorize(box(0.22, 0.14, 0.02, 0, 0.82, 0.415), 0x050505));
  // dérive (aileron de requin)
  {
    const sh = new THREE.Shape();
    sh.moveTo(0.75, 0.93); sh.lineTo(2.25, 0.92); sh.lineTo(2.25, 0.55); sh.lineTo(1.35, 0.80); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: false });
    // forme dans le plan (z, y) : rotation pour que X(forme) -> Z(voiture)
    g.rotateY(-Math.PI / 2);
    g.translate(0.007, 0, 0);
    paint.push(colorize(g, P));
  }
  // fond plat + diffuseur
  matte.push(colorize(box(1.55, 0.03, 3.3, 0, 0.045, 0.30), carbon));
  matte.push(colorize(box(1.0, 0.02, 0.5, 0, 0.12, 2.05, -0.35), carbon));
  // aileron avant
  const fw = (x, y, z, out) => out.copy(Math.abs(x) > 0.55 ? S2 : P);
  paint.push(colorize(box(1.86, 0.025, 0.32, 0, 0.09, -2.70), fw));
  paint.push(colorize(box(1.70, 0.02, 0.16, 0, 0.17, -2.58, -0.35), fw));
  matte.push(colorize(box(1.50, 0.018, 0.12, 0, 0.235, -2.50, -0.65), carbon));
  for (const sx of [-1, 1]) {
    paint.push(colorize(box(0.025, 0.26, 0.44, sx * 0.94, 0.17, -2.66), A));
    matte.push(colorize(box(0.03, 0.12, 0.05, sx * 0.08, 0.17, -2.60), carbon));
  }
  // aileron arrière
  for (const sx of [-1, 1]) paint.push(colorize(box(0.022, 0.58, 0.46, sx * 0.52, 0.70, 2.34), S2));
  paint.push(colorize(box(1.04, 0.035, 0.34, 0, 0.84, 2.33, 0.15), P));
  paint.push(colorize(box(1.04, 0.025, 0.18, 0, 0.955, 2.45, 0.5), S2));
  matte.push(colorize(box(0.90, 0.025, 0.20, 0, 0.42, 2.26, 0.1), carbon));
  matte.push(colorize(box(0.035, 0.40, 0.16, 0, 0.62, 2.28), carbon));
  matte.push(colorize(box(0.08, 0.08, 0.03, 0, 0.30, 2.47), 0x7a0b0b)); // feu arrière
  // halo
  matte.push(colorize(tube([
    [-0.37, 0.70, 0.32], [-0.42, 0.95, 0.06], [-0.34, 1.07, -0.34], [0, 1.11, -0.54],
    [0.34, 1.07, -0.34], [0.42, 0.95, 0.06], [0.37, 0.70, 0.32],
  ], 0.02), carbon));
  matte.push(colorize(tube([[0, 1.11, -0.54], [0, 0.95, -0.70], [0, 0.68, -0.84]], 0.02, false, 12), carbon));
  // rétroviseurs (coques)
  for (const m of MIRRORS) {
    paint.push(colorize(box(0.33, 0.145, 0.06, m.x, m.y, m.z - 0.005), P));
    matte.push(colorize(rod([m.x * 0.85, m.y - 0.06, m.z + 0.01], [m.x * 0.9, 0.54, m.z + 0.12], 0.016), carbon));
    matte.push(colorize(rod([m.x * 1.05, m.y - 0.06, m.z + 0.01], [m.x * 1.0, 0.54, m.z + 0.12], 0.012), carbon));
  }
  // roues
  const wheels = [
    { x: 0.80, z: -1.75, r: 0.36, w: 0.30 },
    { x: 0.78, z: 1.75, r: 0.37, w: 0.38 },
  ];
  const compound = opts.compound || 0xf5c400;
  for (const wd of wheels) for (const sx of [-1, 1]) {
    const x = sx * wd.x;
    const t = tire(wd.r, wd.w); t.translate(x, wd.r, wd.z); matte.push(colorize(t, rubber));
    const rim = new THREE.CylinderGeometry(wd.r * 0.64, wd.r * 0.64, wd.w * 0.86, 24, 1, true);
    rim.rotateZ(Math.PI / 2); rim.translate(x, wd.r, wd.z); metal.push(colorize(rim, 0x2b2d31));
    const disc = new THREE.CircleGeometry(wd.r * 0.64, 24); disc.rotateY(sx * Math.PI / 2);
    disc.translate(x + sx * wd.w * 0.40, wd.r, wd.z); metal.push(colorize(disc, 0x3a3c40));
    const ring = new THREE.RingGeometry(wd.r * 0.80, wd.r * 0.86, 30); ring.rotateY(sx * Math.PI / 2);
    ring.translate(x + sx * (wd.w / 2 + 0.002), wd.r, wd.z); matte.push(colorize(ring, compound));
    const nut = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10); nut.rotateZ(Math.PI / 2);
    nut.translate(x + sx * wd.w * 0.42, wd.r, wd.z); metal.push(colorize(nut, 0xc8a400));
    // suspensions
    const zc = wd.z;
    matte.push(colorize(rod([sx * 0.2, 0.42, zc - 0.15], [x - sx * 0.12, wd.r + 0.08, zc], 0.012), carbon));
    matte.push(colorize(rod([sx * 0.2, 0.42, zc + 0.18], [x - sx * 0.12, wd.r + 0.08, zc], 0.012), carbon));
    matte.push(colorize(rod([sx * 0.18, 0.18, zc - 0.15], [x - sx * 0.12, wd.r - 0.08, zc], 0.012), carbon));
    matte.push(colorize(rod([sx * 0.18, 0.18, zc + 0.18], [x - sx * 0.12, wd.r - 0.08, zc], 0.012), carbon));
  }
  // pilote (casque) — absent dans la vue cockpit
  if (!opts.noDriver) {
    const h = new THREE.SphereGeometry(0.135, 20, 14); h.scale(1, 1.05, 1.12); h.translate(0, 0.86, 0.14);
    paint.push(colorize(h, (x, y, z, out) => out.set(y > 0.93 ? L.helmet : (z < 0.05 && y > 0.82 && y < 0.9 ? 0x080808 : L.helmet))));
    matte.push(colorize(box(0.30, 0.10, 0.18, 0, 0.62, 0.22), 0x222222)); // épaules
  }

  const group = new THREE.Group();
  const add = (list, mat) => {
    if (!list.length) return;
    const g = mergeGeometries(list, false);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = !!opts.shadows; mesh.receiveShadow = false;
    group.add(mesh);
  };
  add(paint, M.paint); add(matte, M.matte); add(metal, M.metal);
  // numéro sur la dérive
  if (number != null) {
    const nt = numberTexture(number, '#' + S2.getHexString(), '#' + P.getHexString());
    const nm = new THREE.MeshStandardMaterial({ map: nt, roughness: 0.35, metalness: 0.2 });
    const pls = [-1, 1].map(sx => { const g = new THREE.PlaneGeometry(0.42, 0.2); g.rotateY(sx * Math.PI / 2); g.translate(sx * 0.009, 0.78, 1.55); return g; });
    group.add(new THREE.Mesh(mergeGeometries(pls), nm));
  }
  return group;
}

// ---------------------------------------------------------------------
//  Volant de cockpit avec écran et diodes de changement de rapport
// ---------------------------------------------------------------------
export function buildSteeringWheel(liveryKey) {
  const L = LIVERIES[liveryKey];
  const root = new THREE.Group();     // positionné dans la voiture
  const tilt = new THREE.Group();     // incliné vers le pilote
  const spin = new THREE.Group();     // tourne avec la direction
  root.add(tilt); tilt.add(spin);
  root.position.set(0, 0.725, -0.37);
  root.scale.setScalar(0.9);
  tilt.rotation.x = -0.5;

  const carbonM = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.45, metalness: 0.3 });
  const rubberM = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.9 });
  const gloveM = new THREE.MeshStandardMaterial({ color: L.primary, roughness: 0.7 });
  const glove2 = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

  // corps
  const sh = new THREE.Shape();
  const W = 0.135, H1 = 0.075, H2 = -0.06;
  sh.moveTo(-W + 0.02, H1); sh.lineTo(W - 0.02, H1); sh.quadraticCurveTo(W, H1, W, H1 - 0.02);
  sh.lineTo(W, H2 + 0.02); sh.quadraticCurveTo(W, H2, W - 0.03, H2);
  sh.lineTo(0.05, H2); sh.lineTo(0.035, H2 - 0.02); sh.lineTo(-0.035, H2 - 0.02); sh.lineTo(-0.05, H2);
  sh.lineTo(-W + 0.03, H2); sh.quadraticCurveTo(-W, H2, -W, H2 + 0.02); sh.lineTo(-W, H1 - 0.02);
  sh.quadraticCurveTo(-W, H1, -W + 0.02, H1);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.028, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }), carbonM);
  body.position.z = -0.03;
  spin.add(body);
  // poignées, gants, molettes (géométries fusionnées par matériau)
  const gripG = [], gloveG = [], cuffG = [], knobG = [];
  const place = (g, x, y, z, rx = 0, rz = 0, sc = null) => {
    if (sc) g.scale(...sc);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
    g.translate(x, y, z); return g;
  };
  for (const sx of [-1, 1]) {
    gripG.push(place(new THREE.CapsuleGeometry(0.026, 0.095, 6, 12), sx * 0.142, -0.005, -0.012, 0, sx * 0.12));
    gloveG.push(place(new THREE.CapsuleGeometry(0.036, 0.06, 6, 12), sx * 0.152, 0.0, 0.012, 0, sx * 0.12, [1, 1, 0.9]));
    gloveG.push(place(new THREE.CapsuleGeometry(0.014, 0.035, 4, 8), sx * 0.118, 0.03, 0.03, 0, sx * 0.9));
    cuffG.push(place(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 12), sx * 0.17, -0.02, 0.07, 1.3, 0));
  }
  const knobCols = [0xe02020, 0xf0c000, 0x2080f0, 0x20c040, 0xf0f0f0, 0xff7a00];
  const knobPos = [[-0.085, -0.035], [0.085, -0.035], [-0.1, 0.03], [0.1, 0.03], [-0.06, -0.048], [0.06, -0.048]];
  knobPos.forEach((p, i) => knobG.push(colorize(place(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 14), p[0], p[1], 0.006, Math.PI / 2, 0), knobCols[i])));
  const nonIdx = (arr) => arr.map(g => (g.index ? g.toNonIndexed() : g));
  spin.add(new THREE.Mesh(mergeGeometries(nonIdx(gripG)), rubberM));
  spin.add(new THREE.Mesh(mergeGeometries(nonIdx(gloveG)), gloveM));
  spin.add(new THREE.Mesh(mergeGeometries(nonIdx(cuffG)), glove2));
  spin.add(new THREE.Mesh(mergeGeometries(knobG), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 })));
  // écran (CanvasTexture)
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 192;
  const ctx = cv.getContext('2d');
  const dtex = new THREE.CanvasTexture(cv); dtex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.075), new THREE.MeshBasicMaterial({ map: dtex, toneMapped: false }));
  screen.position.set(0, 0.012, 0.0125);
  spin.add(screen);
  // colonne de direction
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.28, 10), carbonM);
  col.rotation.x = Math.PI / 2; col.position.set(0, 0, -0.17);
  tilt.add(col);

  let last = '';
  function update(gear, kmh, rpmFrac, extra) {
    const key = gear + '|' + kmh + '|' + Math.round(rpmFrac * 15) + '|' + (extra || '');
    if (key === last) return;
    last = key;
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, 384, 192);
    // diodes
    const n = 15, lit = Math.round(rpmFrac * n);
    for (let i = 0; i < n; i++) {
      const on = i < lit;
      let c = i < 5 ? '#19e04a' : i < 10 ? '#ff2a2a' : '#3a7bff';
      if (rpmFrac > 0.97) c = '#3a7bff';
      ctx.fillStyle = on ? c : '#1a1d22';
      ctx.beginPath(); ctx.arc(22 + i * 24.3, 18, 9, 0, Math.PI * 2); ctx.fill();
    }
    // rapport
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 112px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(gear), 192, 112);
    ctx.font = 'bold 50px Arial'; ctx.fillStyle = '#ffd400';
    ctx.textAlign = 'left'; ctx.fillText(String(kmh), 14, 110);
    ctx.font = 'bold 20px Arial'; ctx.fillStyle = '#9aa3ad'; ctx.fillText('KM/H', 16, 152);
    if (extra) { ctx.textAlign = 'right'; ctx.font = 'bold 44px Arial'; ctx.fillStyle = '#ffffff'; ctx.fillText(extra, 372, 110); ctx.font = 'bold 20px Arial'; ctx.fillStyle = '#9aa3ad'; ctx.fillText('POS', 370, 152); }
    ctx.strokeStyle = '#2a3038'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, 381, 189);
    dtex.needsUpdate = true;
  }
  update('N', 0, 0, '');
  return { root, spin, update };
}
