// By The_headphones
// Fully procedural audio (Web Audio API): engines, boost, impacts, crowd and music.
// No audio files are shipped, so there is nothing to license or download.

const A4 = 440;
const note = (n) => A4 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.vol = { master: 0.8, music: 0.45, sfx: 0.85 };
    this.musicDuck = 1;
    this.voices = new Map();
    this.lastHit = 0;
  }

  /** Must be called from a user gesture (click / key press). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildCrowd();
    this.music = new Music(c, this.musicBus, this.noise);
    this.ready = true;
    this.applyVolumes();
  }

  setVolumes(master, music, sfx) {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55 * this.musicDuck, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  setMusicDuck(v) {
    this.musicDuck = v;
    this.applyVolumes();
  }

  startMusic() { if (this.ready) this.music.start(); }
  stopMusic() { if (this.ready) this.music.stop(); }

  // ------------------------------------------------------------ helpers

  noiseSource(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (!loop) s.playbackRate.value = 0.9 + Math.random() * 0.2;
    return s;
  }

  env(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  out(pan = 0) {
    if (!pan || !this.ctx.createStereoPanner) return this.sfxBus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    return p;
  }

  tone(type, f0, f1, dur, peak, dest, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, peak, 0.005, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(filterType, freq, q, dur, peak, dest, delay = 0, sweepTo = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = this.noiseSource();
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, peak, 0.004, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ car voices

  ensureVoice(id) {
    if (!this.ready) return null;
    let v = this.voices.get(id);
    if (v) return v;
    const c = this.ctx;
    v = {};
    v.osc1 = c.createOscillator(); v.osc1.type = 'sawtooth';
    v.osc2 = c.createOscillator(); v.osc2.type = 'square';
    v.filter = c.createBiquadFilter(); v.filter.type = 'lowpass'; v.filter.Q.value = 3;
    v.gain = c.createGain(); v.gain.gain.value = 0;
    v.pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    v.osc1.connect(v.filter); v.osc2.connect(v.filter);
    v.filter.connect(v.gain).connect(v.pan).connect(this.sfxBus);
    v.boostSrc = this.noiseSource(true);
    v.boostFilter = c.createBiquadFilter(); v.boostFilter.type = 'bandpass'; v.boostFilter.frequency.value = 900; v.boostFilter.Q.value = 0.7;
    v.boostGain = c.createGain(); v.boostGain.gain.value = 0;
    v.boostSrc.connect(v.boostFilter).connect(v.boostGain).connect(v.pan);
    v.rumble = c.createOscillator(); v.rumble.type = 'sine'; v.rumble.frequency.value = 55;
    v.rumble.connect(v.boostGain);
    const t = c.currentTime;
    v.osc1.start(t); v.osc2.start(t); v.boostSrc.start(t); v.rumble.start(t);
    this.voices.set(id, v);
    return v;
  }

  updateVoice(id, { speed, throttle, boosting, supersonic, distance, pan, player, muted }) {
    const v = this.ensureVoice(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    const atten = player ? 1 : 1 / (1 + distance / 9);
    const s = Math.min(1, speed / 23);
    const f = 46 + s * 150 + Math.abs(throttle) * 14;
    v.osc1.frequency.setTargetAtTime(f, t, 0.06);
    v.osc2.frequency.setTargetAtTime(f * 0.5 * 1.006, t, 0.06);
    v.filter.frequency.setTargetAtTime(260 + s * 1500 + Math.abs(throttle) * 500, t, 0.08);
    const level = muted ? 0 : (0.018 + Math.abs(throttle) * 0.028 + s * 0.022) * atten * (player ? 1 : 0.7);
    v.gain.gain.setTargetAtTime(level, t, 0.08);
    const bLevel = muted || !boosting ? 0 : (supersonic ? 0.2 : 0.15) * atten;
    v.boostGain.gain.setTargetAtTime(bLevel, t, boosting ? 0.03 : 0.12);
    v.boostFilter.frequency.setTargetAtTime(700 + s * 900, t, 0.1);
    if (v.pan.pan) v.pan.pan.setTargetAtTime(player ? 0 : Math.max(-0.9, Math.min(0.9, pan)), t, 0.05);
  }

  releaseVoices() {
    for (const v of this.voices.values()) {
      for (const n of [v.osc1, v.osc2, v.boostSrc, v.rumble]) { try { n.stop(); } catch { /* already stopped */ } }
      v.pan.disconnect();
    }
    this.voices.clear();
  }

  // ------------------------------------------------------------ one-shots

  hit(strength, pan = 0, distance = 0) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHit < 0.04) return;
    this.lastHit = now;
    const k = Math.min(1, strength / 30) / (1 + distance / 25);
    const out = this.out(pan);
    this.tone('sine', 190, 52, 0.22, 0.55 * k + 0.05, out);
    this.burst('bandpass', 1100, 0.8, 0.09, 0.4 * k + 0.04, out);
    if (strength > 18) this.tone('triangle', 620, 380, 0.18, 0.12 * k, out);
  }

  bounce(strength, pan = 0, distance = 0) {
    if (!this.ready) return;
    const k = Math.min(1, strength / 25) / (1 + distance / 20);
    if (k < 0.04) return;
    const out = this.out(pan);
    this.tone('sine', 120, 48, 0.2, 0.35 * k, out);
    this.burst('lowpass', 700, 0.5, 0.08, 0.2 * k, out);
  }

  jump(double) {
    if (!this.ready) return;
    this.burst('highpass', 1800, 0.6, 0.12, 0.08, this.sfxBus, 0, 4000);
    this.tone('sine', double ? 380 : 260, double ? 700 : 480, 0.1, 0.06, this.sfxBus);
  }

  dodge() {
    if (!this.ready) return;
    this.burst('bandpass', 500, 1.2, 0.32, 0.16, this.sfxBus, 0, 2600);
  }

  land(strength = 1) {
    if (!this.ready) return;
    this.tone('sine', 95, 45, 0.12, 0.12 * strength, this.sfxBus);
  }

  pickup(big) {
    if (!this.ready) return;
    if (big) {
      [0, 0.06, 0.12].forEach((d, i) => this.tone('triangle', [660, 880, 1320][i], [660, 880, 1320][i], 0.14, 0.07, this.sfxBus, d));
    } else {
      this.tone('triangle', 1250, 1500, 0.07, 0.05, this.sfxBus);
    }
  }

  bump(strength, pan = 0) {
    if (!this.ready) return;
    const k = Math.min(1, strength / 20);
    this.tone('square', 90, 40, 0.15, 0.12 * k, this.out(pan));
    this.burst('lowpass', 900, 0.7, 0.12, 0.25 * k, this.out(pan));
  }

  explosion(scale = 1, pan = 0) {
    if (!this.ready) return;
    const out = this.out(pan);
    this.burst('lowpass', 3600, 0.4, 1.4 * scale, 0.75 * scale, out, 0, 140);
    this.tone('sine', 95, 30, 0.9 * scale, 0.7 * scale, out);
    this.burst('bandpass', 260, 0.6, 0.6 * scale, 0.35 * scale, out, 0.02, 90);
  }

  goal(forPlayerTeam) {
    if (!this.ready) return;
    this.explosion(1.2);
    const c = this.ctx, t = c.currentTime + 0.15;
    const chord = forPlayerTeam ? [57, 61, 64, 69] : [57, 60, 64, 67];
    for (const n of chord) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = note(n);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(600, t);
      f.frequency.linearRampToValueAtTime(2400, t + 0.3);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.05);
      g.gain.setValueAtTime(0.05, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(f).connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + 1.7);
    }
    this.cheer(1);
  }

  demolish(pan = 0) {
    if (!this.ready) return;
    this.explosion(0.7, pan);
    this.burst('highpass', 2500, 0.5, 0.25, 0.25, this.out(pan));
  }

  countdown() {
    if (!this.ready) return;
    this.tone('square', 440, 440, 0.16, 0.07, this.sfxBus);
  }

  go() {
    if (!this.ready) return;
    this.tone('square', 880, 880, 0.42, 0.08, this.sfxBus);
    this.tone('square', 1320, 1320, 0.42, 0.03, this.sfxBus);
  }

  buzzer() {
    if (!this.ready) return;
    this.tone('sawtooth', 160, 150, 1.1, 0.12, this.sfxBus);
    this.tone('square', 240, 230, 1.1, 0.05, this.sfxBus);
  }

  menuMove() {
    if (!this.ready) return;
    this.tone('triangle', 1400, 1400, 0.035, 0.035, this.sfxBus);
  }

  menuSelect() {
    if (!this.ready) return;
    this.tone('triangle', 700, 700, 0.06, 0.06, this.sfxBus);
    this.tone('triangle', 1050, 1050, 0.09, 0.05, this.sfxBus, 0.05);
  }

  menuBack() {
    if (!this.ready) return;
    this.tone('triangle', 900, 600, 0.08, 0.05, this.sfxBus);
  }

  success() {
    if (!this.ready) return;
    [0, 0.08, 0.16].forEach((d, i) => this.tone('triangle', note([72, 76, 79][i]), note([72, 76, 79][i]), 0.25, 0.07, this.sfxBus, d));
  }

  fail() {
    if (!this.ready) return;
    this.tone('triangle', note(64), note(60), 0.35, 0.07, this.sfxBus);
  }

  // ------------------------------------------------------------ crowd

  buildCrowd() {
    const c = this.ctx;
    const src = this.noiseSource(true);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 650; f1.Q.value = 0.35;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2400;
    this.crowdGain = c.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(f1).connect(f2).connect(this.crowdGain).connect(this.sfxBus);
    src.start();
    this.crowdLevel = 0;
    this.crowdTarget = 0;
    this.cheerAmt = 0;
  }

  setCrowd(level) {
    this.crowdTarget = level;
  }

  cheer(amount) {
    this.cheerAmt = Math.min(1.2, this.cheerAmt + amount);
  }

  update(dt) {
    if (!this.ready) return;
    this.cheerAmt = Math.max(0, this.cheerAmt - dt * 0.28);
    const lvl = this.crowdTarget * 0.05 + this.cheerAmt * 0.22;
    this.crowdGain.gain.setTargetAtTime(lvl, this.ctx.currentTime, 0.25);
  }
}

// ---------------------------------------------------------------------------
// Small step-sequenced synth track: A minor, i - VI - III - VII, ~112 BPM.

const PROG = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];

class Music {
  constructor(ctx, out, noise) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.tempo = 112;
    this.step = 0;
    this.timer = null;
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / this.tempo) * 0.75;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.32;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.delay.connect(this.fb).connect(this.delay);
    this.delay.connect(this.wet).connect(out);
  }

  start() {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const sixteenth = 60 / this.tempo / 4;
    while (this.next < this.ctx.currentTime + 0.15) {
      this.play(this.step, this.next, sixteenth);
      this.next += sixteenth;
      this.step++;
    }
  }

  voice(type, freq, t, dur, peak, dest = this.out, cutoff = 0) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f).connect(g);
    } else {
      o.connect(g);
    }
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return g;
  }

  hat(t, peak, dur) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  play(step, t, sixteenth) {
    const bar = Math.floor(step / 16) % PROG.length;
    const phrase = Math.floor(step / 64) % 4;
    const s = step % 16;
    const ch = PROG[bar];
    // Kick on the beat
    if (s % 4 === 0) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      const g = c.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.32);
    }
    // Clap on 2 and 4
    if (s === 4 || s === 12) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      src.connect(f).connect(g).connect(this.out);
      src.start(t, Math.random());
      src.stop(t + 0.2);
    }
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.06 : 0.03, 0.05);
    // Bass: syncopated root/octave
    if ([0, 3, 6, 8, 10, 14].includes(s)) {
      const n = s === 6 || s === 14 ? ch.root + 12 : ch.root;
      this.voice('sawtooth', note(n), t, sixteenth * 1.8, 0.11, this.out, 520);
    }
    // Pad at bar start
    if (s === 0) {
      for (const n of ch.tones) {
        for (const det of [-0.12, 0.12]) {
          this.voice('sawtooth', note(n) * Math.pow(2, det / 12), t, sixteenth * 16, 0.022, this.out, 1300);
        }
      }
    }
    // Arpeggio (enters after the first phrase)
    if (phrase > 0 || step > 32) {
      const n = ch.tones[ARP[s % 8]] + 12 + (s >= 8 && phrase % 2 ? 12 : 0);
      const g = this.voice('square', note(n), t, sixteenth * 0.9, 0.028, this.out, 2600);
      g.connect(this.delay);
    }
  }
}
