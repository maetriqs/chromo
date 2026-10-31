// By The_headphones
// Keyboard + gamepad input mapped onto the car control struct.

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
const DEADZONE = 0.15;

function dz(v) {
  return Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.down = new Set();
    this.jumpLatch = false;
    this.actionQueue = [];
    this.captureGameKeys = false; // true while driving (prevents page scrolling etc.)
    this.rebindHandler = null;
    this.freeLook = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.gp = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, a: false, b: false, x: false, y: false, lb: false, rb: false, back: false, start: false };
    this.gpPrev = { a: false, b: false, y: false, back: false, start: false, up: false, down: false, left: false, right: false };
    this.menuQueue = [];
    this.onGamepadChange = null;

    window.addEventListener('keydown', (e) => this.onKeyDown(e), { capture: true });
    window.addEventListener('keyup', (e) => this.onKeyUp(e), { capture: true });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    window.addEventListener('gamepadconnected', () => this.onGamepadChange?.(true));
    window.addEventListener('gamepaddisconnected', () => this.onGamepadChange?.(this.anyGamepad()));
  }

  attachMouse(el) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.freeLook = true; e.preventDefault(); }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.freeLook = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.freeLook) return;
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    });
  }

  clear() {
    this.down.clear();
    this.jumpLatch = false;
    this.freeLook = false;
    this.lookDX = 0;
    this.lookDY = 0;
  }

  bound(action) {
    return this.settings.bindings[action] || [];
  }

  actionsForCode(code) {
    const out = [];
    for (const [action, codes] of Object.entries(this.settings.bindings)) if (codes.includes(code)) out.push(action);
    return out;
  }

  onKeyDown(e) {
    if (this.rebindHandler) {
      e.preventDefault();
      e.stopPropagation();
      const h = this.rebindHandler;
      this.rebindHandler = null;
      h(e.code);
      return;
    }
    const typing = e.target && (e.target.tagName === 'INPUT' && e.target.type !== 'range');
    if (typing) return;
    const actions = this.actionsForCode(e.code);
    if (this.captureGameKeys && (actions.length || GAME_KEYS.has(e.code))) e.preventDefault();
    // Block common Ctrl shortcuts (bookmark, save, find...) while driving; Ctrl+W/T/N
    // are reserved by the browser and can only be captured in fullscreen keyboard lock.
    // (Ctrl+R would otherwise reload the page mid-match: powerslide + reset.)
    if (this.captureGameKeys && (e.ctrlKey || e.metaKey)) e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    if (actions.includes('jump')) this.jumpLatch = true;
    for (const a of actions) if (a === 'ballCam' || a === 'reset') this.actionQueue.push(a);
    // While driving, Esc/P pause. In menus the UI owns Esc (back / resume).
    if (this.captureGameKeys && (e.code === 'Escape' || e.code === 'KeyP')) this.actionQueue.push('pause');
  }

  onKeyUp(e) {
    this.down.delete(e.code);
  }

  isDown(action) {
    const codes = this.bound(action);
    for (let i = 0; i < codes.length; i++) if (codes[i] && this.down.has(codes[i])) return true;
    return false;
  }

  anyGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return true;
    return false;
  }

  /** Call once per rendered frame. */
  pollGamepad() {
    const g = this.gp;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) {
      if (g.connected) Object.assign(g, { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, a: false, b: false, x: false, y: false, lb: false, rb: false, back: false, start: false });
      return;
    }
    const btn = (i) => !!pad.buttons[i]?.pressed;
    const val = (i) => pad.buttons[i]?.value || 0;
    g.connected = true;
    g.lx = dz(pad.axes[0] || 0); g.ly = dz(pad.axes[1] || 0);
    g.rx = dz(pad.axes[2] || 0); g.ry = dz(pad.axes[3] || 0);
    g.lt = val(6); g.rt = val(7);
    g.a = btn(0); g.b = btn(1); g.x = btn(2); g.y = btn(3); g.lb = btn(4); g.rb = btn(5);
    g.back = btn(8); g.start = btn(9);
    const p = this.gpPrev;
    // Menu navigation (D-pad or left stick, A select, B back)
    const up = btn(12) || g.ly < -0.6, down = btn(13) || g.ly > 0.6;
    const left = btn(14) || g.lx < -0.6, right = btn(15) || g.lx > 0.6;
    if (up && !p.up) this.menuQueue.push('ArrowUp');
    if (down && !p.down) this.menuQueue.push('ArrowDown');
    if (left && !p.left) this.menuQueue.push('ArrowLeft');
    if (right && !p.right) this.menuQueue.push('ArrowRight');
    if (g.a && !p.a) this.menuQueue.push('select');
    if (g.b && !p.b) this.menuQueue.push('Escape');
    p.up = up; p.down = down; p.left = left; p.right = right; p.b = g.b;
    if (g.a && !p.a) this.jumpLatch = true;
    if (g.y && !p.y) this.actionQueue.push('ballCam');
    if (g.back && !p.back) this.actionQueue.push('reset');
    if (g.start && !p.start) this.actionQueue.push('pause');
    p.a = g.a; p.y = g.y; p.back = g.back; p.start = g.start;
    if (Math.abs(g.rx) > 0 || Math.abs(g.ry) > 0) {
      this.lookDX += g.rx * 14;
      this.lookDY += g.ry * 8;
    }
  }

  takeMenuNav() {
    const q = this.menuQueue;
    this.menuQueue = [];
    return q;
  }

  takeActions() {
    const q = this.actionQueue;
    this.actionQueue = [];
    return q;
  }

  takeLook() {
    const dx = this.lookDX, dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return [dx, dy];
  }

  get lookActive() {
    return this.freeLook || Math.abs(this.gp.rx) > 0 || Math.abs(this.gp.ry) > 0;
  }

  /** Writes the current controls into a car input struct (called once per physics step). */
  fillCarInput(inp) {
    const k = (a) => (this.isDown(a) ? 1 : 0);
    const g = this.gp;
    const fwd = k('throttle') - k('reverse');
    let throttle = fwd + g.rt - g.lt;
    let steer = k('steerRight') - k('steerLeft') + g.lx;
    let stickY = fwd - g.ly;
    throttle = Math.max(-1, Math.min(1, throttle));
    steer = Math.max(-1, Math.min(1, steer));
    stickY = Math.max(-1, Math.min(1, stickY));
    const airRoll = this.isDown('powerslide') || g.x;
    inp.throttle = throttle;
    inp.steer = steer;
    inp.stickX = steer;
    inp.stickY = stickY;
    inp.pitch = -stickY;
    if (airRoll) { inp.roll = -steer; inp.yaw = 0; } else { inp.roll = 0; inp.yaw = -steer; }
    inp.roll = Math.max(-1, Math.min(1, inp.roll + k('airRollLeft') - k('airRollRight') + (g.lb ? 1 : 0) - (g.rb ? 1 : 0)));
    inp.powerslide = airRoll;
    inp.boost = this.isDown('boost') || g.b;
    inp.jump = this.isDown('jump') || g.a || this.jumpLatch;
    inp.jumpPressed = this.jumpLatch;
    this.jumpLatch = false;
  }
}
