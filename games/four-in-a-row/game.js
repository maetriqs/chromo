// By The_headphones

const ROWS = 6;
const COLS = 7;
const RED = 1;
const YELLOW = 2;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const WIN_SCORE = 1000000;

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const modeEl = document.getElementById("mode");
const scoreEls = {
  1: document.getElementById("score-1"),
  2: document.getElementById("score-2"),
  D: document.getElementById("score-d"),
};
const labelEls = { 1: document.getElementById("label-1"), 2: document.getElementById("label-2") };

let grid, turn, over, thinking, mode, colEls, slotEls, aiTimer;
let score = { 1: 0, 2: 0, D: 0 };

const vsComputer = () => mode !== "friend";

function name(player) {
  if (vsComputer()) return player === RED ? "You" : "Computer";
  return player === RED ? "Red" : "Yellow";
}

function lowestEmpty(board, c) {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][c] === 0) return r;
  return -1;
}

function winningLine(board, r, c) {
  const player = board[r][c];
  for (const [dr, dc] of DIRECTIONS) {
    const line = [[r, c]];
    for (const sign of [1, -1]) {
      let nr = r + dr * sign;
      let nc = c + dc * sign;
      while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
        line.push([nr, nc]);
        nr += dr * sign;
        nc += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

function evaluate(board) {
  let total = 0;
  for (let r = 0; r < ROWS; r++) {
    if (board[r][3] === YELLOW) total += 3;
    else if (board[r][3] === RED) total -= 3;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of DIRECTIONS) {
        const endR = r + dr * 3;
        const endC = c + dc * 3;
        if (endR < 0 || endR >= ROWS || endC < 0 || endC >= COLS) continue;
        let mine = 0;
        let theirs = 0;
        for (let k = 0; k < 4; k++) {
          const v = board[r + dr * k][c + dc * k];
          if (v === YELLOW) mine += 1;
          else if (v === RED) theirs += 1;
        }
        if (mine && theirs) continue;
        if (mine === 3) total += 6;
        else if (mine === 2) total += 2;
        if (theirs === 3) total -= 8;
        else if (theirs === 2) total -= 2;
      }
    }
  }
  return total;
}

function search(board, depth, alpha, beta, maximizing) {
  const moves = ORDER.filter((c) => board[0][c] === 0);
  if (depth === 0 || !moves.length) return evaluate(board);
  const player = maximizing ? YELLOW : RED;
  let best = maximizing ? -Infinity : Infinity;
  for (const c of moves) {
    const r = lowestEmpty(board, c);
    board[r][c] = player;
    const result = winningLine(board, r, c)
      ? (maximizing ? WIN_SCORE + depth : -WIN_SCORE - depth)
      : search(board, depth - 1, alpha, beta, !maximizing);
    board[r][c] = 0;
    if (maximizing) {
      best = Math.max(best, result);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, result);
      beta = Math.min(beta, best);
    }
    if (alpha >= beta) break;
  }
  return best;
}

function computerMove() {
  const open = ORDER.filter((c) => grid[0][c] === 0);
  if (mode === "easy" && Math.random() < 0.3) return open[Math.floor(Math.random() * open.length)];
  const depth = mode === "hard" ? 6 : 2;
  const board = grid.map((row) => [...row]);
  let bestCol = open[0];
  let bestScore = -Infinity;
  for (const c of open) {
    const r = lowestEmpty(board, c);
    board[r][c] = YELLOW;
    const result = winningLine(board, r, c) ? WIN_SCORE * 2 : search(board, depth - 1, -Infinity, Infinity, false);
    board[r][c] = 0;
    if (result > bestScore) {
      bestScore = result;
      bestCol = c;
    }
  }
  return bestCol;
}

function build() {
  boardEl.innerHTML = "";
  boardEl.classList.remove("has-winner");
  colEls = [];
  slotEls = Array.from({ length: ROWS }, () => []);
  for (let c = 0; c < COLS; c++) {
    const col = document.createElement("button");
    col.type = "button";
    col.className = "c4-col";
    col.setAttribute("aria-label", `Column ${c + 1}`);
    col.addEventListener("click", () => humanDrop(c));
    for (let r = 0; r < ROWS; r++) {
      const slot = document.createElement("span");
      slot.className = "c4-slot";
      col.appendChild(slot);
      slotEls[r][c] = slot;
    }
    boardEl.appendChild(col);
    colEls.push(col);
  }
}

function refreshColumns() {
  boardEl.dataset.turn = String(turn);
  for (let c = 0; c < COLS; c++) {
    const next = lowestEmpty(grid, c);
    colEls[c].disabled = over || next < 0;
    for (let r = 0; r < ROWS; r++) slotEls[r][c].classList.toggle("is-next", r === next);
  }
}

function humanDrop(c) {
  if (over || thinking) return;
  if (vsComputer() && turn === YELLOW) return;
  place(c);
}

function place(c) {
  const r = lowestEmpty(grid, c);
  if (r < 0) return;
  grid[r][c] = turn;

  const slot = slotEls[r][c];
  const disc = document.createElement("span");
  disc.className = `disc is-dropping${turn === YELLOW ? " p2" : ""}`;
  disc.style.setProperty("--from", `${-(slot.offsetTop + slot.offsetHeight + 16)}px`);
  disc.style.setProperty("--dur", `${260 + r * 45}ms`);
  slot.appendChild(disc);
  setTimeout(() => Sound.play("place"), 200 + r * 35);

  const line = winningLine(grid, r, c);
  if (line) {
    over = true;
    line.forEach(([lr, lc]) => slotEls[lr][lc].firstChild.classList.add("is-winning"));
    boardEl.classList.add("has-winner");
    score[turn] += 1;
    scoreEls[turn].textContent = String(score[turn]);
    const humanLost = vsComputer() && turn === YELLOW;
    setStatus(vsComputer() ? (humanLost ? "Computer wins" : "You win") : `${name(turn)} wins`, humanLost ? "is-lose" : "is-win");
    setTimeout(() => Sound.play(humanLost ? "lose" : "win"), 350);
    refreshColumns();
    return;
  }

  if (grid[0].every((v) => v !== 0)) {
    over = true;
    score.D += 1;
    scoreEls.D.textContent = String(score.D);
    setStatus("Board full. Draw", "");
    refreshColumns();
    return;
  }

  turn = turn === RED ? YELLOW : RED;
  refreshColumns();

  if (vsComputer() && turn === YELLOW) {
    thinking = true;
    setStatus("Computer is thinking", "");
    aiTimer = setTimeout(() => {
      const col = computerMove();
      thinking = false;
      place(col);
    }, 550);
  } else {
    setStatus(vsComputer() ? "Your move" : `${name(turn)} to move`, "");
  }
}

function newRound() {
  clearTimeout(aiTimer);
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  turn = RED;
  over = false;
  thinking = false;
  build();
  refreshColumns();
  setStatus(vsComputer() ? "Your move" : "Red to move", "");
}

function setMode(next) {
  mode = next;
  modeEl.querySelectorAll("button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
  });
  score = { 1: 0, 2: 0, D: 0 };
  Object.values(scoreEls).forEach((el) => { el.textContent = "0"; });
  labelEls[1].textContent = name(RED);
  labelEls[2].textContent = name(YELLOW);
  newRound();
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

modeEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-mode]");
  if (btn && btn.dataset.mode !== mode) setMode(btn.dataset.mode);
});
document.getElementById("new-round").addEventListener("click", newRound);

setMode("easy");
