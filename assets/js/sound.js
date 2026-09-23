// Tiny synthesized sound effects shared by every game. By The_headphones

const Sound = (() => {
  const STORAGE_KEY = "chromo-sound";
  let ctx = null;
  let enabled = true;

  try {
    enabled = localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // Storage unavailable; default to sound on.
  }

  function audio() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, { duration = 0.08, type = "square", volume = 0.05, slide = 0, delay = 0 } = {}) {
    const ac = audio();
    if (!ac) return;
    const start = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  const effects = {
    tap: () => tone(520, { duration: 0.05, type: "triangle", volume: 0.07 }),
    place: () => tone(330, { duration: 0.1, type: "triangle", volume: 0.09, slide: -90 }),
    bounce: () => tone(440, { duration: 0.04, type: "square", volume: 0.03 }),
    pop: (step = 0) => tone(480 * Math.pow(1.06, Math.min(step, 24)), { duration: 0.06, type: "square", volume: 0.035 }),
    flap: () => tone(360, { duration: 0.08, type: "triangle", volume: 0.07, slide: 200 }),
    good: () => {
      tone(660, { duration: 0.08, type: "square", volume: 0.035 });
      tone(990, { duration: 0.12, type: "square", volume: 0.035, delay: 0.07 });
    },
    win: () => {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, { duration: 0.16, type: "square", volume: 0.035, delay: i * 0.09 }));
    },
    lose: () => tone(320, { duration: 0.45, type: "sawtooth", volume: 0.04, slide: -240 }),
    boom: () => {
      tone(140, { duration: 0.5, type: "sawtooth", volume: 0.06, slide: -100 });
      tone(90, { duration: 0.6, type: "square", volume: 0.04, slide: -50, delay: 0.03 });
    },
  };

  function play(name, arg) {
    if (!enabled || !effects[name]) return;
    try {
      effects[name](arg);
    } catch {
      // Audio can fail on locked-down browsers; games work silently.
    }
  }

  const toggle = document.getElementById("sound-toggle");

  function renderToggle() {
    if (!toggle) return;
    toggle.textContent = enabled ? "Sound: on" : "Sound: off";
    toggle.setAttribute("aria-pressed", String(enabled));
  }

  if (toggle) {
    toggle.addEventListener("click", () => {
      enabled = !enabled;
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
      } catch {
        // Preference lasts for this page only.
      }
      renderToggle();
      if (enabled) play("tap");
    });
    renderToggle();
  }

  return { play };
})();
