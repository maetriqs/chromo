// Quarry: synthesized block sounds, footsteps, UI clicks and a quiet generative score. By The_headphones
(function (QY) {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let noise = null;
  let volume = 0.7;
  let musicOn = true;
  let musicActive = false;
  let nextPhrase = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);

    // Music goes through a soft feedback delay so single notes ring out like a small room.
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.5 : 0;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.36;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1800;
    musicBus.connect(master);
    musicBus.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(master);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
  }

  // Filtered noise per material: [filter type, frequency, Q, length (s), gain, thump Hz]
  const MATERIAL = {
    stone: ["bandpass", 1500, 0.8, 0.09, 0.55, 0],
    dirt: ["lowpass", 700, 0.7, 0.12, 0.7, 90],
    grass: ["bandpass", 2400, 0.5, 0.12, 0.42, 0],
    gravel: ["bandpass", 1100, 0.6, 0.14, 0.6, 0],
    sand: ["highpass", 2200, 0.5, 0.12, 0.38, 0],
    wood: ["bandpass", 520, 2.2, 0.1, 0.75, 150],
    leaves: ["highpass", 3000, 0.6, 0.13, 0.3, 0],
    glass: ["bandpass", 3600, 3, 0.07, 0.4, 0],
    cloth: ["lowpass", 500, 0.5, 0.1, 0.4, 0],
    snow: ["lowpass", 1400, 0.5, 0.12, 0.45, 0],
  };

  function hit(material, vol, len) {
    const c = ensure();
    if (!c || c.state !== "running") return;
    const p = MATERIAL[material] || MATERIAL.stone;
    const t = c.currentTime;
    const dur = p[3] * len;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = c.createBiquadFilter();
    filter.type = p[0];
    filter.frequency.value = p[1] * (0.85 + Math.random() * 0.3);
    filter.Q.value = p[2];
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p[4] * vol), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.6);
    src.stop(t + dur + 0.05);
    if (p[5]) tone("sine", p[5] * (0.9 + Math.random() * 0.2), p[5] * 0.6, dur * 1.2, 0.35 * vol);
  }

  function tone(type, from, to, dur, vol, when = 0) {
    const c = ensure();
    if (!c || c.state !== "running") return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const soundOf = (id) => (QY.BLOCKS[id] ? QY.BLOCKS[id].sound : "stone");

  const Audio = {
    unlock,
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v;
    },
    setMusic(on) {
      musicOn = on;
      if (musicBus) musicBus.gain.value = on ? 0.5 : 0;
    },
    setMusicActive(on) {
      musicActive = on;
    },
    dig(id) {
      hit(soundOf(id), 0.45, 0.9);
    },
    breakBlock(id) {
      const m = soundOf(id);
      hit(m, 1, 1.7);
      if (m === "glass") {
        for (let i = 0; i < 4; i++) tone("triangle", 2400 + Math.random() * 1800, 1800, 0.18, 0.06, i * 0.03);
      }
    },
    place(id) {
      hit(soundOf(id), 0.85, 1.1);
    },
    step(id) {
      hit(soundOf(id), 0.2, 0.8);
    },
    land(id) {
      hit(soundOf(id), 0.5, 1.2);
    },
    splash() {
      const c = ensure();
      if (!c || c.state !== "running") return;
      hit("sand", 0.9, 3.2);
      tone("sine", 320, 120, 0.25, 0.08);
    },
    pop() {
      tone("sine", 620 + Math.random() * 160, 980, 0.07, 0.12);
    },
    hurt() {
      tone("square", 240, 110, 0.16, 0.08);
      hit("dirt", 0.6, 1);
    },
    click() {
      tone("triangle", 1250, 900, 0.045, 0.09);
    },
    // Called every frame; occasionally plays a short pentatonic phrase while in the world.
    update(nightness) {
      const c = ctx;
      if (!c || c.state !== "running" || !musicOn || !musicActive) return;
      if (!nextPhrase) nextPhrase = c.currentTime + 8;
      if (c.currentTime < nextPhrase) return;
      const scale = [196, 220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
      const low = nightness > 0.5 ? 0 : 2;
      let step = low + Math.floor(Math.random() * 4);
      const notes = 3 + Math.floor(Math.random() * 4);
      let when = 0;
      for (let i = 0; i < notes; i++) {
        step = Math.max(0, Math.min(scale.length - 1, step + Math.floor(Math.random() * 5) - 2));
        const f = scale[step];
        const t = c.currentTime + when;
        [["triangle", f, 0.05], ["sine", f / 2, 0.035]].forEach(([type, freq, vol]) => {
          const o = c.createOscillator();
          o.type = type;
          o.frequency.value = freq;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
          o.connect(g);
          g.connect(musicBus);
          o.start(t);
          o.stop(t + 2.7);
        });
        when += 0.45 + Math.random() * 0.55;
      }
      nextPhrase = c.currentTime + when + 7 + Math.random() * 9;
    },
  };

  QY.Audio = Audio;
})(window.QY = window.QY || {});
