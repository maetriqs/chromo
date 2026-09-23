// By The_headphones

const SYMBOLS = ["♠", "♥", "♦", "♣", "★", "●", "▲", "◆"];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const pairsEl = document.getElementById("pairs");
const restartBtn = document.getElementById("restart");

let deck, flipped, matchedCount, moves, timerInterval, elapsedSeconds, isChecking, started;

function init() {
  deck = shuffle([...SYMBOLS, ...SYMBOLS]).map((symbol, index) => ({ id: index, symbol, matched: false }));
  flipped = [];
  matchedCount = 0;
  moves = 0;
  elapsedSeconds = 0;
  isChecking = false;
  started = false;

  clearInterval(timerInterval);
  timerInterval = null;

  movesEl.textContent = "0";
  timerEl.textContent = "0:00";
  pairsEl.textContent = `0 / ${SYMBOLS.length}`;
  setStatus("Flip two cards to begin", "");

  buildBoard();
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildBoard() {
  boardEl.innerHTML = "";
  deck.forEach((card) => {
    const btn = document.createElement("button");
    btn.className = "memory-card";
    btn.setAttribute("aria-label", "Hidden card");
    btn.dataset.id = String(card.id);
    btn.innerHTML = `
      <span class="memory-card-inner">
        <span class="memory-face memory-face-back"></span>
        <span class="memory-face memory-face-front">${card.symbol}</span>
      </span>
    `;
    btn.addEventListener("click", () => onCardClick(card.id, btn));
    boardEl.appendChild(btn);
  });
}

function onCardClick(id, el) {
  if (isChecking) return;
  const card = deck.find((c) => c.id === id);
  if (!card || card.matched || flipped.some((f) => f.id === id)) return;

  if (!started) {
    started = true;
    startTimer();
  }

  el.classList.add("is-flipped");
  flipped.push({ id, el, symbol: card.symbol });

  if (flipped.length === 2) {
    moves += 1;
    movesEl.textContent = String(moves);
    isChecking = true;

    const [a, b] = flipped;
    if (a.symbol === b.symbol) {
      setTimeout(() => {
        deck.find((c) => c.id === a.id).matched = true;
        deck.find((c) => c.id === b.id).matched = true;
        a.el.classList.add("is-matched");
        b.el.classList.add("is-matched");
        matchedCount += 1;
        pairsEl.textContent = `${matchedCount} / ${SYMBOLS.length}`;
        flipped = [];
        isChecking = false;

        if (matchedCount === SYMBOLS.length) {
          clearInterval(timerInterval);
          setStatus(`Cleared in ${moves} moves — ${formatTime(elapsedSeconds)}.`, "is-win");
        } else {
          setStatus("Match!", "");
        }
      }, 350);
    } else {
      setStatus("No match — try again", "");
      setTimeout(() => {
        a.el.classList.remove("is-flipped");
        b.el.classList.remove("is-flipped");
        flipped = [];
        isChecking = false;
      }, 700);
    }
  }
}

function startTimer() {
  timerInterval = setInterval(() => {
    elapsedSeconds += 1;
    timerEl.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status-line" + (cssClass ? " " + cssClass : "");
}

restartBtn.addEventListener("click", init);

init();
