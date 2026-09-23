// By The_headphones

const BLOCK_H = 0.5;
const BASE = 3;
const RANGE = 4.6;
const PERFECT = 0.12;
const GROW = 0.25;
const FRUSTUM = 11;
const STORAGE_KEY = "chromo-stack-best";

const stageEl = document.getElementById("stage");
const statusEl = document.getElementById("status");
const liveScoreEl = document.getElementById("live-score");
const scoreEl = document.getElementById("score");
const streakEl = document.getElementById("streak");
const bestEl = document.getElementById("best");
const overlay = Kit.overlay(stageEl);

const camera = window.THREE ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200) : null;
if (camera) camera.userData.frustum = FRUSTUM;
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
  const palette = ["tomato", "mustard", "lime", "sea", "sky", "lilac", "pink"].map(Kit.color);
  const paper = Kit.color("paper");
  const ink = Kit.color("ink");
  const sun = Kit.addLights(scene, 9);

  const plinth = Kit.box(BASE, 12, BASE, ink);
  plinth.position.y = -6;
  scene.add(plinth);

  let blocks = [];
  let moving = null;
  let debris = [];
  let rings = [];
  let phase = "ready";
  let score = 0;
  let streak = 0;
  let best = Kit.readNumber(STORAGE_KEY);
  let camY = 0;
  let zoom = 1;
  let overAt = 0;

  function colorFor(index) {
    const t = index * 0.14;
    const i = Math.floor(t) % palette.length;
    return palette[i].clone().lerp(palette[(i + 1) % palette.length], t - Math.floor(t));
  }

  function addBlock(w, d, x, y, z, index) {
    const mesh = Kit.box(w, BLOCK_H, d, colorFor(index));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  function reset() {
    [...blocks, ...debris].forEach((b) => Kit.dispose(b.mesh));
    rings.forEach((r) => Kit.dispose(r.mesh));
    if (moving) Kit.dispose(moving.mesh);
    blocks = [{ x: 0, z: 0, w: BASE, d: BASE, y: BLOCK_H / 2 }];
    blocks[0].mesh = addBlock(BASE, BASE, 0, BLOCK_H / 2, 0, 0);
    debris = [];
    rings = [];
    score = 0;
    streak = 0;
    phase = "ready";
    zoom = 1;
    updateHud();
    liveScoreEl.hidden = true;
    overlay.show("Stack", "Tap, click or press Space to drop each block");
    setStatus("Ready", "");
    spawnMoving();
  }

  function spawnMoving() {
    const top = blocks[blocks.length - 1];
    const axis = blocks.length % 2 === 1 ? "x" : "z";
    moving = { axis, w: top.w, d: top.d, x: top.x, z: top.z, y: top.y + BLOCK_H, dir: 1 };
    moving[axis] = top[axis] - RANGE;
    moving.speed = Math.min(3.4 + blocks.length * 0.08, 8);
    moving.mesh = addBlock(moving.w, moving.d, moving.x, moving.y, moving.z, blocks.length);
  }

  function drop() {
    if (phase === "over") {
      if (performance.now() - overAt > 500) reset();
      return;
    }
    if (!moving) return;
    if (phase === "ready") {
      phase = "playing";
      overlay.hide();
      liveScoreEl.hidden = false;
      setStatus("Building", "");
    }

    const top = blocks[blocks.length - 1];
    const { axis } = moving;
    const size = axis === "x" ? moving.w : moving.d;
    let delta = moving[axis] - top[axis];
    let overlap = size - Math.abs(delta);

    if (overlap <= 0) {
      debris.push({ mesh: moving.mesh, vy: 0, spin: (Math.random() - 0.5) * 4 });
      moving = null;
      gameOver();
      return;
    }

    const perfect = Math.abs(delta) < PERFECT;
    let center;
    if (perfect) {
      streak += 1;
      delta = 0;
      overlap = size;
      if (streak >= 3) overlap = Math.min(BASE, size + GROW);
      center = top[axis];
      Sound.play("pop", streak);
    } else {
      streak = 0;
      center = top[axis] + delta / 2;
      const cut = Math.abs(delta);
      const piece = { w: moving.w, d: moving.d, x: moving.x, z: moving.z };
      piece[axis === "x" ? "w" : "d"] = cut;
      piece[axis] = center + Math.sign(delta) * (overlap / 2 + cut / 2);
      const mesh = addBlock(piece.w, piece.d, piece.x, moving.y, piece.z, blocks.length);
      debris.push({ mesh, vy: 0, spin: Math.sign(delta) * (1 + Math.random() * 2), axis });
      Sound.play("place");
    }

    const placed = { w: moving.w, d: moving.d, x: moving.x, z: moving.z, y: moving.y };
    placed[axis === "x" ? "w" : "d"] = overlap;
    placed[axis] = center;
    Kit.dispose(moving.mesh);
    placed.mesh = addBlock(placed.w, placed.d, placed.x, placed.y, placed.z, blocks.length);
    blocks.push(placed);

    if (perfect) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(placed.w + 0.12, 0.02, placed.d + 0.12)),
        new THREE.LineBasicMaterial({ color: ink, transparent: true }),
      );
      edges.position.set(placed.x, placed.y + BLOCK_H / 2 + 0.01, placed.z);
      scene.add(edges);
      rings.push({ mesh: edges, life: 0.5 });
    }

    score += 1;
    updateHud();
    if (perfect && streak >= 3) setStatus(`${streak} perfect in a row`, "is-win");
    else if (perfect) setStatus("Perfect", "is-win");
    else setStatus("Building", "");
    moving = null;
    spawnMoving();
  }

  function gameOver() {
    phase = "over";
    overAt = performance.now();
    const isBest = score > best;
    if (isBest) {
      best = score;
      Kit.writeNumber(STORAGE_KEY, best);
    }
    updateHud();
    Sound.play("lose");
    if (isBest) setTimeout(() => Sound.play("win"), 450);
    liveScoreEl.hidden = true;
    overlay.show(
      isBest ? "New best" : `Height ${score}`,
      `${isBest ? `Height ${score}. ` : `Best ${best}. `}Tap or press Space to build again`,
    );
    setStatus(isBest ? `New best: ${score}` : "Tower finished", isBest ? "is-win" : "is-lose");
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    liveScoreEl.textContent = String(score);
    streakEl.textContent = String(streak);
    bestEl.textContent = String(best);
  }

  function tick(dt) {
    if (moving) {
      const top = blocks[blocks.length - 1];
      const { axis } = moving;
      moving[axis] += moving.dir * moving.speed * dt;
      if (moving[axis] > top[axis] + RANGE) {
        moving[axis] = top[axis] + RANGE;
        moving.dir = -1;
      } else if (moving[axis] < top[axis] - RANGE) {
        moving[axis] = top[axis] - RANGE;
        moving.dir = 1;
      }
      moving.mesh.position.set(moving.x, moving.y, moving.z);
    }

    debris = debris.filter((piece) => {
      piece.vy -= 18 * dt;
      piece.mesh.position.y += piece.vy * dt;
      if (piece.axis === "z") piece.mesh.rotation.x += piece.spin * dt;
      else piece.mesh.rotation.z -= piece.spin * dt;
      if (piece.mesh.position.y < camY - 25) {
        Kit.dispose(piece.mesh);
        return false;
      }
      return true;
    });

    rings = rings.filter((ring) => {
      ring.life -= dt;
      const t = 1 - ring.life / 0.5;
      ring.mesh.scale.set(1 + t * 0.35, 1, 1 + t * 0.35);
      ring.mesh.material.opacity = Math.max(0, 1 - t);
      if (ring.life <= 0) {
        Kit.dispose(ring.mesh);
        return false;
      }
      return true;
    });

    const height = blocks[blocks.length - 1].y;
    const targetY = phase === "over" ? height / 2 : height;
    const targetZoom = phase === "over" ? Math.min(1, FRUSTUM / (height + 8)) : 1;
    camY += (targetY - camY) * Math.min(1, dt * 3);
    zoom += (targetZoom - zoom) * Math.min(1, dt * 2);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.position.set(10, camY + 10, 10);
    camera.lookAt(0, camY, 0);

    sun.position.set(6, camY + 12, 4);
    sun.target.position.set(0, camY, 0);

    scene.background = paper.clone().lerp(colorFor(blocks.length), 0.16);
    renderer.render(scene, camera);
  }

  stageEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    drop();
  });
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && event.target === document.body) {
      event.preventDefault();
      if (!event.repeat) drop();
    }
  });

  reset();
  Kit.loop(tick);
}
