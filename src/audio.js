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
    this.bossGain = null;
    // procedural boss-fight music: a small step sequencer scheduled against the
    // audio clock. `timer` is the lookahead interval; nodes are short-lived.
    this.bossMusic = { playing: false, timer: null, nextTime: 0, step: 0, eraIndex: 0, intensity: 0 };
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

    // boss music rides its own gain so the whole bed can fade/duck as one and
    // still inherits the master mute.
    this.bossGain = this.ctx.createGain();
    this.bossGain.gain.value = 0.0;
    this.bossGain.connect(this.master);

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
  // Heavier, lower strike for a charged haunt.
  heavy() {
    this._blip(180, 0.5, 'triangle', 0.22, 80);
    setTimeout(() => this._blip(90, 0.4, 'sawtooth', 0.16, 200), 30);
  }
  // Airy whoosh for a dash.
  dash() { this._blip(620, 0.28, 'sine', 0.12, 240); }
  // Slow ascending swell for the ending cutscene.
  ending() {
    const notes = [261.6, 329.6, 392, 523.25, 659.3, 784, 1046.5];
    notes.forEach((f, i) =>
      setTimeout(() => this._blip(f, 1.6, 'sine', 0.15), i * 420));
    setTimeout(() => this._blip(523.25, 3.2, 'triangle', 0.1), 200);
  }

  // ---- boss combat music (procedural step sequencer) ----------------------
  // A driving bass pulse + arpeggio + percussive tick, keyed to the era's root
  // (matching the drone tuning), scheduled against the audio clock so it never
  // drifts. Each step spawns short, self-stopping voices — nothing accumulates.
  _bossRoot(eraIndex) {
    const roots = [110, 98, 87.3, 82.4, 65.4]; // same as the era drone roots
    return roots[eraIndex % roots.length];
  }

  // One short voice routed through bossGain (auto-stops, like _blip).
  _bossVoice(freq, dur, type, gain, when) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(this.bossGain);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  startBossMusic(eraIndex) {
    this._ensure();
    if (!this.ctx) return;
    const bm = this.bossMusic;
    if (bm.playing && bm.eraIndex === eraIndex) return;
    if (bm.timer) { clearInterval(bm.timer); bm.timer = null; }
    bm.playing = true;
    bm.eraIndex = eraIndex;
    bm.step = 0;
    bm.intensity = 0;
    bm.nextTime = this.ctx.currentTime + 0.05;
    // duck the ambient drone under the fight, bring the music bed up
    this.droneGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.4);
    this.bossGain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.3);
    bm.timer = setInterval(() => this._bossScheduler(), 25);
  }

  // Escalate when the final guardian enrages: faster cadence + a louder bed.
  enrageBossMusic() {
    const bm = this.bossMusic;
    if (!bm.playing) return;
    bm.intensity = 1;
    if (this.ctx) this.bossGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.3);
  }

  stopBossMusic() {
    const bm = this.bossMusic;
    if (bm.timer) { clearInterval(bm.timer); bm.timer = null; }
    bm.playing = false;
    bm.suspended = false;
    if (!this.ctx) return;
    this.bossGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.4);
    this.droneGain.gain.setTargetAtTime(0.14, this.ctx.currentTime, 0.8); // restore ambience
  }

  // Pause/unpause the bed WITHOUT losing the fight's state (era, enrage
  // intensity). Used by the pause menu and the boon picker so the driving
  // combat track doesn't keep playing under a frozen game.
  suspendBossMusic() {
    const bm = this.bossMusic;
    if (!bm.playing || bm.suspended) return;
    bm.suspended = true;
    if (bm.timer) { clearInterval(bm.timer); bm.timer = null; }
    if (this.ctx) this.bossGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.15);
  }

  resumeBossMusic() {
    const bm = this.bossMusic;
    if (!bm.playing || !bm.suspended) return;
    bm.suspended = false;
    if (!this.ctx) return;
    // pick the cadence up from now (the scheduler resyncs rather than catching up)
    bm.nextTime = this.ctx.currentTime + 0.05;
    this.bossGain.gain.setTargetAtTime(bm.intensity ? 0.16 : 0.12, this.ctx.currentTime, 0.2);
    bm.timer = setInterval(() => this._bossScheduler(), 25);
  }

  // Lookahead: queue any steps that fall within the next ~120ms.
  _bossScheduler() {
    const bm = this.bossMusic;
    if (!bm.playing || !this.ctx) return;
    // if a throttled/background tab let us fall far behind, resync rather than
    // dumping a burst of catch-up notes
    if (this.ctx.currentTime - bm.nextTime > 0.5) bm.nextTime = this.ctx.currentTime + 0.05;
    const root = this._bossRoot(bm.eraIndex);
    const stepDur = bm.intensity ? 0.135 : 0.16; // 16th-note step, faster enraged
    while (bm.nextTime < this.ctx.currentTime + 0.12) {
      if (this.enabled) {
        const s = bm.step % 16;
        const when = bm.nextTime;
        // bass pulse on the quarter beats
        if (s % 4 === 0) this._bossVoice(root * 0.5, stepDur * 3.2, 'sawtooth', 0.22, when);
        // arpeggio across the 8ths: root / minor third / fifth / octave
        if (s % 2 === 0) {
          const arp = [1, 1.2, 1.5, 2][(s / 2) % 4];
          this._bossVoice(root * arp, stepDur * 1.6, 'triangle', 0.10, when);
        }
        // driving tick every step, hotter offbeats when enraged
        const tickGain = (s % 2 === 1 ? 0.05 : 0.03) * (bm.intensity ? 1.6 : 1);
        this._bossVoice(root * 4, 0.03, 'square', tickGain, when);
      }
      bm.nextTime += stepDur;
      bm.step++;
    }
  }
}
