// By The_headphones

const GRID = 20;
const CELL = 20;
const BOARD = GRID * CELL;
const START_MS = 130;
const MIN_MS = 65;
const SPEEDUP_MS = 3;
const STORAGE_KEY = "chromo-snake-best";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const pauseBtn = document.getElementById("pause");

const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = BOARD * dpr;
canvas.height = BOARD * dpr;
ctx.scale(dpr, dpr);

const css = getComputedStyle(document.documentElement);
const COLORS = {
  paper: css.getPropertyValue("--paper").trim(),
  ink: css.getPropertyValue("--ink").trim(),
  inkSoft: css.getPropertyValue("--ink-soft").trim(),
  dot: css.getPropertyValue("--ground-deep").trim(),
  food: css.getPropertyValue("--tomato").trim(),
  star: css.getPropertyValue("--mustard").trim(),
};
const BONUS_TICKS = 45;

let snake, direction, pendingDirection, food, score, best, tickMs, running, paused, gameOver, lastTick;
let bonus, grow, eaten;

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
    // Storage unavailable (private mode); best score lasts for this visit only.
  }
}

function init() {
  snake = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  pendingDirection = direction;
  score = 0;
  tickMs = START_MS;
  running = false;
  paused = false;
  gameOver = false;
  lastTick = 0;
  bonus = null;
  grow = 0;
  eaten = 0;
  best = Math.max(best || 0, readBest());
  placeFood();
  updateHud();
  pauseBtn.textContent = "Pause";
  setStatus("Ready", "");
  draw();
  drawMessage("Ready", "Press an arrow key or swipe to start");
}

function freeCell() {
  let cell;
  do {
    cell = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (
    snake.some((s) => s.x === cell.x && s.y === cell.y) ||
    (food && food.x === cell.x && food.y === cell.y) ||
    (bonus && bonus.x === cell.x && bonus.y === cell.y)
  );
  return cell;
}

function placeFood() {
  food = null;
  food = freeCell();
}

function loop(timestamp) {
  requestAnimationFrame(loop);
  if (!running || paused || gameOver) return;
  if (timestamp - lastTick < tickMs) return;
  lastTick = timestamp;
  step();
}

function step() {
  direction = pendingDirection;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  const hitsWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
  const eats = head.x === food.x && head.y === food.y;
  const eatsBonus = bonus && head.x === bonus.x && head.y === bonus.y;
  const growing = eats || eatsBonus || grow > 0;
  // The tail moves out of the way this tick unless the snake is growing.
  const body = growing ? snake : snake.slice(0, -1);
  const hitsSelf = body.some((s) => s.x === head.x && s.y === head.y);

  if (hitsWall || hitsSelf) {
    endGame();
    return;
  }

  snake.unshift(head);
  if (eats) {
    score += 1;
    eaten += 1;
    placeFood();
    if (eaten % 4 === 0 && !bonus) bonus = { ...freeCell(), ticks: BONUS_TICKS };
    setStatus("Playing", "");
    Sound.play("pop", eaten);
  } else if (eatsBonus) {
    score += 3;
    grow += 2;
    bonus = null;
    setStatus("Star! +3", "is-win");
    Sound.play("good");
  } else if (grow > 0) {
    grow -= 1;
  } else {
    snake.pop();
  }
  if (eats || eatsBonus) {
    tickMs = Math.max(MIN_MS, START_MS - score * SPEEDUP_MS);
    updateHud();
  }
  if (bonus) {
    bonus.ticks -= 1;
    if (bonus.ticks <= 0) bonus = null;
  }
  draw();
}

function drawStar(cx, cy, radius) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function endGame() {
  gameOver = true;
  running = false;
  const isNewBest = score > best;
  if (isNewBest) {
    best = score;
    saveBest(best);
  }
  updateHud();
  draw();
  Sound.play("lose");
  if (isNewBest) setTimeout(() => Sound.play("win"), 450);
  if (isNewBest) {
    setStatus(`New best: ${score}`, "is-win");
    drawMessage("New best", `${score} ${score === 1 ? "point" : "points"}. Press an arrow key to go again.`);
  } else {
    setStatus("Game over", "is-lose");
    drawMessage("Game over", `${score} ${score === 1 ? "point" : "points"}. Press an arrow key to go again.`);
  }
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function draw() {
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, BOARD, BOARD);

  ctx.fillStyle = COLORS.dot;
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      ctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);
    }
  }

  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL * 0.34, 0, Math.PI * 2);
  ctx.fill();

  if (bonus && (bonus.ticks > 12 || bonus.ticks % 2 === 0)) {
    ctx.fillStyle = COLORS.star;
    drawStar(bonus.x * CELL + CELL / 2, bonus.y * CELL + CELL / 2, CELL * 0.62);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.ink;
  snake.forEach((s) => {
    roundedRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2, 5);
    ctx.fill();
  });

  const head = snake[0];
  const hx = head.x * CELL + CELL / 2;
  const hy = head.y * CELL + CELL / 2;
  ctx.fillStyle = COLORS.paper;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.arc(hx + direction.x * 3 + direction.y * 4 * side, hy + direction.y * 3 + direction.x * 4 * side, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawMessage(title, detail) {
  ctx.fillStyle = COLORS.paper;
  ctx.globalAlpha = 0.78;
  ctx.fillRect(0, 0, BOARD, BOARD);
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.ink;
  ctx.font = '900 64px "Big Shoulders Display", "Arial Narrow", Arial, sans-serif';
  ctx.fillText(title.toUpperCase(), BOARD / 2, BOARD / 2 - 14);
  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = '700 14px "Atkinson Hyperlegible", Arial, sans-serif';
  ctx.fillText(detail, BOARD / 2, BOARD / 2 + 34);
}

function updateHud() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

function steer(x, y) {
  if (gameOver) init();
  if (paused) return;
  // Reversing straight into the neck is always fatal, so ignore it.
  if (x === -direction.x && y === -direction.y) return;
  pendingDirection = { x, y };
  if (!running) {
    running = true;
    setStatus("Playing", "");
    Sound.play("tap");
    draw();
  }
}

function togglePause() {
  if (!running || gameOver) return;
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  setStatus(paused ? "Paused" : "Playing", "");
  draw();
  if (paused) drawMessage("Paused", "Press Space or Resume to carry on");
}

const KEY_MAP = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    togglePause();
    return;
  }
  const mapped = KEY_MAP[event.code];
  if (mapped) {
    event.preventDefault();
    steer(mapped[0], mapped[1]);
  }
});

let swipeStart = null;
canvas.addEventListener("pointerdown", (event) => {
  swipeStart = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", (event) => {
  if (!swipeStart) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) steer(Math.sign(dx), 0);
  else steer(0, Math.sign(dy));
});

document.getElementById("restart").addEventListener("click", init);
pauseBtn.addEventListener("click", togglePause);

init();
requestAnimationFrame(loop);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (!running && !gameOver) {
      draw();
      drawMessage("Ready", "Press an arrow key or swipe to start");
    }
  });
}
