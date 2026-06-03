// audio.js — procedural sound via WebAudio. No asset files: ambient drones per
// era plus little blips for pickups, shifts and haunts. Starts muted until the
// first user gesture (browser autoplay policy).

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.droneGain = null;
    this.osc = [];
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);

    // ambient drone: two detuned oscillators through a slow lowpass.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    this.droneFilter = filter;
    this.droneGain.connect(filter);
    filter.connect(this.master);
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = 110;
      o.detune.value = i * 6;
      o.connect(this.droneGain);
      o.start();
      this.osc.push(o);
    }
  }

  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.14, this.ctx.currentTime, 1.5);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.6 : 0, this.ctx.currentTime, 0.1);
    }
    return this.enabled;
  }

  // Re-tune the drone to match an era's mood.
  setEra(eraIndex) {
    if (!this.ctx) return;
    // verdant, stone, sundering, ruin, hollow — descending into darkness,
    // with the Sundering a tense, slightly brighter (fire-lit) tone.
    const roots = [110, 98, 87.3, 82.4, 65.4]; // A2, G2, F2, E2, C2
    const cutoff = [800, 700, 600, 520, 360];
    const r = roots[eraIndex % roots.length];
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.osc.length; i++) {
      this.osc[i].frequency.setTargetAtTime(r * (i === 1 ? 1.5 : 1), t, 0.4);
    }
    this.droneFilter.frequency.setTargetAtTime(cutoff[eraIndex % cutoff.length], t, 0.6);
  }

  _blip(freq, dur, type = 'sine', gain = 0.25, slideTo = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  pickup() { this._blip(660, 0.18, 'sine', 0.18, 1320); }
  fragment() {
    this._blip(523.25, 0.5, 'triangle', 0.2, 1046.5);
    this._blip(784, 0.6, 'sine', 0.12);
  }
  shift() { this._blip(220, 0.6, 'sawtooth', 0.12, 880); }
  haunt() { this._blip(140, 0.4, 'sawtooth', 0.16, 60); }
  anchor() {
    this._blip(392, 0.8, 'sine', 0.2, 784);
    setTimeout(() => this._blip(587, 0.9, 'triangle', 0.16, 1174), 120);
  }
  win() {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => this._blip(f, 0.8, 'sine', 0.2), i * 180));
  }
  // Ominous low swell when a guardian wakes (or enrages).
  bossWake() {
    this._blip(70, 1.0, 'sawtooth', 0.22, 130);
    setTimeout(() => this._blip(98, 1.2, 'triangle', 0.18, 196), 90);
  }
  // Short dissonant thud when the ghost is struck.
  hurt() { this._blip(120, 0.22, 'square', 0.16, 50); }
  // Slow ascending swell for the ending cutscene.
  ending() {
    const notes = [261.6, 329.6, 392, 523.25, 659.3, 784, 1046.5];
    notes.forEach((f, i) =>
      setTimeout(() => this._blip(f, 1.6, 'sine', 0.15), i * 420));
    setTimeout(() => this._blip(523.25, 3.2, 'triangle', 0.1), 200);
  }
}
