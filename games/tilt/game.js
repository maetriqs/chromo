// By The_headphones

const CELL = 2;
const WALL_T = 0.3;
const WALL_H = 0.7;
const BALL_R = 0.42;
const MAX_TILT = 0.26;
const GRAVITY = 26;
const DAMPING = 0.9;
const BOUNCE = 0.35;
const MAX_SPEED = 10;
const SUBSTEPS = 4;
const STORAGE_KEY = "chromo-tilt-level";

const stageEl = document.getElementById("stage");
const statusEl = document.getElementById("status");
const levelEl = document.getElementById("level");
const timerEl = document.getElementById("timer");
const fallsEl = document.getElementById("falls");
const overlay = Kit.overlay(stageEl);

const camera = window.THREE ? new THREE.PerspectiveCamera(40, 1, 0.1, 200) : null;
const stage = camera && Kit.createStage(stageEl, camera);

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

function formatTime(total) {
  const s = Math.floor(total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function generateMaze(n) {
  const cells = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ n: true, e: true, s: true, w: true, seen: false })));
  const stack = [[0, 0]];
  cells[0][0].seen = true;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const options = [
      [r - 1, c, "n", "s"],
      [r + 1, c, "s", "n"],
      [r, c - 1, "w", "e"],
      [r, c + 1, "e", "w"],
    ].filter(([nr, nc]) => nr >= 0 && nc >= 0 && nr < n && nc < n && !cells[nr][nc].seen);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nr, nc, wall, opposite] = options[Math.floor(Math.random() * options.length)];
    cells[r][c][wall] = false;
    cells[nr][nc][opposite] = false;
    cells[nr][nc].seen = true;
    stack.push([nr, nc]);
  }
  return cells;
}

if (!stage) {
  setStatus("3D unavailable", "is-lose");
} else {
  run();
}

function run() {
  const { renderer, scene } = stage;
  scene.background = Kit.color("ground");
  const sun = Kit.addLights(scene, 12);
  const colors = {
    paper: Kit.color("paper"),
    ink: Kit.color("ink"),
    plum: Kit.color("plum"),
    goal: Kit.color("sea"),
    ball: Kit.color("tomato"),
    start: Kit.color("ground-deep"),
  };

  let level = Kit.readNumber(STORAGE_KEY, 1);
  let n, half, walls, holes, goal, start, board, ball;
  let phase = "ready";
  let pos = { x: 0, z: 0 };
  let vel = { x: 0, z: 0 };
  let tilt = { x: 0, z: 0 };
  let seconds = 0;
  let falls = 0;
  let fallT = 0;
  let wonAt = 0;
  let lastBump = 0;
  const keys = { up: false, down: false, left: false, right: false };
  const pointer = { active: false, x: 0, z: 0 };

  const centerOf = (r, c) => ({ x: (c + 0.5) * CELL - half, z: (r + 0.5) * CELL - half });

  function flatDisc(radius, color, y) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshLambertMaterial({ color }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildLevel() {
    if (board) Kit.dispose(board);
    n = Math.min(4 + level, 11);
    half = (n * CELL) / 2;
    const cells = generateMaze(n);
    board = new THREE.Group();
    scene.add(board);

    const size = n * CELL + WALL_T;
    const floor = Kit.box(size, 0.4, size, colors.paper);
    floor.position.y = -0.2;
    board.add(floor);
    const tray = Kit.box(size + 0.8, 0.5, size + 0.8, colors.plum);
    tray.position.y = -0.55;
    board.add(tray);

    walls = [];
    const addWall = (cx, cz, hw, hd) => {
      walls.push({ cx, cz, hw, hd });
      const mesh = Kit.box(hw * 2, WALL_H, hd * 2, colors.ink);
      mesh.position.set(cx, WALL_H / 2, cz);
      board.add(mesh);
    };
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c < n; c++) {
        if (r === 0 || r === n || cells[r][c].n) addWall((c + 0.5) * CELL - half, r * CELL - half, CELL / 2 + WALL_T / 2, WALL_T / 2);
      }
    }
    for (let c = 0; c <= n; c++) {
      for (let r = 0; r < n; r++) {
        if (c === 0 || c === n || cells[r][c].w) addWall(c * CELL - half, (r + 0.5) * CELL - half, WALL_T / 2, CELL / 2 + WALL_T / 2);
      }
    }

    start = centerOf(0, 0);
    goal = centerOf(n - 1, n - 1);
    const goalDisc = flatDisc(CELL * 0.32, colors.goal, 0.012);
    goalDisc.position.x = goal.x;
    goalDisc.position.z = goal.z;
    board.add(goalDisc);
    const startDisc = flatDisc(CELL * 0.28, colors.start, 0.01);
    startDisc.position.x = start.x;
    startDisc.position.z = start.z;
    board.add(startDisc);

    holes = [];
    if (level >= 3) {
      const deadEnds = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const cell = cells[r][c];
          const wallCount = [cell.n, cell.e, cell.s, cell.w].filter(Boolean).length;
          if (wallCount === 3 && r + c > 1 && !(r === n - 1 && c === n - 1)) deadEnds.push([r, c]);
        }
      }
      deadEnds.sort(() => Math.random() - 0.5);
      deadEnds.slice(0, Math.min(level - 2, 6)).forEach(([r, c]) => {
        const hole = centerOf(r, c);
        holes.push(hole);
        const disc = flatDisc(CELL * 0.3, colors.ink, 0.012);
        disc.position.x = hole.x;
        disc.position.z = hole.z;
        board.add(disc);
      });
    }

    ball = new THREE.Group();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshLambertMaterial({ color: colors.ball }));
    sphere.castShadow = true;
    const band = new THREE.Mesh(new THREE.TorusGeometry(BALL_R, 0.05, 8, 40), new THREE.MeshLambertMaterial({ color: colors.ink }));
    ball.add(sphere, band);
    board.add(ball);

    const view = n * CELL;
    camera.position.set(0, view * 1.3, view * 0.85);
    camera.lookAt(0, 0, view * 0.04);
    Object.assign(sun.shadow.camera, { left: -half - 2, right: half + 2, top: half + 2, bottom: -half - 2 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.position.set(half * 0.6, 20, half * 0.4);

    levelEl.textContent = String(level);
    restart();
  }

  function restart() {
    pos = { ...start };
    vel = { x: 0, z: 0 };
    tilt = { x: 0, z: 0 };
    seconds = 0;
    falls = 0;
    phase = "ready";
    ball.position.set(pos.x, BALL_R, pos.z);
    ball.scale.setScalar(1);
    timerEl.textContent = "0:00";
    fallsEl.textContent = "0";
    overlay.show(`Level ${level}`, "Tilt with the arrow keys, or press and drag on the board");
    setStatus(`Level ${level}`, "");
  }

  function begin() {
    if (phase === "ready") {
      phase = "playing";
      overlay.hide();
      setStatus("Rolling", "");
      Sound.play("tap");
      return true;
    }
    if (phase === "won" && performance.now() - wonAt > 400) {
      level += 1;
      buildLevel();
      return false;
    }
    return phase === "playing";
  }

  function win() {
    phase = "won";
    wonAt = performance.now();
    Kit.writeNumber(STORAGE_KEY, Math.max(Kit.readNumber(STORAGE_KEY, 1), level + 1));
    Sound.play("win");
    const fallText = falls ? `, ${falls} ${falls === 1 ? "fall" : "falls"}` : ", no falls";
    overlay.show(`Level ${level} cleared`, `${formatTime(seconds)}${fallText}. Tap or press Space for level ${level + 1}`);
    setStatus(`Cleared in ${formatTime(seconds)}`, "is-win");
  }

  function collideWalls() {
    for (const w of walls) {
      const px = Math.max(w.cx - w.hw, Math.min(pos.x, w.cx + w.hw));
      const pz = Math.max(w.cz - w.hd, Math.min(pos.z, w.cz + w.hd));
      let dx = pos.x - px;
      let dz = pos.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= BALL_R * BALL_R) continue;
      let nx;
      let nz;
      let push;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        push = BALL_R - d;
      } else {
        const penX = w.hw + BALL_R - Math.abs(pos.x - w.cx);
        const penZ = w.hd + BALL_R - Math.abs(pos.z - w.cz);
        if (penX < penZ) {
          nx = Math.sign(pos.x - w.cx) || 1;
          nz = 0;
          push = penX;
        } else {
          nx = 0;
          nz = Math.sign(pos.z - w.cz) || 1;
          push = penZ;
        }
      }
      pos.x += nx * push;
      pos.z += nz * push;
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) {
        vel.x -= (1 + BOUNCE) * vn * nx;
        vel.z -= (1 + BOUNCE) * vn * nz;
        const now = performance.now();
        if (-vn > 2.5 && now - lastBump > 90) {
          lastBump = now;
          Sound.play("bounce");
        }
      }
    }
  }

  function physics(dt) {
    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      vel.x += GRAVITY * Math.sin(tilt.x) * h;
      vel.z += GRAVITY * Math.sin(tilt.z) * h;
      const keep = Math.exp(-DAMPING * h);
      vel.x *= keep;
      vel.z *= keep;
      const speed = Math.hypot(vel.x, vel.z);
      if (speed > MAX_SPEED) {
        vel.x *= MAX_SPEED / speed;
        vel.z *= MAX_SPEED / speed;
      }
      pos.x += vel.x * h;
      pos.z += vel.z * h;
      collideWalls();
    }

    for (const hole of holes) {
      if (Math.hypot(pos.x - hole.x, pos.z - hole.z) < CELL * 0.22) {
        phase = "falling";
        fallT = 0;
        pos = { ...hole };
        Sound.play("lose");
        setStatus("Down the hole", "is-lose");
        return;
      }
    }
    if (Math.hypot(pos.x - goal.x, pos.z - goal.z) < CELL * 0.26) win();
  }

  function rollBall(dx, dz) {
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return;
    const axis = new THREE.Vector3(dz, 0, -dx).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(axis, dist / BALL_R);
    ball.quaternion.premultiply(q);
  }

  function targetTilt() {
    if (keys.up || keys.down || keys.left || keys.right) {
      return { x: ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * MAX_TILT, z: ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * MAX_TILT };
    }
    if (pointer.active) return { x: pointer.x * MAX_TILT, z: pointer.z * MAX_TILT };
    return { x: 0, z: 0 };
  }

  function tick(dt) {
    const target = phase === "playing" ? targetTilt() : { x: 0, z: 0 };
    const ease = Math.min(1, dt * 8);
    tilt.x += (target.x - tilt.x) * ease;
    tilt.z += (target.z - tilt.z) * ease;

    if (phase === "playing") {
      const before = { ...pos };
      physics(dt);
      rollBall(pos.x - before.x, pos.z - before.z);
      seconds += dt;
      timerEl.textContent = formatTime(seconds);
      ball.position.set(pos.x, BALL_R, pos.z);
    } else if (phase === "falling") {
      fallT += dt;
      const t = Math.min(1, fallT / 0.45);
      ball.position.set(pos.x, BALL_R - t * 1.2, pos.z);
      ball.scale.setScalar(1 - t * 0.6);
      if (t >= 1) {
        falls += 1;
        fallsEl.textContent = String(falls);
        pos = { ...start };
        vel = { x: 0, z: 0 };
        ball.scale.setScalar(1);
        ball.position.set(pos.x, BALL_R, pos.z);
        phase = "playing";
        setStatus("Back to the start", "");
      }
    }

    board.rotation.set(tilt.z, 0, -tilt.x);
    renderer.render(scene, camera);
  }

  const KEY_DIRS = {
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
  };
  document.addEventListener("keydown", (event) => {
    const dir = KEY_DIRS[event.code];
    if (dir) {
      event.preventDefault();
      keys[dir] = true;
      begin();
    } else if (event.code === "Space" && event.target === document.body) {
      event.preventDefault();
      if (phase === "won") begin();
    }
  });
  document.addEventListener("keyup", (event) => {
    const dir = KEY_DIRS[event.code];
    if (dir) keys[dir] = false;
  });
  window.addEventListener("blur", () => {
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    pointer.active = false;
  });

  function aim(event) {
    const rect = stageEl.getBoundingClientRect();
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    pointer.x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.32));
    pointer.z = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.32));
  }
  stageEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (!begin()) return;
    pointer.active = true;
    stageEl.setPointerCapture(event.pointerId);
    aim(event);
  });
  stageEl.addEventListener("pointermove", (event) => {
    if (pointer.active) aim(event);
  });
  const release = () => { pointer.active = false; };
  stageEl.addEventListener("pointerup", release);
  stageEl.addEventListener("pointercancel", release);

  document.getElementById("restart").addEventListener("click", () => {
    restart();
    Sound.play("tap");
  });

  buildLevel();
  Kit.loop(tick);
}
