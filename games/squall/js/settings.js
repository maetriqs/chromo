// Squall: persisted player settings. By The_headphones
(function (SQ) {
  const KEY = "squall-settings-v1";
  const DEFAULTS = {
    sensitivity: 1.0,
    adsSensitivity: 0.7,
    invertY: false,
    fov: 78,
    volume: 0.7,
    quality: "high",
    botSkill: "mixed",
    bots: 19,
    showFps: false,
    binds: { ...SQ.DEFAULT_BINDS },
  };

  const stored = SQ.U.storageGet(KEY, {});
  const values = { ...DEFAULTS, ...stored, binds: { ...DEFAULTS.binds, ...(stored.binds || {}) } };
  const listeners = [];

  SQ.Settings = {
    values,
    defaults: DEFAULTS,
    get(key) {
      return values[key];
    },
    set(key, value) {
      values[key] = value;
      SQ.U.storageSet(KEY, values);
      listeners.forEach((fn) => fn(key, value));
    },
    setBind(action, code) {
      values.binds[action] = code;
      SQ.U.storageSet(KEY, values);
    },
    resetBinds() {
      values.binds = { ...DEFAULTS.binds };
      SQ.U.storageSet(KEY, values);
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
})(window.SQ = window.SQ || {});
