// By The_headphones

const W = 420;
const H = 540;
const COLS = 8;
const ROWS = 6;
const SIDE = 14;
const TOP = 56;
const GAP = 6;
const BRICK_W = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;
const BRICK_H = 18;
const PADDLE_Y = H - 40;
const PADDLE_H = 12;
const PADDLE_W = 78;
const WIDE_W = 128;
const BALL_R = 7;
const MAX_ANGLE = (62 * Math.PI) / 180;
const STORAGE_KEY = "chromo-bricks-best";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const pauseBtn = document.getElementById("pause");
const hud = {
  score: document.getElementById("score"),
  best: document.getElementById("best"),
  lives: document.getElementById("lives"),
  level: document.getElementById("level"),
};

const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.scale(dpr, dpr);

const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(`--${name}`).trim();
const COLORS = {
  paper: token("paper"),
  ink: token("ink"),
  inkSoft: token("ink-soft"),
  capsule: token("mustard"),
  rows: ["tomato", "mustard", "sea", "sky", "pink", "lilac"].map(token),
};

let bricks, paddle, ball, speed, lives, score, best, level, combo;
let particles, floaters, capsules, shake, phase, message;
const keys = { left: false, right: false };
let pointerX = null;

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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function maxSpeed() {
  return Math.min(560, 420 + level * 20);
}

function layout(lvl) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let present = true;
      let hits = 1;
      if (lvl === 2) {
        hits = r < 2 ? 2 : 1;
      } else if (lvl === 3) {
        present = (r + c) % 3 !== 0;
        hits = r < 3 ? 2 : 1;
      } else if (lvl >= 4) {
        present = Math.random() < 0.8;
        hits = r < 2 ? 2 : 1;
        if (lvl >= 6 && r === 0) hits = 3;
      }
      if (present) {
        out.push({ x: SIDE + c * (BRICK_W + GAP), y: TOP + r * (BRICK_H + GAP), r, hits, maxHits: hits, alive: true });
      }
    }
  }
  return out.length ? out : layout(1);
}

function newGame() {
  score = 0;
  lives = 3;
  level = 1;
  best = Math.max(best || 0, readBest());
  particles = [];
  floaters = [];
  shake = 0;
  paddle = { x: W / 2, w: PADDLE_W, wideUntil: 0 };
  setupLevel();
  message = { title: "Bricks", detail: "Click, tap or press Space to launch" };
  setStatus("Ready", "");
  pauseBtn.textContent = "Pause";
  updateHud();
}

function setupLevel() {
  bricks = layout(level);
  capsules = [];
  speed = Math.min(300 + (level - 1) * 30, 480);
  paddle.wideUntil = 0;
  resetBall();
}

function resetBall() {
  ball = { x: paddle.x, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0 };
  combo = 0;
  phase = "ready";
}

function launch() {
  const angle = (Math.random() - 0.5) * 0.7;
  ball.vx = speed * Math.sin(angle);
  ball.vy = -speed * Math.cos(angle);
  phase = "playing";
  message = null;
  setStatus(`Level ${level}`, "");
  Sound.play("tap");
}

function action() {
  if (phase === "ready") launch();
  else if (phase === "over") newGame();
  else if (phase === "paused") togglePause();
}

function togglePause() {
  if (phase === "playing") {
    phase = "paused";
    pauseBtn.textContent = "Resume";
    setStatus("Paused", "");
  } else if (phase === "paused") {
    phase = "playing";
    pauseBtn.textContent = "Pause";
    setStatus(`Level ${level}`, "");
  }
}

function update(dt, now) {
  if (phase === "paused" || phase === "over") return;

  if (keys.left || keys.right) {
    pointerX = null;
    paddle.x += ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 560 * dt;
  } else if (pointerX !== null) {
    paddle.x += (pointerX - paddle.x) * Math.min(1, dt * 25);
  }
  const targetW = paddle.wideUntil > now ? WIDE_W : PADDLE_W;
  paddle.w += (targetW - paddle.w) * Math.min(1, dt * 10);
  paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

  if (phase === "ready") {
    ball.x = paddle.x;
    ball.y = PADDLE_Y - BALL_R - 1;
  } else {
    const steps = Math.ceil((speed * dt) / 4);
    for (let i = 0; i < steps && phase === "playing"; i++) moveBall(dt / steps, now);
  }

  capsules = capsules.filter((cap) => {
    cap.y += 130 * dt;
    const caught = cap.y + 7 >= PADDLE_Y && cap.y - 7 <= PADDLE_Y + PADDLE_H && Math.abs(cap.x - paddle.x) <= paddle.w / 2 + 13;
    if (caught) {
      paddle.wideUntil = now + 12000;
      floaters.push({ x: cap.x, y: PADDLE_Y - 20, text: "Wide paddle", life: 1.2 });
      Sound.play("good");
      return false;
    }
    return cap.y < H + 10;
  });

  particles = particles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 600 * dt;
    p.life -= dt;
    return p.life > 0;
  });
  floaters = floaters.filter((f) => {
    f.y -= 40 * dt;
    f.life -= dt;
    return f.life > 0;
  });
  shake = Math.max(0, shake - dt);
}

function moveBall(t, now) {
  ball.x += ball.vx * t;
  ball.y += ball.vy * t;

  if (ball.x < BALL_R) {
    ball.x = BALL_R;
    ball.vx = Math.abs(ball.vx);
    Sound.play("bounce");
  } else if (ball.x > W - BALL_R) {
    ball.x = W - BALL_R;
    ball.vx = -Math.abs(ball.vx);
    Sound.play("bounce");
  }
  if (ball.y < BALL_R) {
    ball.y = BALL_R;
    ball.vy = Math.abs(ball.vy);
    Sound.play("bounce");
  }

  const onPaddle =
    ball.vy > 0 &&
    ball.y + BALL_R >= PADDLE_Y &&
    ball.y + BALL_R <= PADDLE_Y + PADDLE_H + 6 &&
    Math.abs(ball.x - paddle.x) <= paddle.w / 2 + BALL_R;
  if (onPaddle) {
    const rel = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1);
    speed = Math.min(speed + 4, maxSpeed());
    ball.vx = speed * Math.sin(rel * MAX_ANGLE);
    ball.vy = -speed * Math.cos(rel * MAX_ANGLE);
    ball.y = PADDLE_Y - BALL_R;
    combo = 0;
    Sound.play("bounce");
  }

  if (ball.y - BALL_R > H) {
    loseBall();
    return;
  }

  for (const b of bricks) {
    if (!b.alive) continue;
    const cx = clamp(ball.x, b.x, b.x + BRICK_W);
    const cy = clamp(ball.y, b.y, b.y + BRICK_H);
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
    if (Math.abs(dx) > Math.abs(dy)) ball.vx = Math.sign(dx) * Math.abs(ball.vx);
    else if (dy !== 0) ball.vy = Math.sign(dy) * Math.abs(ball.vy);
    else ball.vy = -ball.vy;
    hitBrick(b, now);
    break;
  }
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 260,
      vy: -Math.random() * 200,
      life: 0.4 + Math.random() * 0.4,
      color,
    });
  }
}

function hitBrick(b) {
  const color = COLORS.rows[b.r % COLORS.rows.length];
  const cx = b.x + BRICK_W / 2;
  const cy = b.y + BRICK_H / 2;
  b.hits -= 1;
  if (b.hits > 0) {
    burst(cx, cy, COLORS.ink, 4);
    Sound.play("bounce");
    return;
  }
  b.alive = false;
  combo += 1;
  const points = 10 * combo;
  score += points;
  floaters.push({ x: cx, y: b.y, text: `+${points}`, life: 0.8 });
  burst(cx, cy, color, 12);
  Sound.play("pop", combo);
  if (Math.random() < 0.12) capsules.push({ x: cx, y: cy });
  updateHud();
  if (!bricks.some((brick) => brick.alive)) clearLevel();
}

function clearLevel() {
  level += 1;
  const bonus = lives < 5;
  lives = Math.min(lives + 1, 5);
  Sound.play("win");
  setupLevel();
  message = { title: `Level ${level}`, detail: bonus ? "Extra ball! Click or press Space to launch" : "Click or press Space to launch" };
  setStatus(`Level ${level}`, "is-win");
  updateHud();
}

function loseBall() {
  lives -= 1;
  shake = 0.35;
  capsules = [];
  paddle.wideUntil = 0;
  Sound.play("lose");
  updateHud();
  if (lives <= 0) {
    gameOver();
    return;
  }
  resetBall();
  message = { title: lives === 1 ? "Last ball" : `${lives} balls left`, detail: "Click or press Space to launch" };
  setStatus("Ball lost", "is-lose");
}

function gameOver() {
  phase = "over";
  const isBest = score > best;
  if (isBest) {
    best = score;
    saveBest(best);
    Sound.play("win");
  }
  updateHud();
  message = {
    title: isBest ? "New best" : "Game over",
    detail: `${score} points. Click or press Space to play again`,
    wash: true,
  };
  setStatus(isBest ? `New best: ${score}` : "Game over", isBest ? "is-win" : "is-lose");
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function draw() {
  ctx.save();
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, W, H);
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);

  bricks.forEach((b) => {
    if (!b.alive) return;
    ctx.fillStyle = COLORS.rows[b.r % COLORS.rows.length];
    roundedRect(b.x, b.y, BRICK_W, BRICK_H, 3);
    ctx.fill();
    if (b.hits > 1) {
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2;
      roundedRect(b.x + 3, b.y + 3, BRICK_W - 6, BRICK_H - 6, 2);
      ctx.stroke();
    }
    if (b.hits > 2) {
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(b.x + BRICK_W / 2 - 1, b.y + 5, 2, BRICK_H - 10);
    }
  });

  capsules.forEach((cap) => {
    ctx.fillStyle = COLORS.capsule;
    roundedRect(cap.x - 13, cap.y - 7, 26, 14, 7);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = COLORS.ink;
  roundedRect(paddle.x - paddle.w / 2, PADDLE_Y, paddle.w, PADDLE_H, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  particles.forEach((p) => {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
  });
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '800 18px "Big Shoulders Display", "Arial Narrow", Arial, sans-serif';
  floaters.forEach((f) => {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  if (phase === "paused") drawMessage({ title: "Paused", detail: "Press P or Resume to carry on", wash: true });
  else if (message && phase !== "playing") drawMessage(message);
}

function drawMessage({ title, detail, wash }) {
  const y = wash ? H / 2 : 340;
  if (wash) {
    ctx.fillStyle = COLORS.paper;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.ink;
  ctx.font = '900 56px "Big Shoulders Display", "Arial Narrow", Arial, sans-serif';
  ctx.fillText(title.toUpperCase(), W / 2, y - 12);
  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = '700 14px "Atkinson Hyperlegible", Arial, sans-serif';
  ctx.fillText(detail, W / 2, y + 30);
}

function updateHud() {
  hud.score.textContent = String(score);
  hud.best.textContent = String(best);
  hud.lives.textContent = String(Math.max(0, lives));
  hud.level.textContent = String(level);
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

function toCanvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (W / rect.width);
}

canvas.addEventListener("pointermove", (event) => {
  pointerX = toCanvasX(event.clientX);
});
canvas.addEventListener("pointerdown", (event) => {
  pointerX = toCanvasX(event.clientX);
  action();
});

const KEY_DIR = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };

document.addEventListener("keydown", (event) => {
  if (KEY_DIR[event.code]) {
    event.preventDefault();
    keys[KEY_DIR[event.code]] = true;
  } else if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    action();
  } else if (event.code === "KeyP") {
    togglePause();
  }
});
document.addEventListener("keyup", (event) => {
  if (KEY_DIR[event.code]) keys[KEY_DIR[event.code]] = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && phase === "playing") togglePause();
});

document.getElementById("restart").addEventListener("click", newGame);
pauseBtn.addEventListener("click", togglePause);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt, now);
  draw();
  requestAnimationFrame(frame);
}

newGame();
requestAnimationFrame(frame);
