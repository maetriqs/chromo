// By The_headphones

const SIZE = 4;
const STORAGE_KEY = "chromo-2048-best";
const VECTORS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const KEYS = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const undoBtn = document.getElementById("undo");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayPrimary = document.getElementById("overlay-primary");
const overlaySecondary = document.getElementById("overlay-secondary");

let grid, score, best, won, over, snapshot;
let overlayAction = null;

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

for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.style.setProperty("--r", r);
    slot.style.setProperty("--c", c);
    boardEl.insertBefore(slot, overlay);
  }
}

function setPosition(el, r, c) {
  el.style.setProperty("--r", r);
  el.style.setProperty("--c", c);
}

function makeTile(value, r, c, kind) {
  const el = document.createElement("div");
  el.className = "tile" + (kind ? ` is-${kind}` : "");
  el.dataset.value = value > 2048 ? "big" : String(value);
  el.dataset.digits = String(String(value).length);
  const inner = document.createElement("div");
  inner.className = "tile-inner";
  inner.textContent = String(value);
  el.appendChild(inner);
  setPosition(el, r, c);
  boardEl.insertBefore(el, overlay);
  return { value, el };
}

function emptyCells() {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) out.push([r, c]);
  return out;
}

function spawn() {
  const empty = emptyCells();
  if (!empty.length) return;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  grid[r][c] = makeTile(Math.random() < 0.9 ? 2 : 4, r, c, "new");
}

function clearTiles() {
  boardEl.querySelectorAll(".tile").forEach((el) => el.remove());
}

function loadValues(values) {
  clearTiles();
  grid = values.map((row, r) => row.map((v, c) => (v ? makeTile(v, r, c) : null)));
}

function newGame() {
  clearTiles();
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  score = 0;
  won = false;
  over = false;
  snapshot = null;
  best = Math.max(best || 0, readBest());
  undoBtn.disabled = true;
  hideOverlay();
  spawn();
  spawn();
  updateScore(0);
  setStatus("Slide to start", "");
}

function values() {
  return grid.map((row) => row.map((t) => (t ? t.value : 0)));
}

function move(dir) {
  if (over || !overlay.hidden) return;
  const [dr, dc] = VECTORS[dir];
  const before = { values: values(), score, won };
  const rows = [0, 1, 2, 3];
  const cols = [0, 1, 2, 3];
  if (dr === 1) rows.reverse();
  if (dc === 1) cols.reverse();

  const mergedThisTurn = new Set();
  const doomed = [];
  let moved = false;
  let gained = 0;
  let biggestMerge = 0;

  for (const r of rows) {
    for (const c of cols) {
      const tile = grid[r][c];
      if (!tile) continue;
      let nr = r;
      let nc = c;
      let mergedInto = null;
      while (true) {
        const tr = nr + dr;
        const tc = nc + dc;
        if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
        const other = grid[tr][tc];
        if (!other) {
          nr = tr;
          nc = tc;
          continue;
        }
        if (other.value === tile.value && !mergedThisTurn.has(other)) mergedInto = [tr, tc, other];
        break;
      }

      if (mergedInto) {
        const [tr, tc, other] = mergedInto;
        grid[r][c] = null;
        setPosition(tile.el, tr, tc);
        doomed.push(tile.el, other.el);
        const merged = makeTile(tile.value * 2, tr, tc, "merged");
        grid[tr][tc] = merged;
        mergedThisTurn.add(merged);
        gained += merged.value;
        biggestMerge = Math.max(biggestMerge, merged.value);
        moved = true;
      } else if (nr !== r || nc !== c) {
        grid[r][c] = null;
        grid[nr][nc] = tile;
        setPosition(tile.el, nr, nc);
        moved = true;
      }
    }
  }

  if (!moved) return;

  snapshot = before;
  undoBtn.disabled = false;
  setTimeout(() => doomed.forEach((el) => el.remove()), 120);
  spawn();
  score += gained;
  updateScore(gained);

  if (biggestMerge) Sound.play("pop", Math.log2(biggestMerge));
  else Sound.play("tap");

  const top = Math.max(...values().flat());
  setStatus(`Top tile ${top}`, "");

  if (!won && top >= 2048) {
    won = true;
    Sound.play("win");
    showOverlay("You made 2048", "Keep going", () => hideOverlay(), "New game", newGame);
  } else if (!canMove()) {
    over = true;
    Sound.play("lose");
    setStatus("No moves left", "is-lose");
    showOverlay("No moves left", "New game", newGame, "Undo last move", undo);
  }
}

function canMove() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c] ? grid[r][c].value : 0;
      if (!v) return true;
      if (c < SIZE - 1 && grid[r][c + 1] && grid[r][c + 1].value === v) return true;
      if (r < SIZE - 1 && grid[r + 1][c] && grid[r + 1][c].value === v) return true;
    }
  }
  return false;
}

function undo() {
  if (!snapshot) return;
  loadValues(snapshot.values);
  score = snapshot.score;
  won = snapshot.won;
  over = false;
  snapshot = null;
  undoBtn.disabled = true;
  hideOverlay();
  updateScore(0);
  setStatus("Move taken back", "");
  Sound.play("tap");
}

function updateScore(gained) {
  scoreEl.textContent = String(score);
  if (score > best) {
    best = score;
    saveBest(best);
  }
  bestEl.textContent = String(best);
  if (gained > 0) {
    const bump = document.createElement("span");
    bump.className = "bump";
    bump.textContent = `+${gained}`;
    scoreEl.parentElement.appendChild(bump);
    setTimeout(() => bump.remove(), 700);
  }
}

function showOverlay(title, primaryLabel, primaryAction, secondaryLabel, secondaryAction) {
  overlayTitle.textContent = title;
  overlayPrimary.textContent = primaryLabel;
  overlaySecondary.textContent = secondaryLabel;
  overlayAction = { primary: primaryAction, secondary: secondaryAction };
  overlay.hidden = false;
  overlayPrimary.focus();
}

function hideOverlay() {
  overlay.hidden = true;
  overlayAction = null;
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

overlayPrimary.addEventListener("click", () => overlayAction && overlayAction.primary());
overlaySecondary.addEventListener("click", () => overlayAction && overlayAction.secondary());
document.getElementById("new-game").addEventListener("click", newGame);
undoBtn.addEventListener("click", undo);

document.addEventListener("keydown", (event) => {
  const dir = KEYS[event.code];
  if (!dir) return;
  event.preventDefault();
  move(dir);
});

let swipeStart = null;
boardEl.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  swipeStart = { x: event.clientX, y: event.clientY };
});
boardEl.addEventListener("pointerup", (event) => {
  if (!swipeStart) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
  else move(dy > 0 ? "down" : "up");
});

newGame();
