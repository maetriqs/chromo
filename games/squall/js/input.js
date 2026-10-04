// Squall: keyboard, mouse and pointer-lock state. By The_headphones
(function (SQ) {
  const down = new Set();
  const pressed = new Set();
  const mouseDown = [false, false, false];
  const mousePressed = [false, false, false];
  let dx = 0;
  let dy = 0;
  let wheel = 0;
  let locked = false;
  // Set when the browser refuses pointer lock; plain mouse movement then steers the camera.
  let fallbackLook = false;
  let target = null;
  const lookActive = () => locked || (fallbackLook && SQ.Game && SQ.Game.inMatch() && !SQ.Menus.isOpen());
  let captureCallback = null;
  const lockListeners = [];

  const PREVENT = new Set(["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

  function keyName(code) {
    if (!code) return "—";
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    const names = {
      ShiftLeft: "L-Shift", ShiftRight: "R-Shift", ControlLeft: "L-Ctrl", ControlRight: "R-Ctrl",
      AltLeft: "L-Alt", AltRight: "R-Alt", Space: "Space", Tab: "Tab", CapsLock: "Caps",
      Backquote: "`", Mouse3: "Mouse 4", Mouse4: "Mouse 5",
    };
    return names[code] || code;
  }

  window.addEventListener("keydown", (event) => {
    if (captureCallback) {
      event.preventDefault();
      const cb = captureCallback;
      captureCallback = null;
      cb(event.code === "Escape" ? null : event.code);
      return;
    }
    const active = SQ.Game && SQ.Game.inMatch();
    if (active && PREVENT.has(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    down.add(event.code);
  });
  window.addEventListener("keyup", (event) => {
    down.delete(event.code);
  });
  window.addEventListener("blur", () => {
    down.clear();
    mouseDown.fill(false);
  });

  window.addEventListener("mousedown", (event) => {
    if (event.button > 2) return;
    if (locked) event.preventDefault();
    mouseDown[event.button] = true;
    mousePressed[event.button] = true;
  });
  window.addEventListener("mouseup", (event) => {
    if (event.button <= 2) mouseDown[event.button] = false;
  });
  window.addEventListener("mousemove", (event) => {
    if (!lookActive()) return;
    dx += event.movementX || 0;
    dy += event.movementY || 0;
  });
  window.addEventListener(
    "wheel",
    (event) => {
      if (!lookActive()) return;
      wheel += Math.sign(event.deltaY);
    },
    { passive: true },
  );
  document.addEventListener("pointerlockerror", () => {
    fallbackLook = true;
  });
  window.addEventListener("contextmenu", (event) => {
    if (SQ.Game && SQ.Game.inMatch()) event.preventDefault();
  });

  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === target && target !== null;
    if (!locked) mouseDown.fill(false);
    lockListeners.forEach((fn) => fn(locked));
  });

  SQ.Input = {
    keyName,
    setTarget(el) {
      target = el;
    },
    requestLock() {
      if (!target || locked) return;
      try {
        const result = target.requestPointerLock();
        if (result && result.catch) {
          result.catch(() => {
            fallbackLook = true;
          });
        }
      } catch {
        fallbackLook = true;
      }
    },
    usingFallback: () => fallbackLook,
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    isLocked: () => locked,
    onLockChange(fn) {
      lockListeners.push(fn);
    },
    code(action) {
      return SQ.Settings.values.binds[action];
    },
    isDown(action) {
      return down.has(SQ.Settings.values.binds[action]);
    },
    wasPressed(action) {
      return pressed.has(SQ.Settings.values.binds[action]);
    },
    keyPressed(code) {
      return pressed.has(code);
    },
    mouse: (button) => mouseDown[button],
    mouseClicked: (button) => mousePressed[button],
    consumeMouse() {
      const out = { dx, dy };
      dx = 0;
      dy = 0;
      return out;
    },
    consumeWheel() {
      const w = wheel;
      wheel = 0;
      return w;
    },
    endFrame() {
      pressed.clear();
      mousePressed.fill(false);
    },
    captureKey(cb) {
      captureCallback = cb;
    },
    reset() {
      down.clear();
      pressed.clear();
      mouseDown.fill(false);
      mousePressed.fill(false);
      dx = 0;
      dy = 0;
    },
  };
})(window.SQ = window.SQ || {});
