// By The_headphones

const LANES = [-2, 0, 2];
const PLAYER = 0.9;
const TALL_H = 2.2;
const LOW_H = 0.7;
const GRAVITY = 30;
const JUMP_V = 10;
const START_SPEED = 13;
const MAX_SPEED = 32;
const TILE_LEN = 10;
const TILE_COUNT = 12;
const COIN_POINTS = 25;
const STORAGE_KEY = "chromo-dash-best";

const stageEl = document.getElementById("stage");
const statusEl = document.getElementById("status");
const liveScoreEl = document.getElementById("live-score");
const hud = {
  metres: document.getElementById("metres"),
  coins: document.getElementById("coins"),
  score: document.getElementById("score"),
  best: document.getElementById("best"),
};
const overlay = Kit.overlay(stageEl);

const camera = window.THREE ? new THREE.PerspectiveCamera(62, 1, 0.1, 140) : null;
const stage = camera && Kit.createStage(stageEl, camera);

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

if (!stage) {
  setStatus("3D unavailable", "is-lose");
} else {
  run();
}

function run() {
  const { renderer, scene } = stage;
  const c = (name) => Kit.color(name);
  const ground = c("ground");
  const ink = c("ink");
  const butter = c("butter");
  const coinColor = c("mustard");
  const scenery = ["sea", "sky", "lilac", "pink", "lime", "aqua", "kraft", "tomato"].map(c);
  scene.background = ground;
  scene.fog = new THREE.Fog(ground, 40, 95);
  const sun = Kit.addLights(scene, 14);

  const tiles = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const tile = Kit.box(6.6, 0.4, TILE_LEN, i % 2 ? c("paper") : c("ground-deep"));
    tile.position.set(0, -0.2, -i * TILE_LEN);
    tile.castShadow = false;
    [-1, 1].forEach((side) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, TILE_LEN * 0.55), new THREE.MeshLambertMaterial({ color: ink }));
      line.position.set(side, 0.21, 0);
      tile.add(line);
    });
    scene.add(tile);
    tiles.push(tile);
  }

  const buildings = [];
  for (let i = 0; i < 28; i++) {
    const b = Kit.box(1, 1, 1, scenery[i % scenery.length]);
    scene.add(b);
    buildings.push(b);
  }

  function placeBuilding(b, z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const w = 1.5 + Math.random() * 1.8;
    const h = 1 + Math.random() * 5.5;
    const d = 2 + Math.random() * 2.5;
    b.scale.set(w, h, d);
    b.position.set(side * (4.8 + w / 2 + Math.random() * 3), h / 2, z);
    b.material.color.copy(scenery[Math.floor(Math.random() * scenery.length)]);
  }

  const player = new THREE.Group();
  const body = Kit.box(PLAYER, PLAYER, PLAYER, c("tomato"));
  const visor = Kit.box(0.6, 0.18, 0.05, ink);
  visor.position.set(0, 0.15, -PLAYER / 2 - 0.02);
  body.add(visor);
  player.add(body);
  scene.add(player);

  let phase, speed, z, lane, x, y, vy, onGround, distance, coins, best, nextRowZ;
  let obstacles = [];
  let coinList = [];
  let shake = 0;
  let overAt = 0;
  let squash = 0;
  let milestone = 0;
  let camX = 0;
  let shownMetres = -1;

  function reset() {
    obstacles.forEach((o) => Kit.dispose(o.mesh));
    coinList.forEach((k) => Kit.dispose(k.mesh));
    obstacles = [];
    coinList = [];
    phase = "ready";
    speed = START_SPEED;
    z = 0;
    lane = 1;
    x = 0;
    y = 0;
    vy = 0;
    onGround = true;
    distance = 0;
    coins = 0;
    milestone = 0;
    shake = 0;
    nextRowZ = -45;
    best = Kit.readNumber(STORAGE_KEY);
    tiles.forEach((tile, i) => { tile.position.z = -i * TILE_LEN; });
    buildings.forEach((b, i) => placeBuilding(b, 6 - i * 4.6));
    body.rotation.set(0, 0, 0);
    shownMetres = -1;
    updateHud(true);
    liveScoreEl.hidden = true;
    overlay.show("Dash", "Press an arrow key, or tap, to start running");
    setStatus("Ready", "");
  }

  function addObstacle(kind, laneIndex, rowZ) {
    const all = laneIndex === "all";
    let mesh;
    let w;
    let d;
    if (kind === "tall") {
      w = 1.6;
      d = 1.1;
      mesh = Kit.box(w, TALL_H, d, ink);
      const band = Kit.box(w + 0.02, 0.22, d + 0.02, butter);
      band.position.y = TALL_H / 2 - 0.35;
      mesh.add(band);
      mesh.position.set(LANES[laneIndex], TALL_H / 2, rowZ);
    } else {
      w = all ? 6.2 : 1.7;
      d = 0.5;
      mesh = Kit.box(w, LOW_H, d, butter);
      for (let s = -w / 2 + 0.4; s < w / 2; s += 0.8) {
        const stripe = Kit.box(0.3, LOW_H + 0.02, d + 0.02, ink);
        stripe.position.x = s;
        mesh.add(stripe);
      }
      mesh.position.set(all ? 0 : LANES[laneIndex], LOW_H / 2, rowZ);
    }
    scene.add(mesh);
    obstacles.push({ mesh, kind, lane: laneIndex, z: rowZ, halfW: w / 2, halfD: d / 2 });
  }

  function addCoin(laneIndex, coinZ, height = 0.8) {
    const mesh = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 20), new THREE.MeshLambertMaterial({ color: coinColor }));
    disc.rotation.x = Math.PI / 2;
    mesh.add(disc);
    mesh.position.set(LANES[laneIndex], height, coinZ);
    scene.add(mesh);
    coinList.push({ mesh, lane: laneIndex, z: coinZ, y: height });
  }

  function coinTrail(laneIndex, rowZ, count, height) {
    for (let i = 0; i < count; i++) addCoin(laneIndex, rowZ - i * 2, height);
  }

  function spawnRow(rowZ) {
    const r = Math.random();
    const hardness = Math.min(1, distance / 900);
    const pick = () => Math.floor(Math.random() * 3);
    if (distance > 120 && r < 0.2) {
      addObstacle("low", "all", rowZ);
      addCoin(pick(), rowZ, 1.9);
    } else if (distance > 250 && r < 0.2 + 0.3 * hardness) {
      const free = pick();
      [0, 1, 2].forEach((l) => { if (l !== free) addObstacle("tall", l, rowZ); });
      coinTrail(free, rowZ + 2, 3, 0.8);
    } else if (r < 0.78) {
      const blocked = pick();
      addObstacle("tall", blocked, rowZ);
      const others = [0, 1, 2].filter((l) => l !== blocked);
      if (distance > 400 && Math.random() < 0.4) addObstacle("low", others[0], rowZ);
      else if (Math.random() < 0.5) coinTrail(others[Math.floor(Math.random() * 2)], rowZ, 3, 0.8);
    } else {
      coinTrail(pick(), rowZ, 5, 0.8);
    }
    nextRowZ = rowZ - (Math.max(11, speed * 0.62) + Math.random() * 6);
  }

  function score() {
    return Math.floor(distance) + coins * COIN_POINTS;
  }

  function updateHud(force) {
    const metres = Math.floor(distance);
    if (!force && metres === shownMetres) return;
    shownMetres = metres;
    hud.metres.textContent = String(metres);
    hud.coins.textContent = String(coins);
    hud.score.textContent = String(score());
    hud.best.textContent = String(best);
    liveScoreEl.textContent = String(score());
  }

  function start() {
    phase = "playing";
    overlay.hide();
    liveScoreEl.hidden = false;
    setStatus("Running", "");
    Sound.play("tap");
  }

  function crash() {
    phase = "over";
    overAt = performance.now();
    shake = 0.5;
    vy = 7;
    onGround = false;
    Sound.play("boom");
    const final = score();
    const isBest = final > best;
    if (isBest) {
      best = final;
      Kit.writeNumber(STORAGE_KEY, best);
      setTimeout(() => Sound.play("win"), 500);
    }
    updateHud(true);
    liveScoreEl.hidden = true;
    overlay.show(
      isBest ? "New best" : "Crashed",
      `${Math.floor(distance)} m and ${coins} ${coins === 1 ? "coin" : "coins"} for ${final} points. Tap or press an arrow key to run again`,
    );
    setStatus(isBest ? `New best: ${final}` : "Crashed", isBest ? "is-win" : "is-lose");
  }

  function input(action) {
    if (phase === "over") {
      if (performance.now() - overAt > 500) reset();
      return;
    }
    if (phase === "ready") start();
    if (action === "left" || action === "right") {
      const next = Math.max(0, Math.min(2, lane + (action === "left" ? -1 : 1)));
      if (next !== lane) {
        lane = next;
        Sound.play("bounce");
      }
    } else if (action === "jump" && onGround) {
      vy = JUMP_V;
      onGround = false;
      Sound.play("flap");
    } else if (action === "drop" && !onGround) {
      vy = Math.min(vy, -16);
    }
  }

  function collide() {
    for (const o of obstacles) {
      if (Math.abs(o.z - z) > o.halfD + PLAYER / 2 - 0.08) continue;
      const ox = o.lane === "all" ? 0 : LANES[o.lane];
      if (Math.abs(x - ox) > o.halfW + PLAYER / 2 - 0.12) continue;
      if (o.kind === "tall" || y < LOW_H - 0.05) return true;
    }
    return false;
  }

  function tick(dt, now) {
    if (phase === "playing") {
      speed = Math.min(MAX_SPEED, speed + 0.28 * dt);
      z -= speed * dt;
      distance += speed * dt;
      while (nextRowZ > z - 95) spawnRow(nextRowZ);

      if (collide()) {
        crash();
      } else {
        coinList.forEach((k) => {
          if (k.taken) return;
          const near = Math.abs(k.z - z) < 0.8 && Math.abs(LANES[k.lane] - x) < 0.9 && Math.abs(y + PLAYER / 2 - k.y) < 1.0;
          if (near) {
            k.taken = true;
            k.mesh.visible = false;
            coins += 1;
            Sound.play("pop", coins % 12);
            updateHud(true);
          }
        });
        if (Math.floor(distance / 250) > milestone) {
          milestone = Math.floor(distance / 250);
          setStatus(`${milestone * 250} m`, "is-win");
          Sound.play("good");
        }
        updateHud(false);
      }
    }

    x += (LANES[lane] - x) * Math.min(1, dt * 14);
    if (!onGround) {
      vy -= GRAVITY * dt;
      y += vy * dt;
      if (y <= 0) {
        y = 0;
        vy = 0;
        onGround = true;
        squash = 1;
      }
    }

    if (phase === "over") {
      body.rotation.x += 7 * dt;
      body.rotation.z += 3 * dt;
    } else {
      body.rotation.z = (x - LANES[lane]) * 0.35;
      body.rotation.x = onGround ? 0 : -vy * 0.025;
    }
    squash = Math.max(0, squash - dt * 5);
    const bob = phase === "ready" ? Math.abs(Math.sin(now / 250)) * 0.12 : 0;
    body.scale.set(1 + squash * 0.18, 1 - squash * 0.22, 1 + squash * 0.18);
    player.position.set(x, y + PLAYER / 2 + bob, z);

    const behind = z + 12;
    obstacles = obstacles.filter((o) => {
      if (o.z > behind) {
        Kit.dispose(o.mesh);
        return false;
      }
      return true;
    });
    coinList = coinList.filter((k) => {
      if (k.z > behind) {
        Kit.dispose(k.mesh);
        return false;
      }
      k.mesh.rotation.y += dt * 4;
      return true;
    });
    tiles.forEach((tile) => {
      if (tile.position.z - TILE_LEN / 2 > z + 12) tile.position.z -= TILE_COUNT * TILE_LEN;
    });
    buildings.forEach((b) => {
      if (b.position.z > z + 14) placeBuilding(b, b.position.z - 128.8);
    });

    shake = Math.max(0, shake - dt);
    camX += (x * 0.6 - camX) * Math.min(1, dt * 6);
    const jitter = shake * 0.6;
    camera.position.set(camX + (Math.random() - 0.5) * jitter, 4.4 + (Math.random() - 0.5) * jitter, z + 7.2);
    camera.lookAt(camX * 0.5, 0.9, z - 8);
    sun.position.set(x + 5, 12, z + 4);
    sun.target.position.set(x, 0, z - 4);

    renderer.render(scene, camera);
  }

  const KEYS = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", KeyW: "jump",
    ArrowDown: "drop", KeyS: "drop",
  };
  document.addEventListener("keydown", (event) => {
    let action = KEYS[event.code];
    if (event.code === "Space" && event.target === document.body) action = "jump";
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) input(action);
  });

  let swipe = null;
  stageEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    swipe = { x: event.clientX, y: event.clientY };
  });
  stageEl.addEventListener("pointerup", (event) => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) input("jump");
    else if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? "right" : "left");
    else input(dy < 0 ? "jump" : "drop");
  });

  reset();
  Kit.loop(tick);
}
