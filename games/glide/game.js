// By The_headphones

const W = 400;
const H = 560;
const GROUND = 40;
const PLANE_X = 110;
const PLANE_R = 11;
const GRAVITY = 1300;
const FLAP = -400;
const MAX_FALL = 620;
const PILLAR_W = 62;
const SPACING = 225;
const STORAGE_KEY = "chromo-glide-best";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");

const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.scale(dpr, dpr);

const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(`--${name}`).trim();
const COLORS = {
  sky: token("lilac-pale"),
  cloud: token("paper"),
  ink: token("ink"),
  inkSoft: token("ink-soft"),
  rim: token("lilac"),
  plane: token("tomato"),
};

let phase, planeY, planeVY, pillars, score, best, time, overAt, shake, groundOffset;
let newBest = false;
let clouds = [
  { x: 60, y: 90, s: 1 },
  { x: 250, y: 170, s: 0.7 },
  { x: 330, y: 60, s: 0.85 },
  { x: 150, y: 300, s: 0.6 },
];
let puffs = [];

function readBest() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage unavailable; best score lasts for this visit only.
  }
}

function gapSize() {
  return Math.max(128, 185 - score * 2.5);
}

function speed() {
  return Math.min(270, 150 + score * 4);
}

function reset() {
  phase = "ready";
  planeY = H * 0.42;
  planeVY = 0;
  pillars = [];
  score = 0;
  time = 0;
  shake = 0;
  groundOffset = 0;
  best = Math.max(best || 0, readBest());
  updateHud();
  setStatus("Ready", "");
}

function spawnPillar(x) {
  const gap = gapSize();
  const minY = 70 + gap / 2;
  const maxY = H - GROUND - 50 - gap / 2;
  pillars.push({ x, gapY: minY + Math.random() * (maxY - minY), gap, passed: false });
}

function flap() {
  if (phase === "over") {
    if (performance.now() - overAt > 450) reset();
    return;
  }
  if (phase === "ready") {
    phase = "playing";
    setStatus("Flying", "");
    spawnPillar(W + 60);
  }
  planeVY = FLAP;
  for (let i = 0; i < 4; i++) {
    puffs.push({ x: PLANE_X - 12, y: planeY + 4, vx: -60 - Math.random() * 60, vy: (Math.random() - 0.3) * 60, life: 0.5 });
  }
  Sound.play("flap");
}

function crash() {
  phase = "over";
  overAt = performance.now();
  shake = 0.35;
  newBest = score > best;
  if (newBest) {
    best = score;
    saveBest(best);
  }
  updateHud();
  Sound.play("lose");
  if (newBest) setTimeout(() => Sound.play("win"), 450);
  setStatus(newBest ? `New best: ${score}` : "Crashed", newBest ? "is-win" : "is-lose");
}

function hitsRect(x, y, w, h) {
  const cx = Math.max(x, Math.min(PLANE_X, x + w));
  const cy = Math.max(y, Math.min(planeY, y + h));
  const dx = PLANE_X - cx;
  const dy = planeY - cy;
  return dx * dx + dy * dy < PLANE_R * PLANE_R;
}

function update(dt) {
  time += dt;
  const drift = phase === "playing" ? speed() : 50;
  clouds.forEach((c) => {
    c.x -= drift * 0.25 * c.s * dt;
    if (c.x < -80) {
      c.x = W + 60;
      c.y = 40 + Math.random() * 300;
    }
  });
  puffs = puffs.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    return p.life > 0;
  });
  shake = Math.max(0, shake - dt);

  if (phase === "ready") {
    planeY = H * 0.42 + Math.sin(time * 3) * 8;
    groundOffset = (groundOffset + drift * dt) % 40;
    return;
  }

  if (phase === "over") {
    if (planeY < H - GROUND - PLANE_R) {
      planeVY = Math.min(planeVY + GRAVITY * dt, MAX_FALL);
      planeY = Math.min(planeY + planeVY * dt, H - GROUND - PLANE_R);
    }
    return;
  }

  groundOffset = (groundOffset + drift * dt) % 40;
  planeVY = Math.min(planeVY + GRAVITY * dt, MAX_FALL);
  planeY += planeVY * dt;
  if (planeY < PLANE_R) {
    planeY = PLANE_R;
    planeVY = 0;
  }

  pillars.forEach((p) => { p.x -= drift * dt; });
  const lastPillar = pillars[pillars.length - 1];
  if (lastPillar && lastPillar.x < W - SPACING) spawnPillar(lastPillar.x + SPACING);
  pillars = pillars.filter((p) => p.x > -PILLAR_W - 10);

  for (const p of pillars) {
    if (!p.passed && p.x + PILLAR_W < PLANE_X - PLANE_R) {
      p.passed = true;
      score += 1;
      updateHud();
      if (score % 10 === 0) Sound.play("good");
      else Sound.play("pop", score % 12);
    }
    const top = p.gapY - p.gap / 2;
    const bottom = p.gapY + p.gap / 2;
    if (hitsRect(p.x, 0, PILLAR_W, top) || hitsRect(p.x, bottom, PILLAR_W, H)) {
      crash();
      return;
    }
  }

  if (planeY + PLANE_R >= H - GROUND) {
    planeY = H - GROUND - PLANE_R;
    crash();
  }
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawPlane() {
  const tilt = Math.max(-0.45, Math.min(1.1, planeVY / 500));
  ctx.save();
  ctx.translate(PLANE_X, planeY);
  ctx.rotate(phase === "ready" ? Math.sin(time * 3) * 0.08 : tilt);
  ctx.fillStyle = COLORS.plane;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-16, -13);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-16, 13);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-9, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 12 * shake, (Math.random() - 0.5) * 12 * shake);
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(-10, -10, W + 20, H + 20);

  ctx.fillStyle = COLORS.cloud;
  clouds.forEach((c) => {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 46 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 22 * c.s, c.y - 10 * c.s, 26 * c.s, 14 * c.s, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  pillars.forEach((p) => {
    const top = p.gapY - p.gap / 2;
    const bottom = p.gapY + p.gap / 2;
    ctx.fillStyle = COLORS.ink;
    roundedRect(p.x, -6, PILLAR_W, top + 6, 5);
    ctx.fill();
    roundedRect(p.x, bottom, PILLAR_W, H - GROUND - bottom + 6, 5);
    ctx.fill();
    ctx.fillStyle = COLORS.rim;
    ctx.fillRect(p.x + 6, top - 10, PILLAR_W - 12, 4);
    ctx.fillRect(p.x + 6, bottom + 6, PILLAR_W - 12, 4);
  });

  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, H - GROUND, W, GROUND);
  ctx.fillStyle = COLORS.rim;
  for (let x = -groundOffset; x < W; x += 40) ctx.fillRect(x, H - GROUND + 10, 20, 4);

  puffs.forEach((p) => {
    ctx.globalAlpha = p.life * 1.6;
    ctx.fillStyle = COLORS.cloud;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  drawPlane();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (phase !== "ready") {
    ctx.font = '900 72px "Big Shoulders Display", "Arial Narrow", Arial, sans-serif';
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = COLORS.cloud;
    ctx.strokeText(String(score), W / 2, 64);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(String(score), W / 2, 64);
  }

  if (phase === "ready") {
    ctx.fillStyle = COLORS.ink;
    ctx.font = '900 56px "Big Shoulders Display", "Arial Narrow", Arial, sans-serif';
    ctx.fillText("GLIDE", W / 2, H * 0.6);
    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '700 14px "Atkinson Hyperlegible", Arial, sans-serif';
    ctx.fillText("Tap, click or press Space to take off", W / 2, H * 0.6 + 40);
  } else if (phase === "over") {
    ctx.fillStyle = COLORS.cloud;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.ink;
    ctx.font = '900 56px "Big Shoulders Display", "Arial Narrow", Arial, sans-serif';
    ctx.fillText(newBest ? "NEW BEST" : "CRASHED", W / 2, H * 0.44);
    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = '700 14px "Atkinson Hyperlegible", Arial, sans-serif';
    ctx.fillText(`${score} ${score === 1 ? "gap" : "gaps"} · best ${best}`, W / 2, H * 0.44 + 42);
    ctx.fillText("Tap or press Space to fly again", W / 2, H * 0.44 + 66);
  }
}

function updateHud() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  flap();
});
document.addEventListener("keydown", (event) => {
  if ((event.code === "Space" && event.target === document.body) || event.code === "ArrowUp" || event.code === "KeyW") {
    event.preventDefault();
    if (!event.repeat) flap();
  }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
