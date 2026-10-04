// Squall: synthesized sound effects and ambience (Web Audio, no audio files). By The_headphones
(function (SQ) {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let stormGain = null;
  let windGain = null;
  let voices = 0;
  const listener = { x: 0, y: 0, z: 0, yaw: 0 };
  const MAX_VOICES = 48;
  const HEARING = 150;

  function init() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = SQ.Settings.get("volume");
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    stormGain = loop(320, "lowpass", 0.8);
    windGain = loop(900, "bandpass", 0.6);
  }

  function loop(freq, type, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    return gain;
  }

  // Returns a destination node with distance attenuation and stereo pan, or null if inaudible.
  function output(pos, volume) {
    if (!ctx || voices >= MAX_VOICES) return null;
    let gainValue = volume;
    let panValue = 0;
    if (pos) {
      const dx = pos.x - listener.x;
      const dz = pos.z - listener.z;
      const dist = Math.hypot(dx, dz, pos.y - listener.y);
      if (dist > HEARING) return null;
      gainValue *= 1 / (1 + dist * 0.07);
      // Camera yaw 0 faces -z; its right vector is (cos yaw, -sin yaw).
      const right = (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / Math.max(dist, 0.001);
      panValue = SQ.U.clamp(right, -1, 1) * Math.min(1, dist / 4);
    }
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = panValue;
      gain.connect(pan).connect(master);
    } else {
      gain.connect(master);
    }
    voices += 1;
    setTimeout(() => {
      voices -= 1;
      gain.disconnect();
    }, 1600);
    return gain;
  }

  function noise(dest, { dur = 0.1, type = "bandpass", freq = 1200, freqEnd = 0, q = 0.8, gain = 0.5, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  function tone(dest, { freq = 440, freqEnd = 0, type = "sine", dur = 0.1, gain = 0.3, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  const SHOTS = {
    ar: (d) => {
      noise(d, { dur: 0.13, freq: 1500, q: 0.7, gain: 0.55 });
      tone(d, { freq: 130, freqEnd: 55, type: "triangle", dur: 0.12, gain: 0.4 });
    },
    smg: (d) => {
      noise(d, { dur: 0.07, freq: 2100, q: 0.9, gain: 0.38 });
      tone(d, { freq: 170, freqEnd: 80, type: "triangle", dur: 0.06, gain: 0.25 });
    },
    pistol: (d) => {
      noise(d, { dur: 0.1, freq: 1800, q: 1, gain: 0.45 });
      tone(d, { freq: 150, freqEnd: 70, type: "square", dur: 0.07, gain: 0.18 });
    },
    shotgun: (d) => {
      noise(d, { dur: 0.32, type: "lowpass", freq: 1500, freqEnd: 300, gain: 0.85 });
      tone(d, { freq: 85, freqEnd: 38, type: "triangle", dur: 0.25, gain: 0.6 });
    },
    sniper: (d) => {
      noise(d, { dur: 0.5, type: "lowpass", freq: 2600, freqEnd: 250, gain: 0.95 });
      tone(d, { freq: 75, freqEnd: 32, type: "triangle", dur: 0.45, gain: 0.7 });
      noise(d, { dur: 0.6, type: "lowpass", freq: 500, gain: 0.25, delay: 0.18 });
    },
  };

  function play(pos, volume, fn) {
    if (!ctx) return;
    const dest = output(pos, volume);
    if (dest) fn(dest);
  }

  SQ.Audio = {
    init,
    setListener(x, y, z, yaw) {
      listener.x = x;
      listener.y = y;
      listener.z = z;
      listener.yaw = yaw;
    },
    setVolume(v) {
      if (master) master.gain.value = v;
    },
    setStorm(level) {
      if (stormGain) stormGain.gain.setTargetAtTime(level * 0.55, ctx.currentTime, 0.4);
    },
    setWind(level) {
      if (windGain) windGain.gain.setTargetAtTime(level * 0.35, ctx.currentTime, 0.2);
    },
    shot(type, pos, own) {
      play(own ? null : pos, own ? 0.55 : 0.9, SHOTS[type] || SHOTS.ar);
    },
    empty() {
      play(null, 0.4, (d) => tone(d, { freq: 1300, type: "square", dur: 0.03, gain: 0.15 }));
    },
    reload(phase) {
      play(null, 0.5, (d) => {
        tone(d, { freq: phase === "end" ? 1100 : 700, type: "square", dur: 0.035, gain: 0.18 });
        noise(d, { dur: 0.05, freq: 3000, gain: 0.25, delay: 0.04 });
      });
    },
    swing() {
      play(null, 0.4, (d) => noise(d, { dur: 0.14, freq: 700, freqEnd: 1600, q: 1.5, gain: 0.3 }));
    },
    harvest(surface, pos) {
      play(pos, 0.7, (d) => {
        const metal = surface === "metal";
        tone(d, { freq: metal ? 520 : surface === "stone" ? 260 : 170, freqEnd: metal ? 400 : 110, type: metal ? "square" : "triangle", dur: 0.12, gain: 0.35 });
        noise(d, { dur: 0.08, type: "lowpass", freq: metal ? 4000 : 1400, gain: 0.35 });
      });
    },
    footstep(surface, pos, own) {
      play(own ? null : pos, own ? 0.22 : 0.5, (d) => {
        if (surface === "wood") tone(d, { freq: 210, freqEnd: 150, type: "triangle", dur: 0.06, gain: 0.25 });
        if (surface === "metal") tone(d, { freq: 620, freqEnd: 480, type: "square", dur: 0.04, gain: 0.08 });
        noise(d, { dur: 0.06, type: "lowpass", freq: surface === "grass" ? 650 : 1300, gain: 0.5 });
      });
    },
    land(pos, own) {
      play(own ? null : pos, 0.6, (d) => noise(d, { dur: 0.16, type: "lowpass", freq: 500, gain: 0.6 }));
    },
    hitmarker(headshot) {
      play(null, 0.5, (d) => {
        tone(d, { freq: headshot ? 2300 : 1700, type: "triangle", dur: 0.05, gain: 0.35 });
        if (headshot) tone(d, { freq: 3400, type: "sine", dur: 0.12, gain: 0.25, delay: 0.03 });
      });
    },
    hurt(shield) {
      play(null, 0.6, (d) => {
        if (shield) noise(d, { dur: 0.12, type: "highpass", freq: 2500, gain: 0.3 });
        else tone(d, { freq: 190, freqEnd: 70, type: "triangle", dur: 0.14, gain: 0.45 });
      });
    },
    shieldBreak() {
      play(null, 0.6, (d) => {
        noise(d, { dur: 0.3, type: "highpass", freq: 3500, gain: 0.5 });
        tone(d, { freq: 1800, freqEnd: 600, type: "sine", dur: 0.25, gain: 0.2 });
      });
    },
    build(pos, own) {
      play(own ? null : pos, 0.6, (d) => {
        tone(d, { freq: 150, freqEnd: 95, type: "triangle", dur: 0.12, gain: 0.45 });
        noise(d, { dur: 0.1, type: "lowpass", freq: 1000, gain: 0.35 });
      });
    },
    buildBreak(pos) {
      play(pos, 0.8, (d) => {
        noise(d, { dur: 0.4, type: "lowpass", freq: 900, freqEnd: 200, gain: 0.7 });
        noise(d, { dur: 0.15, freq: 2200, gain: 0.25, delay: 0.05 });
      });
    },
    explosion(pos) {
      play(pos, 1.3, (d) => {
        noise(d, { dur: 1.0, type: "lowpass", freq: 900, freqEnd: 90, gain: 1 });
        tone(d, { freq: 70, freqEnd: 28, type: "triangle", dur: 0.8, gain: 0.8 });
      });
    },
    pickup(rarity) {
      play(null, 0.45, (d) => {
        const base = 520 + rarity * 70;
        tone(d, { freq: base, type: "triangle", dur: 0.08, gain: 0.3 });
        tone(d, { freq: base * 1.5, type: "triangle", dur: 0.12, gain: 0.25, delay: 0.06 });
      });
    },
    chest(pos) {
      play(pos, 0.7, (d) => {
        [660, 880, 1100, 1320].forEach((f, i) => tone(d, { freq: f, type: "sine", dur: 0.18, gain: 0.18, delay: i * 0.06 }));
        noise(d, { dur: 0.2, freq: 500, q: 2, gain: 0.2 });
      });
    },
    useStart() {
      play(null, 0.35, (d) => tone(d, { freq: 400, freqEnd: 800, type: "sine", dur: 0.25, gain: 0.2 }));
    },
    useDone(kind) {
      play(null, 0.45, (d) => {
        const f = kind === "shield" ? 900 : 640;
        tone(d, { freq: f, type: "sine", dur: 0.12, gain: 0.25 });
        tone(d, { freq: f * 1.33, type: "sine", dur: 0.2, gain: 0.22, delay: 0.08 });
      });
    },
    elimination() {
      play(null, 0.6, (d) => {
        tone(d, { freq: 520, type: "square", dur: 0.08, gain: 0.15 });
        tone(d, { freq: 780, type: "square", dur: 0.16, gain: 0.15, delay: 0.08 });
      });
    },
    ui(hover) {
      play(null, hover ? 0.15 : 0.35, (d) => tone(d, { freq: hover ? 900 : 700, type: "triangle", dur: 0.04, gain: 0.3 }));
    },
    stormHurt() {
      play(null, 0.5, (d) => tone(d, { freq: 110, freqEnd: 60, type: "sawtooth", dur: 0.25, gain: 0.25 }));
    },
    victory() {
      play(null, 0.6, (d) => {
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(d, { freq: f, type: "square", dur: 0.25, gain: 0.12, delay: i * 0.13 }));
      });
    },
    defeat() {
      play(null, 0.6, (d) => {
        [392, 330, 262, 196].forEach((f, i) => tone(d, { freq: f, type: "triangle", dur: 0.35, gain: 0.25, delay: i * 0.18 }));
      });
    },
  };
})(window.SQ = window.SQ || {});
