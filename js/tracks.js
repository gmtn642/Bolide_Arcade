// =====================================================================
//  BOLIDE ARCADE — Circuits
//  Tracés construits "à la tortue" (lignes droites + virages) puis
//  refermés automatiquement. Longueurs réduites (~40 s par tour) pour
//  tenir une partie complète en moins de 3 minutes.
//  Module pur (aucune dépendance) : utilisable dans le navigateur et Node.
// =====================================================================

// Physique commune (joueur + IA) — unités SI (m, s)
export const PHYS = {
  vmax: 90,          // vitesse de pointe (m/s) ≈ 324 km/h
  accel0: 16,        // accélération à basse vitesse (m/s²)
  brake: 34,         // décélération au freinage (m/s²) ≈ 3,5 g
  latBase: 22,       // adhérence latérale mécanique (m/s²)
  latAero: 0.0045,   // appui aérodynamique : + latAero·v² (m/s²)
  coast: 2.0,        // frein moteur / roulement (m/s²)
  drag: 0.00018,     // traînée : drag·v² (m/s²)
};

export function latGrip(v) { return PHYS.latBase + PHYS.latAero * v * v; }
export function engineAccel(v) {
  const r = v / PHYS.vmax;
  return PHYS.accel0 * Math.max(0, 1 - r * r);
}

// ---------------------------------------------------------------------
//  Définitions. Angles en degrés (+ gauche, − droite), longueurs en m.
//  'a' et 'b' : lignes droites ajustées pour refermer la boucle.
// ---------------------------------------------------------------------
export const TRACKS = [
  {
    id: 'monaco', name: 'Monaco', country: 'Principauté de Monaco', flag: 'mc',
    info: 'Circuit urbain. Rails, virages serrés, le tunnel et l’épingle.',
    laps: 2, width: 11, kerb: 0.7, runoff: 0.4, heading0: 95, scale: 0.66,
    scenery: 'city', sky: { top: 0x2f6fd0, horizon: 0xbfd9f2, clouds: 0.25 },
    sunElev: 52, sunAz: 210, ground: 'city',
    segs: [
      ['S', 130],                 // ligne de départ -> léger coude
      ['T', -10, 200],
      ['S', 100],
      ['T', -80, 20, 'Sainte-Dévote'],
      ['S', 160],                 // montée de Beau Rivage
      ['T', 15, 150],
      ['S', 70],
      ['T', 80, 45, 'Massenet'],
      ['S', 15],
      ['T', -80, 22, 'Casino'],
      ['S', 70],
      ['T', -120, 16, 'Mirabeau'],
      ['S', 55],
      ['T', 180, 11, 'Épingle'],
      ['S', 45],
      ['T', -90, 14, 'Mirabeau Bas'],
      ['S', 35],
      ['T', -90, 16, 'Portier'],
      ['S', 50, null, 'tunnelIn'],
      ['T', -45, 160, 'Tunnel'],
      ['S', 170, null, 'tunnelOut'],
      ['T', 45, 14, 'Chicane'],
      ['T', -55, 14],
      ['S', 160],
      ['T', 60, 30, 'Tabac'],
      ['S', 50],
      ['T', 30, 25, 'Piscine'],
      ['T', -30, 25],
      ['S', 45],
      ['T', -35, 18],
      ['T', 35, 18],
      ['S', 30],
      ['T', -110, 13, 'Rascasse'],
      ['S', 25],
      ['T', -60, 15, 'Anthony Noghès'],
      ['S', 60],
    ],
    // zones de décor : [segDébut, segFin, côté (+1 gauche / -1 droite), type]
    zones: [
      [18, 34, 1, 'water'],
    ],
  },
  {
    id: 'monza', name: 'Monza', country: 'Italie', flag: 'it',
    info: 'Le temple de la vitesse. Longues lignes droites et chicanes.',
    laps: 2, width: 14, kerb: 1.0, runoff: 7, heading0: 90, scale: 0.78,
    scenery: 'park', sky: { top: 0x3a78c8, horizon: 0xe6dcc6, clouds: 0.35 },
    sunElev: 34, sunAz: 250, ground: 'grass',
    segs: [
      ['S', 260],
      ['T', -85, 14, 'Variante del Rettifilo'],
      ['S', 12],
      ['T', 75, 14],
      ['S', 60],
      ['T', -70, 140, 'Curva Grande'],
      ['S', 180],
      ['T', 50, 16, 'Variante della Roggia'],
      ['T', -50, 16],
      ['S', 100],
      ['T', -75, 40, 'Lesmo 1'],
      ['S', 80],
      ['T', -55, 40, 'Lesmo 2'],
      ['S', 170],
      ['T', 8, 300],
      ['S', 150],
      ['T', 40, 35, 'Variante Ascari'],
      ['T', -60, 35],
      ['T', 25, 45],
      ['S', 330],
      ['T', -163, 110, 'Parabolica'],
      ['S', 300],
    ],
    zones: [],
  },
  {
    id: 'silverstone', name: 'Silverstone', country: 'Grande-Bretagne', flag: 'gb',
    info: 'Ancien aérodrome. Virages rapides : Copse, Maggotts, Becketts.',
    laps: 2, width: 15, kerb: 1.0, runoff: 8, heading0: 0, scale: 0.68,
    scenery: 'fields', sky: { top: 0x5b84b8, horizon: 0xd8dde3, clouds: 0.6 },
    sunElev: 40, sunAz: 160, ground: 'grass',
    segs: [
      ['S', 54],
      ['T', -77, 45, 'Abbey'],
      ['S', 10],
      ['T', 30, 60, 'Farm'],
      ['S', 18],
      ['T', -100, 18, 'Village'],
      ['S', 20],
      ['T', 150, 14, 'The Loop'],
      ['S', 15],
      ['T', 60, 35, 'Aintree'],
      ['S', 375],                 // Wellington
      ['T', 90, 20, 'Brooklands'],
      ['S', 20],
      ['T', -180, 26, 'Luffield'],
      ['S', 40],
      ['T', -30, 90, 'Woodcote'],
      ['S', 202],
      ['T', -97, 55, 'Copse'],
      ['S', 40],
      ['T', 40, 50, 'Maggotts'],
      ['T', -60, 40, 'Becketts'],
      ['T', 50, 40],
      ['T', -34, 60, 'Chapel'],
      ['S', 300],                 // Hangar
      ['T', -94, 50, 'Stowe'],
      ['S', 137],
      ['T', 60, 20, 'Vale'],
      ['T', -168, 25, 'Club'],
      ['S', 60],
    ],
    zones: [],
  },
];

// ---------------------------------------------------------------------
//  Génération du tracé
// ---------------------------------------------------------------------
export function walk(segs, heading0, lens) {
  // lens : longueurs effectives des lignes droites (après ajustement)
  const pts = [];
  const segStart = [];
  let x = 0, y = 0, h = heading0 * Math.PI / 180;
  const step = 0.5;
  pts.push([x, y]);
  const dirs = [], chords = [];
  for (let k = 0; k < segs.length; k++) {
    const sg = segs[k];
    segStart.push(pts.length - 1);
    if (sg[0] === 'S') {
      dirs[k] = [Math.cos(h), Math.sin(h)];
      const L = lens[k];
      const n = Math.max(1, Math.round(L / step));
      const d = L / n;
      for (let i = 0; i < n; i++) { x += Math.cos(h) * d; y += Math.sin(h) * d; pts.push([x, y]); }
    } else {
      const ang = sg[1] * Math.PI / 180, r = sg[2];
      const L = Math.abs(ang) * r;
      const x0 = x, y0 = y;
      const n = Math.max(2, Math.round(L / step));
      const dh = ang / n, d = L / n;
      for (let i = 0; i < n; i++) {
        h += dh / 2; x += Math.cos(h) * d; y += Math.sin(h) * d; h += dh / 2;
        pts.push([x, y]);
      }
      chords[k] = [(x - x0) / r, (y - y0) / r];
    }
  }
  return { pts, dirs, chords, segStart, end: [x, y] };
}

function closedResample(pts, spacing) {
  // pts : boucle fermée (dernier ≈ premier). Retourne points équidistants.
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[n - 1] + Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
  const N = Math.round(total / spacing);
  const out = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / N) * total;
    while (j < n - 1 && cum[j + 1] < s) j++;
    const a = pts[j], b = j + 1 < n ? pts[j + 1] : pts[0];
    const segL = (j + 1 < n ? cum[j + 1] : total) - cum[j];
    const t = segL > 0 ? (s - cum[j]) / segL : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return { pts: out, total };
}

export function buildTrack(def) {
  const sc = def.scale || 1;
  const segs = def.segs.map(s => {
    const c = s.slice();
    if (c[0] === 'S') c[1] *= sc; else c[2] = Math.max(10, c[2] * sc);
    return c;
  });
  // 1) garantir une rotation totale de -360° (sens horaire)
  let sum = 0;
  for (const s of segs) if (s[0] === 'T') sum += s[1];
  const k = -360 / sum;
  for (const s of segs) if (s[0] === 'T') s[1] *= k;

  // 2) fermer la boucle : correction de norme minimale répartie sur
  //    les lignes droites (longueur) et les virages (rayon)
  const lens = segs.map(s => (s[0] === 'S' ? s[1] : 0));
  let w = walk(segs, def.heading0, lens);
  const initErr = [w.end[0], w.end[1]];
  for (let pass = 0; pass < 3; pass++) {
    const ex = -w.end[0], ey = -w.end[1];
    if (Math.hypot(ex, ey) < 0.01) break;
    const vars = [];
    segs.forEach((sg, i) => {
      if (sg[0] === 'S') vars.push({ i, p: lens[i], u: w.dirs[i], st: 1.0 });
      else vars.push({ i, p: sg[2], u: w.chords[i], st: 0.5 });
    });
    let a11 = 0, a12 = 0, a22 = 0;
    for (const v of vars) {
      const wt = v.p * v.st;
      a11 += wt * v.u[0] * v.u[0]; a12 += wt * v.u[0] * v.u[1]; a22 += wt * v.u[1] * v.u[1];
    }
    const det = a11 * a22 - a12 * a12;
    const l1 = (ex * a22 - ey * a12) / det, l2 = (a11 * ey - a12 * ex) / det;
    for (const v of vars) {
      const dp = v.p * v.st * (v.u[0] * l1 + v.u[1] * l2);
      if (segs[v.i][0] === 'S') lens[v.i] = Math.max(5, lens[v.i] + dp);
      else segs[v.i][2] = Math.max(Math.max(10, def.segs[v.i][2] * sc) * 0.6, segs[v.i][2] + dp);
    }
    w = walk(segs, def.heading0, lens);
  }
  const closeErr = Math.hypot(w.end[0], w.end[1]);
  const raw = w.pts.slice(0, -1); // dernier point = premier

  // 3) lissage léger de la courbure (transitions droite/virage)
  let P = raw.map(p => p.slice());
  const n0 = P.length;
  for (let it = 0; it < 12; it++) {
    const Q = P.map(p => p.slice());
    for (let i = 0; i < n0; i++) {
      const a = P[(i - 1 + n0) % n0], b = P[(i + 1) % n0];
      Q[i][0] = P[i][0] * 0.5 + (a[0] + b[0]) * 0.25;
      Q[i][1] = P[i][1] * 0.5 + (a[1] + b[1]) * 0.25;
    }
    P = Q;
  }
  // abscisses des débuts de segments (sur le tracé brut, pas de 0,5 m)
  const segS = w.segStart.map(i => i * 0.5);

  // 4) rééchantillonnage à 1 m
  const rs = closedResample(P, 1.0);
  const pts = rs.pts;
  const N = pts.length;
  const L = N; // espacement 1 m -> longueur = N
  const scaleS = N / (raw.length * 0.5);
  const segSs = segS.map(s => s * scaleS);

  // tangentes, normales (gauche), courbure
  const tx = new Float32Array(N), ty = new Float32Array(N);
  const nx = new Float32Array(N), ny = new Float32Array(N);
  const px = new Float32Array(N), py = new Float32Array(N);
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) { px[i] = pts[i][0]; py[i] = pts[i][1]; }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let dx = px[b] - px[a], dy = py[b] - py[a];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l; nx[i] = -ty[i]; ny[i] = tx[i];
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 3 + N) % N, b = (i + 3) % N;
    const ha = Math.atan2(ty[a], tx[a]), hb = Math.atan2(ty[b], tx[b]);
    let dh = hb - ha; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    curv[i] = dh / 6;
  }

  const halfW = def.width / 2;
  const track = {
    def, N, L, px, py, tx, ty, nx, ny, curv, halfW,
    kerb: def.kerb, runoff: def.runoff,
    wallD: halfW + def.kerb + def.runoff, // distance du mur à l'axe
    segS: segSs, lens, closeErr, initErr, radii: segs.map(s => s[0] === 'T' ? s[2] : 0),
  };
  computeRacingLine(track);
  computeSpeedProfile(track);
  // zones et tunnel
  track.tunnel = null;
  const tIn = def.segs.findIndex(s => s[3] === 'tunnelIn');
  const tOut = def.segs.findIndex(s => s[3] === 'tunnelOut');
  if (tIn >= 0) track.tunnel = [segSs[tIn] + 10, segSs[tOut] + 70];
  track.zones = (def.zones || []).map(z => ({ s0: segSs[z[0]], s1: segSs[z[1]], side: z[2], type: z[3] }));
  // noms des virages (pour info)
  track.corners = [];
  def.segs.forEach((s, i) => { if (s[0] === 'T' && s[3]) track.corners.push({ name: s[3], s: segSs[i] }); });
  return track;
}

// ---------------------------------------------------------------------
//  Trajectoire idéale (lissage contraint dans la largeur de piste)
// ---------------------------------------------------------------------
function computeRacingLine(T) {
  const step = 4;
  const M = Math.floor(T.N / step);
  const off = new Float32Array(M);
  const lim = T.halfW - 1.5;
  const cx = i => T.px[i * step], cy = i => T.py[i * step];
  for (let it = 0; it < 1500; it++) {
    for (let i = 0; i < M; i++) {
      const a = (i - 1 + M) % M, b = (i + 1) % M;
      const ax = cx(a) + T.nx[a * step] * off[a], ay = cy(a) + T.ny[a * step] * off[a];
      const bx = cx(b) + T.nx[b * step] * off[b], by = cy(b) + T.ny[b * step] * off[b];
      const mx = (ax + bx) / 2 - cx(i), my = (ay + by) / 2 - cy(i);
      const want = mx * T.nx[i * step] + my * T.ny[i * step];
      let o = off[i] + 0.6 * (want - off[i]);
      if (o > lim) o = lim; else if (o < -lim) o = -lim;
      off[i] = o;
    }
  }
  // interpolation à 1 m
  const rl = new Float32Array(T.N);
  for (let i = 0; i < T.N; i++) {
    const f = i / step, i0 = Math.floor(f) % M, i1 = (i0 + 1) % M, t = f - Math.floor(f);
    rl[i] = off[i0] * (1 - t) + off[i1] * t;
  }
  T.rlOff = rl;
}

// ---------------------------------------------------------------------
//  Profil de vitesse idéal sur la trajectoire (passes avant/arrière)
// ---------------------------------------------------------------------
function computeSpeedProfile(T) {
  const N = T.N;
  const X = new Float32Array(N), Y = new Float32Array(N);
  for (let i = 0; i < N; i++) { X[i] = T.px[i] + T.nx[i] * T.rlOff[i]; Y[i] = T.py[i] + T.ny[i] * T.rlOff[i]; }
  const k = new Float32Array(N);
  const ds = new Float32Array(N);
  const h = 5;
  for (let i = 0; i < N; i++) {
    const a = (i - h + N) % N, b = (i + h) % N;
    const ax = X[a], ay = Y[a], bx = X[i], by = Y[i], cx = X[b], cy = Y[b];
    const ab = Math.hypot(bx - ax, by - ay), bc = Math.hypot(cx - bx, cy - by), ca = Math.hypot(ax - cx, ay - cy);
    const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    k[i] = (2 * cross) / Math.max(1e-6, ab * bc * ca);
    const n = (i + 1) % N;
    ds[i] = Math.hypot(X[n] - X[i], Y[n] - Y[i]);
  }
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const kk = k[i];
    if (kk <= PHYS.latAero + 1e-5) v[i] = PHYS.vmax;
    else v[i] = Math.min(PHYS.vmax, Math.sqrt(PHYS.latBase / (kk - PHYS.latAero)));
  }
  // passes répétées (boucle fermée)
  for (let rep = 0; rep < 3; rep++) {
    for (let j = 2 * N; j > 0; j--) {          // arrière : freinage
      const i = j % N, nI = (i + 1) % N;
      const lim = Math.sqrt(v[nI] * v[nI] + 2 * PHYS.brake * ds[i]);
      if (v[i] > lim) v[i] = lim;
    }
    for (let j = 0; j < 2 * N; j++) {          // avant : accélération
      const i = j % N, nI = (i + 1) % N;
      const a = engineAccel(v[i]) - PHYS.drag * v[i] * v[i];
      const lim = Math.sqrt(Math.max(0, v[i] * v[i] + 2 * a * ds[i]));
      if (v[nI] > lim) v[nI] = lim;
    }
  }
  let t = 0;
  for (let i = 0; i < N; i++) t += ds[i] / Math.max(1, v[i]);
  T.vProf = v;
  T.rlK = k;
  T.idealLap = t;
}

// ---------------------------------------------------------------------
//  Requêtes géométriques
// ---------------------------------------------------------------------
// Point le plus proche, recherche locale autour d'un indice connu.
export function nearestIndex(T, x, y, hint, range = 40) {
  let best = hint, bd = Infinity;
  const N = T.N;
  if (hint < 0) { // recherche globale
    for (let i = 0; i < N; i += 2) {
      const d = (T.px[i] - x) ** 2 + (T.py[i] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    hint = best; range = 4;
  }
  for (let o = -range; o <= range; o++) {
    const i = ((hint + o) % N + N) % N;
    const d = (T.px[i] - x) ** 2 + (T.py[i] - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Projection fine : renvoie {s (continu dans [0,L)), d (latéral, + gauche)}
export function project(T, x, y, idx) {
  const N = T.N;
  const i0 = idx, i1 = (idx + 1) % N, im = (idx - 1 + N) % N;
  // choisir le segment [i0,i1] ou [im,i0]
  let a = i0, b = i1;
  const dxp = x - T.px[i0], dyp = y - T.py[i0];
  if (dxp * T.tx[i0] + dyp * T.ty[i0] < 0) { a = im; b = i0; }
  const sx = T.px[b] - T.px[a], sy = T.py[b] - T.py[a];
  const l2 = sx * sx + sy * sy || 1;
  let t = ((x - T.px[a]) * sx + (y - T.py[a]) * sy) / l2;
  t = Math.max(0, Math.min(1, t));
  const qx = T.px[a] + sx * t, qy = T.py[a] + sy * t;
  const l = Math.sqrt(l2);
  const nX = -sy / l, nY = sx / l;
  const d = (x - qx) * nX + (y - qy) * nY;
  let s = a + t;
  if (s >= N) s -= N;
  return { s, d, hx: sx / l, hy: sy / l };
}

// Échantillonnage continu en s (interpolation linéaire)
export function sample(T, s) {
  const N = T.N;
  s = ((s % N) + N) % N;
  const i0 = Math.floor(s), i1 = (i0 + 1) % N, t = s - i0;
  return {
    x: T.px[i0] + (T.px[i1] - T.px[i0]) * t,
    y: T.py[i0] + (T.py[i1] - T.py[i0]) * t,
    tx: T.tx[i0] + (T.tx[i1] - T.tx[i0]) * t,
    ty: T.ty[i0] + (T.ty[i1] - T.ty[i0]) * t,
    nx: T.nx[i0] + (T.nx[i1] - T.nx[i0]) * t,
    ny: T.ny[i0] + (T.ny[i1] - T.ny[i0]) * t,
    rl: T.rlOff[i0] + (T.rlOff[i1] - T.rlOff[i0]) * t,
    v: T.vProf[i0] + (T.vProf[i1] - T.vProf[i0]) * t,
    k: T.curv[i0] + (T.curv[i1] - T.curv[i0]) * t,
  };
}

// Outil de conception : erreur de fermeture brute d'un tracé
export function designError(def) {
  const lens = def.segs.map(s => (s[0] === 'S' ? s[1] : 0));
  let sum = 0; for (const s of def.segs) if (s[0] === 'T') sum += s[1];
  const w = walk(def.segs, def.heading0, lens);
  return { ex: w.end[0], ey: w.end[1], sum };
}
