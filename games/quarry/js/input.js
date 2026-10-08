// Quarry: keyboard, mouse, pointer lock and on-screen touch controls. By The_headphones
(function (QY) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = [false, false, false];
  const clicked = [false, false, false];
  let mdx = 0;
  let mdy = 0;
  let wheel = 0;
  let locked = false;
  let fallback = false;
  let lockFailures = 0;
  let lockPending = false;
  let playing = false;
  let target = null;
  let lastW = 0;
  let sprintLatch = false;
  let lastJumpDown = -1;
  let doubleJump = false;
  const lockListeners = [];
  const touchListeners = [];
  let touchMode = false;

  const touch = {
    moveX: 0,
    moveY: 0,
    lookDX: 0,
    lookDY: 0,
    jump: false,
    jumpPressed: false,
    breakHeld: false,
    breakButton: false,
    place: false,
    placeHeld: false,
    descend: false,
  };

  const PREVENT = new Set(["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "F3", "Slash"]);

  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (playing && PREVENT.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      pressed.add(e.code);
      if (e.code === "Space") jumpDown();
      if (e.code === "KeyW") {
        const now = performance.now();
        if (now - lastW < 300) sprintLatch = true;
        lastW = now;
      }
    }
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (e.code === "KeyW") sprintLatch = false;
  });
  window.addEventListener("blur", () => {
    keys.clear();
    mouse.fill(false);
    sprintLatch = false;
  });

  function onMouseDown(e) {
    if (e.button > 2 || e.pointerType === "touch") return;
    if (!playing) return;
    if (!locked && !fallback) {
      requestLock();
      return;
    }
    e.preventDefault();
    mouse[e.button] = true;
    clicked[e.button] = true;
  }
  window.addEventListener("mouseup", (e) => {
    if (e.button <= 2) mouse[e.button] = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (!playing) return;
    if (locked || fallback) {
      // Some browsers report one huge jump right after the lock engages; drop those.
      const mx = e.movementX || 0;
      const my = e.movementY || 0;
      if (Math.abs(mx) > 400 || Math.abs(my) > 400) return;
      mdx += mx;
      mdy += my;
    }
  });
  window.addEventListener(
    "wheel",
    (e) => {
      if (!playing) return;
      e.preventDefault();
      wheel += Math.sign(e.deltaY);
    },
    { passive: false },
  );
  window.addEventListener("contextmenu", (e) => {
    if (playing) e.preventDefault();
  });
  document.addEventListener("pointerlockchange", () => {
    locked = target !== null && document.pointerLockElement === target;
    if (locked) {
      lockFailures = 0;
      lockPending = false;
    } else mouse.fill(false);
    lockListeners.forEach((fn) => fn(locked, "change"));
  });
  // A refused lock is often just the browser's cool-down after Esc. Only fall back to
  // cursor look (no lock) when it keeps failing, e.g. inside an iframe that forbids it.
  function lockFailed() {
    // Browsers report a refusal as an event, a rejected promise or both; count it once.
    if (!lockPending) return;
    lockPending = false;
    lockFailures++;
    if (lockFailures >= 2) fallback = true;
    lockListeners.forEach((fn) => fn(locked, "error"));
  }
  document.addEventListener("pointerlockerror", lockFailed);

  function requestLock() {
    if (!target || locked || touchMode) return;
    if (!target.requestPointerLock) {
      fallback = true;
      return;
    }
    lockPending = true;
    try {
      const result = target.requestPointerLock();
      if (result && result.catch) result.catch(lockFailed);
    } catch {
      lockFailed();
    }
  }

  // Double-tap detection uses wall-clock time, so it still works when frames are slow.
  function jumpDown() {
    const now = performance.now();
    if (now - lastJumpDown < 320) {
      doubleJump = true;
      lastJumpDown = -1;
    } else lastJumpDown = now;
  }

  // ---- touch controls -------------------------------------------------------------------
  function enterTouchMode() {
    if (touchMode) return;
    touchMode = true;
    document.body.classList.add("touch");
    touchListeners.forEach((fn) => fn(true));
  }

  function bindStick(zone, stick, knob) {
    let id = null;
    let ox = 0;
    let oy = 0;
    const R = 54;
    const place = (x, y) => {
      stick.style.left = `${x}px`;
      stick.style.top = `${y}px`;
    };
    const move = (e) => {
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx *= R / len;
        dy *= R / len;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      touch.moveX = dx / R;
      touch.moveY = dy / R;
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      touch.moveX = 0;
      touch.moveY = 0;
      knob.style.transform = "";
      stick.classList.remove("active");
      stick.style.left = "";
      stick.style.top = "";
    };
    zone.addEventListener("pointerdown", (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      zone.setPointerCapture(id);
      const r = zone.getBoundingClientRect();
      ox = e.clientX;
      oy = e.clientY;
      place(ox - r.left, oy - r.top);
      stick.classList.add("active");
      move(e);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId === id) move(e);
    });
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }

  function bindLook(zone) {
    let id = null;
    let lx = 0;
    let ly = 0;
    let sx = 0;
    let sy = 0;
    let t0 = 0;
    let moved = 0;
    let holding = false;
    let timer = 0;
    zone.addEventListener("pointerdown", (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      zone.setPointerCapture(id);
      lx = sx = e.clientX;
      ly = sy = e.clientY;
      t0 = performance.now();
      moved = 0;
      holding = false;
      clearTimeout(timer);
      // Holding still starts mining; dragging afterwards keeps mining while aiming.
      timer = setTimeout(() => {
        if (id !== null && moved < 14) {
          holding = true;
          touch.breakHeld = true;
        }
      }, 330);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      touch.lookDX += e.clientX - lx;
      touch.lookDY += e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy));
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      clearTimeout(timer);
      if (holding) touch.breakHeld = false;
      else if (moved < 14 && performance.now() - t0 < 300) touch.place = true;
      holding = false;
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }

  function bindHold(el, onDown, onUp) {
    const ids = new Set();
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      ids.add(e.pointerId);
      el.setPointerCapture(e.pointerId);
      el.classList.add("held");
      onDown();
    });
    const end = (e) => {
      if (!ids.delete(e.pointerId)) return;
      if (!ids.size) {
        el.classList.remove("held");
        onUp();
      }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  function init(canvas, ui) {
    target = canvas;
    canvas.addEventListener("mousedown", onMouseDown);
    const coarse = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (coarse) enterTouchMode();
    window.addEventListener("touchstart", enterTouchMode, { passive: true });

    bindStick(ui.moveZone, ui.stick, ui.knob);
    bindLook(ui.lookZone);
    bindHold(
      ui.jump,
      () => {
        touch.jump = true;
        touch.jumpPressed = true;
        jumpDown();
      },
      () => {
        touch.jump = false;
      },
    );
    bindHold(
      ui.breakButton,
      () => {
        touch.breakButton = true;
      },
      () => {
        touch.breakButton = false;
      },
    );
    bindHold(
      ui.place,
      () => {
        touch.place = true;
        touch.placeHeld = true;
      },
      () => {
        touch.placeHeld = false;
      },
    );
    bindHold(
      ui.descend,
      () => {
        touch.descend = true;
      },
      () => {
        touch.descend = false;
      },
    );
  }

  const down = (code) => keys.has(code);

  QY.Input = {
    init,
    setPlaying(v) {
      playing = v;
      if (!v) {
        mouse.fill(false);
        touch.breakHeld = false;
        touch.breakButton = false;
        touch.placeHeld = false;
        touch.jump = false;
        touch.descend = false;
      }
    },
    requestLock,
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    isLocked: () => locked,
    lockPending: () => lockPending,
    usingFallback: () => fallback,
    onLockChange(fn) {
      lockListeners.push(fn);
    },
    isTouch: () => touchMode,
    onTouchMode(fn) {
      touchListeners.push(fn);
    },
    down,
    pressed: (code) => pressed.has(code),
    mouse: (b) => mouse[b],
    mouseClicked: (b) => clicked[b],
    // Movement intent: x = strafe right, z = forward, both -1..1.
    move() {
      let x = (down("KeyD") || down("ArrowRight") ? 1 : 0) - (down("KeyA") || down("ArrowLeft") ? 1 : 0);
      let z = (down("KeyW") || down("ArrowUp") ? 1 : 0) - (down("KeyS") || down("ArrowDown") ? 1 : 0);
      let sprint = down("ShiftLeft") || down("ShiftRight") || sprintLatch;
      const tx = touch.moveX;
      const tz = -touch.moveY;
      if (Math.abs(tx) + Math.abs(tz) > 0.05) {
        x = tx;
        z = tz;
        sprint = Math.hypot(tx, tz) > 0.94 && tz > 0.8;
      }
      return { x, z, sprint };
    },
    sprintKey: () => sprintLatch,
    shiftDown: () => down("ShiftLeft") || down("ShiftRight"),
    jumpHeld: () => down("Space") || touch.jump,
    jumpPressed: () => pressed.has("Space") || touch.jumpPressed,
    consumeDoubleJump() {
      const d = doubleJump;
      doubleJump = false;
      return d;
    },
    descendHeld: () => down("ShiftLeft") || down("ShiftRight") || touch.descend,
    breakHeld: () => mouse[0] || touch.breakHeld || touch.breakButton,
    placePressed: () => clicked[2] || touch.place,
    placeHeld: () => mouse[2] || touch.placeHeld,
    pickPressed: () => clicked[1],
    consumeLook() {
      const out = { mx: mdx, my: mdy, tx: touch.lookDX, ty: touch.lookDY };
      mdx = 0;
      mdy = 0;
      touch.lookDX = 0;
      touch.lookDY = 0;
      return out;
    },
    consumeWheel() {
      const w = wheel;
      wheel = 0;
      return w;
    },
    endFrame() {
      pressed.clear();
      clicked.fill(false);
      touch.jumpPressed = false;
      touch.place = false;
      doubleJump = false;
    },
    reset() {
      keys.clear();
      pressed.clear();
      mouse.fill(false);
      clicked.fill(false);
      mdx = 0;
      mdy = 0;
      wheel = 0;
      sprintLatch = false;
      Object.assign(touch, { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, jump: false, jumpPressed: false, breakHeld: false, breakButton: false, place: false, placeHeld: false, descend: false });
    },
    touch,
  };
})(window.QY = window.QY || {});
