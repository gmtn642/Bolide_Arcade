// =====================================================================
//  Sons synthétisés (Web Audio) : moteur, adversaires, crissements,
//  chocs, vibreurs, bips de départ. Aucun fichier audio.
// =====================================================================
export class Sound {
  constructor() { this.ctx = null; this.enabled = true; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.9 : 0; this.master.connect(ctx.destination);
    // --- moteur du joueur
    const shaper = ctx.createWaveShaper(); shaper.curve = this._curve(2.2);
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 1200; this.engFilter.Q.value = 2.5;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const g3 = ctx.createGain(); g3.gain.value = 0.18;
    this.o1.connect(g1); this.o2.connect(g2); this.o3.connect(g3);
    g1.connect(shaper); g2.connect(shaper); g3.connect(shaper);
    shaper.connect(this.engFilter); this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.o1.start(); this.o2.start(); this.o3.start();
    // --- adversaire le plus proche (stéréo)
    this.opOsc = ctx.createOscillator(); this.opOsc.type = 'sawtooth';
    this.opFilter = ctx.createBiquadFilter(); this.opFilter.type = 'lowpass'; this.opFilter.frequency.value = 900;
    this.opGain = ctx.createGain(); this.opGain.gain.value = 0;
    this.opPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.opOsc.connect(this.opFilter); this.opFilter.connect(this.opGain);
    if (this.opPan) { this.opGain.connect(this.opPan); this.opPan.connect(this.master); } else this.opGain.connect(this.master);
    this.opOsc.start();
    // --- bruit (crissements / vibreurs / chocs)
    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const nz = ctx.createBufferSource(); nz.buffer = buf; nz.loop = true;
    this.sqFilter = ctx.createBiquadFilter(); this.sqFilter.type = 'bandpass'; this.sqFilter.frequency.value = 2400; this.sqFilter.Q.value = 6;
    this.sqGain = ctx.createGain(); this.sqGain.gain.value = 0;
    nz.connect(this.sqFilter); this.sqFilter.connect(this.sqGain); this.sqGain.connect(this.master);
    const nz2 = ctx.createBufferSource(); nz2.buffer = buf; nz2.loop = true;
    this.rbFilter = ctx.createBiquadFilter(); this.rbFilter.type = 'lowpass'; this.rbFilter.frequency.value = 180;
    this.rbGain = ctx.createGain(); this.rbGain.gain.value = 0;
    nz2.connect(this.rbFilter); this.rbFilter.connect(this.rbGain); this.rbGain.connect(this.master);
    // vent
    const nz3 = ctx.createBufferSource(); nz3.buffer = buf; nz3.loop = true;
    this.wFilter = ctx.createBiquadFilter(); this.wFilter.type = 'lowpass'; this.wFilter.frequency.value = 500;
    this.wGain = ctx.createGain(); this.wGain.gain.value = 0;
    nz3.connect(this.wFilter); this.wFilter.connect(this.wGain); this.wGain.connect(this.master);
    nz.start(); nz2.start(); nz3.start();
  }

  _curve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  // rpm : 0..1 (régime), thr : 0..1, on : moteur actif
  engine(rpm, thr, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 70 + rpm * 330; // fréquence d'allumage simplifiée
    this.o1.frequency.setTargetAtTime(f, t, 0.02);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    this.o3.frequency.setTargetAtTime(f * 1.505, t, 0.02);
    this.engFilter.frequency.setTargetAtTime(500 + thr * 2600 + rpm * 1200, t, 0.03);
    this.engGain.gain.setTargetAtTime(on ? 0.05 + thr * 0.09 + rpm * 0.03 : 0, t, 0.05);
  }

  opponent(dist, speed, pan) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = dist < 80 ? 0.10 / (1 + dist / 8) : 0;
    this.opGain.gain.setTargetAtTime(g, t, 0.08);
    this.opOsc.frequency.setTargetAtTime(80 + speed * 3.6, t, 0.05);
    if (this.opPan) this.opPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
  }

  surfaces(squeal, rumble, wind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sqGain.gain.setTargetAtTime(squeal * 0.07, t, 0.05);
    this.rbGain.gain.setTargetAtTime(rumble * 0.35, t, 0.03);
    this.wGain.gain.setTargetAtTime(wind * 0.04, t, 0.1);
    this.wFilter.frequency.setTargetAtTime(300 + wind * 900, t, 0.1);
  }

  crash(strength) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(0.6, 0.15 + strength * 0.5), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.4);
  }

  beep(freq, dur = 0.18, vol = 0.18) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  silence() {
    if (!this.ctx) return;
    this.engine(0, 0, false); this.opponent(999, 0, 0); this.surfaces(0, 0, 0);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
