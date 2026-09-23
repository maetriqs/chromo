// By The_headphones

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const MARK_SVG = {
  X: '<svg viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M18 18 L82 82"/><path pathLength="1" d="M82 18 L18 82"/></svg>',
  O: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle pathLength="1" cx="50" cy="50" r="34" transform="rotate(-90 50 50)"/></svg>',
};

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const scoreEls = {
  X: document.getElementById("score-x"),
  O: document.getElementById("score-o"),
  D: document.getElementById("score-d"),
};

let cells, current, roundOver;
let score = { X: 0, O: 0, D: 0 };

function buildBoard() {
  boardEl.innerHTML = "";
  boardEl.classList.remove("has-winner");
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ttt-cell";
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}, empty`);
    btn.addEventListener("click", () => play(i));
    boardEl.appendChild(btn);
  }
}

function play(index) {
  if (roundOver || cells[index]) return;

  cells[index] = current;
  const cellEl = boardEl.children[index];
  cellEl.dataset.mark = current;
  cellEl.innerHTML = MARK_SVG[current];
  cellEl.disabled = true;
  cellEl.setAttribute("aria-label", `Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}, ${current}`);

  const winningLine = WIN_LINES.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[a] === cells[c]);
  if (winningLine) {
    winningLine.forEach((i) => boardEl.children[i].classList.add("is-winning"));
    boardEl.classList.add("has-winner");
    endRound(current, `${current} wins`, "is-win");
    return;
  }

  if (cells.every(Boolean)) {
    endRound("D", "Draw", "");
    return;
  }

  current = current === "X" ? "O" : "X";
  setStatus(`${current} to move`, "");
}

function endRound(scoreKey, message, cssClass) {
  roundOver = true;
  score[scoreKey] += 1;
  scoreEls[scoreKey].textContent = String(score[scoreKey]);
  Array.from(boardEl.children).forEach((cellEl) => { cellEl.disabled = true; });
  setStatus(message, cssClass);
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

function newRound() {
  cells = Array(9).fill(null);
  current = "X";
  roundOver = false;
  buildBoard();
  setStatus("X to move", "");
}

function resetScore() {
  score = { X: 0, O: 0, D: 0 };
  Object.values(scoreEls).forEach((el) => { el.textContent = "0"; });
  newRound();
}

document.getElementById("reset-round").addEventListener("click", newRound);
document.getElementById("reset-score").addEventListener("click", resetScore);

newRound();
