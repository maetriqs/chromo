// By The_headphones

const N = 5;
const STORAGE_KEY = "chromo-lights-puzzle";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const puzzleEl = document.getElementById("puzzle");
const movesEl = document.getElementById("moves");
const parEl = document.getElementById("par");
const nextBtn = document.getElementById("next");

let puzzle, par, start, lamps, moves, solved;

function readPuzzle() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 1;
  } catch {
    return 1;
  }
}

function savePuzzle(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage unavailable; progress lasts for this visit only.
  }
}

function toggleAround(state, i) {
  const r = Math.floor(i / N);
  const c = i % N;
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nc >= 0 && nr < N && nc < N) state[nr * N + nc] = !state[nr * N + nc];
  });
}

function generate() {
  // Built by pressing random lamps on a dark board, so every puzzle is solvable.
  const presses = Math.min(2 + puzzle, 14);
  const state = Array(N * N).fill(false);
  const chosen = new Set();
  while (chosen.size < presses) chosen.add(Math.floor(Math.random() * N * N));
  chosen.forEach((i) => toggleAround(state, i));
  if (!state.some(Boolean)) return generate();
  par = presses;
  start = state;
}

function build() {
  boardEl.innerHTML = "";
  for (let i = 0; i < N * N; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lamp";
    btn.setAttribute("role", "gridcell");
    btn.addEventListener("click", () => press(i));
    boardEl.appendChild(btn);
  }
}

function render() {
  Array.from(boardEl.children).forEach((btn, i) => {
    btn.classList.toggle("is-on", lamps[i]);
    btn.setAttribute("aria-label", `Row ${Math.floor(i / N) + 1}, column ${(i % N) + 1}, ${lamps[i] ? "lit" : "dark"}`);
    btn.disabled = solved;
  });
  boardEl.classList.toggle("is-solved", solved);
  movesEl.textContent = String(moves);
}

function press(i) {
  if (solved) return;
  toggleAround(lamps, i);
  moves += 1;
  const lit = lamps.filter(Boolean).length;
  Sound.play("pop", 25 - lit);
  if (lit === 0) {
    solved = true;
    nextBtn.disabled = false;
    savePuzzle(puzzle + 1);
    Sound.play("win");
    const diff = moves - par;
    const verdict = diff < 0 ? `${-diff} under par` : diff === 0 ? "on par" : `${diff} over par`;
    setStatus(`Lights out in ${moves}, ${verdict}`, "is-win");
    nextBtn.focus();
  } else {
    setStatus(`${lit} ${lit === 1 ? "lamp" : "lamps"} still lit`, "");
  }
  render();
}

function loadPuzzle() {
  puzzleEl.textContent = String(puzzle);
  generate();
  parEl.textContent = String(par);
  restart();
}

function restart() {
  lamps = [...start];
  moves = 0;
  solved = false;
  nextBtn.disabled = true;
  setStatus("Switch every lamp off", "");
  render();
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

nextBtn.addEventListener("click", () => {
  puzzle += 1;
  loadPuzzle();
});
document.getElementById("restart").addEventListener("click", () => {
  if (solved) return;
  restart();
  Sound.play("tap");
});

puzzle = readPuzzle();
build();
loadPuzzle();
