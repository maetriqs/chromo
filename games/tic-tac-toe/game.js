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
const modeEl = document.getElementById("mode");
const scoreEls = {
  X: document.getElementById("score-x"),
  O: document.getElementById("score-o"),
  D: document.getElementById("score-d"),
};
const labelEls = { X: document.getElementById("label-x"), O: document.getElementById("label-o") };

let cells, current, roundOver, thinking, mode, aiTimer;
let score = { X: 0, O: 0, D: 0 };

const vsComputer = () => mode !== "friend";

function findWin(board) {
  return WIN_LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) || null;
}

function emptyIndexes(board) {
  return board.flatMap((v, i) => (v ? [] : [i]));
}

function minimax(board, player) {
  const line = findWin(board);
  if (line) return { score: board[line[0]] === "O" ? 10 : -10 };
  const empty = emptyIndexes(board);
  if (!empty.length) return { score: 0 };
  let best = { score: player === "O" ? -Infinity : Infinity, index: empty[0] };
  for (const i of empty) {
    board[i] = player;
    const result = minimax(board, player === "O" ? "X" : "O");
    board[i] = null;
    // Prefer quicker wins and slower losses so the computer plays with purpose.
    const adjusted = result.score > 0 ? result.score - 1 : result.score < 0 ? result.score + 1 : 0;
    if ((player === "O" && adjusted > best.score) || (player === "X" && adjusted < best.score)) {
      best = { score: adjusted, index: i };
    }
  }
  return best;
}

function computerMove() {
  const empty = emptyIndexes(cells);
  if (mode === "hard") return minimax([...cells], "O").index;
  for (const who of ["O", "X"]) {
    if (who === "X" && Math.random() < 0.5) continue;
    for (const i of empty) {
      const trial = [...cells];
      trial[i] = who;
      if (findWin(trial)) return i;
    }
  }
  return empty[Math.floor(Math.random() * empty.length)];
}

function buildBoard() {
  boardEl.innerHTML = "";
  boardEl.classList.remove("has-winner");
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ttt-cell";
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}, empty`);
    btn.addEventListener("click", () => humanPlay(i));
    boardEl.appendChild(btn);
  }
}

function humanPlay(index) {
  if (thinking || (vsComputer() && current === "O")) return;
  play(index);
}

function play(index) {
  if (roundOver || cells[index]) return;

  cells[index] = current;
  const cellEl = boardEl.children[index];
  cellEl.dataset.mark = current;
  cellEl.innerHTML = MARK_SVG[current];
  cellEl.disabled = true;
  cellEl.setAttribute("aria-label", `Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}, ${current}`);
  Sound.play("place");

  const winningLine = findWin(cells);
  if (winningLine) {
    winningLine.forEach((i) => boardEl.children[i].classList.add("is-winning"));
    boardEl.classList.add("has-winner");
    const computerWon = vsComputer() && current === "O";
    const message = vsComputer() ? (computerWon ? "Computer wins" : "You win") : `${current} wins`;
    endRound(current, message, computerWon ? "is-lose" : "is-win");
    setTimeout(() => Sound.play(computerWon ? "lose" : "win"), 250);
    return;
  }

  if (cells.every(Boolean)) {
    endRound("D", "Draw", "");
    setTimeout(() => Sound.play("tap"), 250);
    return;
  }

  current = current === "X" ? "O" : "X";

  if (vsComputer() && current === "O") {
    thinking = true;
    setStatus("Computer's turn", "");
    aiTimer = setTimeout(() => {
      thinking = false;
      play(computerMove());
    }, 450);
  } else {
    setStatus(vsComputer() ? "Your move" : `${current} to move`, "");
  }
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
  clearTimeout(aiTimer);
  cells = Array(9).fill(null);
  current = "X";
  roundOver = false;
  thinking = false;
  buildBoard();
  setStatus(vsComputer() ? "Your move" : "X to move", "");
}

function resetScore() {
  score = { X: 0, O: 0, D: 0 };
  Object.values(scoreEls).forEach((el) => { el.textContent = "0"; });
  newRound();
}

function setMode(next) {
  mode = next;
  modeEl.querySelectorAll("button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
  });
  labelEls.X.textContent = vsComputer() ? "You" : "X";
  labelEls.O.textContent = vsComputer() ? "Computer" : "O";
  resetScore();
}

modeEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-mode]");
  if (btn && btn.dataset.mode !== mode) setMode(btn.dataset.mode);
});
document.getElementById("reset-round").addEventListener("click", newRound);
document.getElementById("reset-score").addEventListener("click", resetScore);

setMode("easy");
