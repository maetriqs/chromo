// By The_headphones
// Persistent player settings (localStorage when available, defaults otherwise).

export const ACTIONS = [
  { id: 'throttle', label: 'Accelerate', hint: 'Pitch nose down in the air' },
  { id: 'reverse', label: 'Reverse / brake', hint: 'Pitch nose up in the air' },
  { id: 'steerLeft', label: 'Steer left', hint: 'Yaw left in the air' },
  { id: 'steerRight', label: 'Steer right', hint: 'Yaw right in the air' },
  { id: 'jump', label: 'Jump', hint: 'Press again in the air to double jump or flip' },
  { id: 'boost', label: 'Boost' },
  { id: 'powerslide', label: 'Powerslide / air roll', hint: 'Hold with steer keys to roll in the air' },
  { id: 'airRollLeft', label: 'Air roll left' },
  { id: 'airRollRight', label: 'Air roll right' },
  { id: 'ballCam', label: 'Ball cam toggle' },
  { id: 'reset', label: 'Reset car' },
];

export const DEFAULT_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  reverse: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  jump: ['Space', ''],
  boost: ['ShiftLeft', 'ShiftRight'],
  powerslide: ['ControlLeft', 'ControlRight'],
  airRollLeft: ['KeyQ', ''],
  airRollRight: ['KeyE', ''],
  ballCam: ['KeyC', ''],
  reset: ['KeyR', ''],
};

export const DEFAULT_SETTINGS = {
  quality: 'high',
  showFps: false,
  masterVolume: 0.8,
  musicVolume: 0.45,
  sfxVolume: 0.85,
  mouseSensitivity: 1.0,
  cameraDistance: 2.9,
  cameraHeight: 1.05,
  fov: 100,
  cameraStiffness: 0.45,
  ballCamDefault: true,
  autoQualityDone: false,
};

const KEY = 'overboost.settings.v1';

function cloneBindings(b) {
  const out = {};
  for (const a of ACTIONS) out[a.id] = (b?.[a.id] || DEFAULT_BINDINGS[a.id]).slice(0, 2);
  return out;
}

export function loadSettings() {
  let saved = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }
  const s = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  s.bindings = cloneBindings(saved?.bindings);
  if (!saved) {
    // First visit: honour the Chromo site-wide sound switch. The in-game volume takes over after that.
    try {
      if (window.localStorage.getItem('chromo-sound') === 'off') s.masterVolume = 0;
    } catch {
      // Storage unavailable: keep the default volume.
    }
  }
  return s;
}

export function saveSettings(s) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode, sandbox): settings simply won't persist.
  }
}

export function resetBindings(s) {
  s.bindings = cloneBindings(DEFAULT_BINDINGS);
}

const KEY_NAMES = {
  Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
  AltLeft: 'L Alt', AltRight: 'R Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps', Escape: 'Esc',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
