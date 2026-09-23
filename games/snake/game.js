// By The_headphones

const GRID_SIZE = 20;
const CELL = 20;
const START_SPEED_MS = 130;
const MIN_SPEED_MS = 65;
const SPEEDUP_PER_FOOD = 3;
const STORAGE_KEY = "chromo-snake-best";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const restartBtn = document.getElementById("restart");
const pauseBtn = document.getElementById("pause");

const COLORS = {
  bg: "#0b0c0e",
  grid: "#16181c",
  snake: "#7ac97e",
  snakeHead: "#a6e6ac",
  food: "#ff8a3d",
};

let snake, direction, pendingDirection, food, score, best, tickMs, running, paused, gameOver, lastTick, rafId;

function init() {
  snake = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  pendingDirection = direction;
  score = 0;
  tickMs = START_SPEED_MS;
  running = false;
  paused = false;
  gameOver = false;
  lastTick = 0;
  best = Number(localStorage.getItem(STORAGE_KEY) || 0);
  placeFood();
  updateHud();
  setStatus("Press an arrow key to start", "");
  pauseBtn.textContent = "Pause";
  draw();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function placeFood() {
  let cell;
  do {
    cell = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
  } while (snake.some((s) => s.x === cell.x && s.y === cell.y));
  food = cell;
}

function loop(timestamp) {
  rafId = requestAnimationFrame(loop);
  if (!running || paused || gameOver) return;
  if (timestamp - lastTick < tickMs) return;
  lastTick = timestamp;
  step();
}

function step() {
  direction = pendingDirection;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  if (head.x < 0 || head.y < 0 || head.x >= GRID_SIZE || head.y >= GRID_SIZE || snakeCollides(head)) {
    endGame();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 1;
    tickMs = Math.max(MIN_SPEED_MS, START_SPEED_MS - score * SPEEDUP_PER_FOOD);
    placeFood();
    updateHud();
  } else {
    snake.pop();
  }

  draw();
}

function snakeCollides(point) {
  return snake.some((s) => s.x === point.x && s.y === point.y);
}

function endGame() {
  gameOver = true;
  running = false;
  if (score > best) {
    best = score;
    localStorage.setItem(STORAGE_KEY, String(best));
  }
  updateHud();
  setStatus(`Game over — score ${score}. Press Restart.`, "is-danger");
}

function draw() {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL + 0.5, 0);
    ctx.lineTo(i * CELL + 0.5, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL + 0.5);
    ctx.lineTo(canvas.width, i * CELL + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.food;
  ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);

  snake.forEach((segment, i) => {
    ctx.fillStyle = i === 0 ? COLORS.snakeHead : COLORS.snake;
    ctx.fillRect(segment.x * CELL + 1, segment.y * CELL + 1, CELL - 2, CELL - 2);
  });
}

function updateHud() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status-line" + (cssClass ? " " + cssClass : "");
}

function setDirection(x, y) {
  if (gameOver) return;
  // Ignore reversal into the snake's own body.
  if (snake.length > 1 && x === -direction.x && y === -direction.y) return;
  pendingDirection = { x, y };
  if (!running) {
    running = true;
    setStatus("Go!", "");
  }
}

function togglePause() {
  if (!running || gameOver) return;
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  setStatus(paused ? "Paused" : "Go!", "");
}

const KEY_MAP = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    togglePause();
    return;
  }
  const mapped = KEY_MAP[event.code];
  if (mapped) {
    event.preventDefault();
    setDirection(mapped[0], mapped[1]);
  }
});

restartBtn.addEventListener("click", init);
pauseBtn.addEventListener("click", togglePause);

init();
