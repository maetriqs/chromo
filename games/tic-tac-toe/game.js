// By The_headphones

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const scoreXEl = document.getElementById("score-x");
const scoreOEl = document.getElementById("score-o");
const scoreDEl = document.getElementById("score-d");

let cells = Array(9).fill(null);
let current = "X";
let roundOver = false;
let score = { X: 0, O: 0, D: 0 };

function buildBoard() {
  boardEl.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.className = "ttt-cell";
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", `Cell ${i + 1}`);
    btn.dataset.index = String(i);
    btn.addEventListener("click", onCellClick);
    boardEl.appendChild(btn);
  }
}

function onCellClick(event) {
  const index = Number(event.currentTarget.dataset.index);
  if (roundOver || cells[index]) return;

  cells[index] = current;
  render();

  const winningLine = findWinningLine();
  if (winningLine) {
    roundOver = true;
    score[current] += 1;
    updateScoreboard();
    setStatus(`${current} wins!`, "is-win");
    highlightLine(winningLine);
    return;
  }

  if (cells.every(Boolean)) {
    roundOver = true;
    score.D += 1;
    updateScoreboard();
    setStatus("Draw.", "");
    return;
  }

  current = current === "X" ? "O" : "X";
  setStatus(`${current}'s turn`, "");
}

function findWinningLine() {
  return WIN_LINES.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) || null;
}

function highlightLine(line) {
  line.forEach((i) => {
    boardEl.children[i].classList.add("is-winning");
  });
}

function render() {
  Array.from(boardEl.children).forEach((cellEl, i) => {
    const mark = cells[i];
    cellEl.textContent = mark || "";
    if (mark) {
      cellEl.dataset.mark = mark;
      cellEl.disabled = true;
    } else {
      delete cellEl.dataset.mark;
      cellEl.disabled = roundOver;
    }
  });
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status-line" + (cssClass ? " " + cssClass : "");
}

function updateScoreboard() {
  scoreXEl.textContent = String(score.X);
  scoreOEl.textContent = String(score.O);
  scoreDEl.textContent = String(score.D);
}

function newRound() {
  cells = Array(9).fill(null);
  current = "X";
  roundOver = false;
  buildBoard();
  render();
  setStatus("X's turn", "");
}

function resetScore() {
  score = { X: 0, O: 0, D: 0 };
  updateScoreboard();
  newRound();
}

document.getElementById("reset-round").addEventListener("click", newRound);
document.getElementById("reset-score").addEventListener("click", resetScore);

newRound();
