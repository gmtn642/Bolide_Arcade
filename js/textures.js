// =====================================================================
//  Textures procédurales (aucun fichier image externe)
// =====================================================================
import * as THREE from 'three';

let maxAniso = 4;
export function setMaxAniso(a) { maxAniso = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeatX = 1, repeatY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// petit générateur pseudo-aléatoire déterministe
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function noiseFill(g, w, h, base, amp, count, sizeMax, r) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = (r() - 0.5) * amp;
    const sz = 0.5 + r() * sizeMax;
    const l = Math.max(0, Math.min(255, 128 + v));
    g.fillStyle = `rgba(${l},${l},${l},${0.08 + r() * 0.12})`;
    g.fillRect(r() * w, r() * h, sz, sz);
  }
}

// Asphalte : grain + légères traînées longitudinales
export function asphaltTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(7);
  g.fillStyle = '#4a4b4e'; g.fillRect(0, 0, 512, 512);
  const id = g.getImageData(0, 0, 512, 512); const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 34 + (r() < 0.04 ? 30 : 0) - (r() < 0.05 ? 22 : 0);
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n + 1));
  }
  g.putImageData(id, 0, 0);
  // traînées de gomme (trajectoire) au centre
  for (let i = 0; i < 70; i++) {
    const x = 160 + r() * 190, w = 2 + r() * 10;
    g.fillStyle = `rgba(20,20,22,${0.03 + r() * 0.05})`;
    g.fillRect(x, 0, w, 512);
  }
  // fissures / réparations
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = 'rgba(25,25,25,0.25)'; g.lineWidth = 1 + r();
    g.beginPath(); let x = r() * 512, y = r() * 512; g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += r() * 30; g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c);
}

export function kerbTexture() {
  const [c, g] = canvas(64, 256);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#f2f2f2' : '#d4141c';
    g.fillRect(0, i * 64, 64, 64);
  }
  // usure
  const r = rng(3);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * 64, r() * 256, 2, 2); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 6, 256);
  return tex(c);
}

export function grassTexture(stripes = true, hue = 0) {
  const [c, g] = canvas(512, 512);
  const r = rng(11);
  const base = hue ? '#5b7d36' : '#4f7a2f';
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  if (stripes) {
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(0, i * 128, 512, 128); }
  }
  const id = g.getImageData(0, 0, 512, 512); const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 30;
    d[i] = Math.max(0, d[i] + n * 0.7); d[i + 1] = Math.max(0, d[i + 1] + n); d[i + 2] = Math.max(0, d[i + 2] + n * 0.5);
  }
  g.putImageData(id, 0, 0);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(30,50,15,0.25)' : 'rgba(140,170,80,0.18)';
    g.fillRect(r() * 512, r() * 512, 1, 2 + r() * 3);
  }
  return tex(c);
}

export function pavementTexture() {
  const [c, g] = canvas(256, 256);
  const r = rng(5);
  noiseFill(g, 256, 256, '#8d8b86', 70, 5000, 2, r);
  g.strokeStyle = 'rgba(60,60,60,0.35)'; g.lineWidth = 1;
  for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  return tex(c);
}

export function concreteTexture(tint = '#b9b6ae') {
  const [c, g] = canvas(256, 64);
  noiseFill(g, 256, 64, tint, 60, 2500, 2, rng(9));
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 58, 256, 6);
  return tex(c);
}

// Rail de sécurité (glissière) : deux lisses métalliques + poteaux
export function armcoTexture() {
  const [c, g] = canvas(256, 64);
  g.clearRect(0, 0, 256, 64);
  // poteaux
  g.fillStyle = '#5d6166';
  for (let x = 10; x < 256; x += 128) g.fillRect(x, 8, 8, 56);
  const rail = (y) => {
    const gr = g.createLinearGradient(0, y, 0, y + 18);
    gr.addColorStop(0, '#e9ecef'); gr.addColorStop(0.45, '#9aa1a8'); gr.addColorStop(0.55, '#c8ccd0'); gr.addColorStop(1, '#6d737a');
    g.fillStyle = gr; g.fillRect(0, y, 256, 18);
  };
  rail(6); rail(30);
  return tex(c);
}

// Panneaux publicitaires neutres (pas de marques réelles)
export function boardTexture(colors, label) {
  const [c, g] = canvas(1024, 64);
  const n = 4;
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length][0]; g.fillRect(i * 256, 0, 256, 64);
    g.fillStyle = colors[i % colors.length][1];
    g.font = 'bold 34px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label[i % label.length], i * 256 + 128, 34);
  }
  return tex(c);
}

export function fenceTexture() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(200,205,210,0.9)'; g.lineWidth = 1.2;
  for (let i = -64; i < 128; i += 8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
  }
  g.fillStyle = 'rgba(90,95,100,1)'; g.fillRect(0, 0, 64, 3);
  const t = tex(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function checkerTexture(n = 8) {
  const [c, g] = canvas(256, 256);
  const s = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'; g.fillRect(i * s, j * s, s, s);
  }
  const t = tex(c); t.magFilter = THREE.NearestFilter;
  return t;
}

// Façades d'immeubles méditerranéens
export function facadeTexture(seed, wall, shutter) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  noiseFill(g, 256, 256, wall, 40, 3000, 2, r);
  // 4 colonnes x 4 étages de fenêtres par tuile (tuile = 12 m x 12 m)
  for (let fy = 0; fy < 4; fy++) {
    for (let fx = 0; fx < 4; fx++) {
      const x = fx * 64 + 16, y = fy * 64 + 12;
      const lit = r();
      // vitre avec reflet de ciel
      const gr = g.createLinearGradient(x, y, x + 30, y + 38);
      gr.addColorStop(0, lit < 0.15 ? '#e8d9a8' : '#6f8fb0'); gr.addColorStop(1, '#22303f');
      g.fillStyle = gr; g.fillRect(x, y, 32, 38);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.strokeRect(x, y, 32, 38);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 15, y, 2, 38);
      if (shutter && r() < 0.5) { g.fillStyle = shutter; g.fillRect(x - 9, y, 8, 38); g.fillRect(x + 33, y, 8, 38); }
      // balcon
      if (fy % 2 === 0 && r() < 0.7) { g.fillStyle = 'rgba(40,40,40,0.75)'; g.fillRect(x - 6, y + 38, 44, 4); for (let k = 0; k < 9; k++) g.fillRect(x - 6 + k * 5.5, y + 30, 1, 8); }
    }
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, fy * 64 + 60, 256, 4);
  }
  return tex(c);
}

export function glassTowerTexture(seed) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 32) {
    const v = 120 + r() * 60;
    g.fillStyle = `rgb(${v * 0.55},${v * 0.75},${v})`; g.fillRect(x, y, 32, 16);
  }
  g.strokeStyle = 'rgba(230,235,240,0.7)'; g.lineWidth = 2;
  for (let y = 0; y <= 256; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  return tex(c);
}

// Tribunes : sièges colorés (statiques)
export function standTexture() {
  const [c, g] = canvas(256, 128);
  const r = rng(21);
  g.fillStyle = '#2a2d33'; g.fillRect(0, 0, 256, 128);
  const pal = ['#d33', '#36c', '#eee', '#fc3', '#3a5', '#222', '#e83', '#c3c'];
  for (let y = 0; y < 128; y += 8) {
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y + 6, 256, 2);
    for (let x = 0; x < 256; x += 4) {
      if (r() < 0.75) { g.fillStyle = pal[Math.floor(r() * pal.length)]; g.fillRect(x, y + 1, 3, 4); }
    }
  }
  return tex(c);
}

export function garageTexture() {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#e8e9eb'; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 4; i++) {
    const x = i * 128 + 14;
    g.fillStyle = '#2b2f36'; g.fillRect(x, 34, 100, 94);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = 0; k < 9; k++) g.fillRect(x, 38 + k * 10, 100, 2);
  }
  g.fillStyle = '#1c3d7a'; g.fillRect(0, 0, 512, 20);
  g.fillStyle = '#fff'; g.font = 'bold 14px Arial'; g.fillText('PIT', 8, 15); g.fillText('PIT', 264, 15);
  return tex(c);
}

export function waterNormalTexture() {
  const [c, g] = canvas(256, 256);
  const id = g.createImageData(256, 256); const d = id.data;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const a = Math.sin(x * 0.11 + Math.sin(y * 0.05) * 2) + Math.sin((x + y) * 0.07) * 0.6 + Math.sin(y * 0.19 - x * 0.03) * 0.4;
    const b = Math.cos(y * 0.09 + Math.sin(x * 0.06) * 2) + Math.cos((x - y) * 0.05) * 0.6;
    const i = (y * 256 + x) * 4;
    d[i] = 128 + a * 22; d[i + 1] = 128 + b * 22; d[i + 2] = 255; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return tex(c, 1, 1, false);
}

export function treeBarkColor() { return new THREE.Color(0x4a3726); }

// Panneau de distance (150 / 100 / 50)
export function distanceBoardTexture(n) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.fillStyle = '#111'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 68);
  return tex(c, 1, 1);
}

// Numéro de course (dérive aileron)
export function numberTexture(num, fg, bg) {
  const [c, g] = canvas(128, 64);
  g.fillStyle = bg; g.fillRect(0, 0, 128, 64);
  g.fillStyle = fg; g.font = 'bold 46px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  return t;
}
