// By The_headphones

const CARDS = [
  { rank: "A", suit: "♠", name: "Ace of spades" },
  { rank: "K", suit: "♥", name: "King of hearts" },
  { rank: "Q", suit: "♦", name: "Queen of diamonds" },
  { rank: "J", suit: "♣", name: "Jack of clubs" },
  { rank: "10", suit: "♠", name: "Ten of spades" },
  { rank: "9", suit: "♥", name: "Nine of hearts" },
  { rank: "8", suit: "♦", name: "Eight of diamonds" },
  { rank: "7", suit: "♣", name: "Seven of clubs" },
];
const STORAGE_KEY = "chromo-memory-best";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const pairsEl = document.getElementById("pairs");
const bestEl = document.getElementById("best");

let deck, faceUp, pairsFound, moves, seconds, timerId, busy;

function readBest() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage unavailable (private mode); the best game isn't kept.
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function deal() {
  deck = shuffle([...CARDS, ...CARDS]).map((card) => ({ ...card, matched: false }));
  faceUp = [];
  pairsFound = 0;
  moves = 0;
  seconds = 0;
  busy = false;
  clearInterval(timerId);
  timerId = null;

  movesEl.textContent = "0";
  timerEl.textContent = "0:00";
  pairsEl.textContent = `0/${CARDS.length}`;
  const best = readBest();
  bestEl.textContent = best ? String(best) : "–";
  setStatus("Turn over two cards", "");

  boardEl.innerHTML = "";
  deck.forEach((card, index) => {
    const isRed = card.suit === "♥" || card.suit === "♦";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.setAttribute("aria-label", "Face-down card");
    btn.innerHTML = `
      <span class="card-inner">
        <span class="face face-back"></span>
        <span class="face face-front${isRed ? " is-red" : ""}" aria-hidden="true">
          <span class="corner">${card.rank}<span>${card.suit}</span></span>
          <span class="pip">${card.suit}</span>
          <span class="corner corner-bottom">${card.rank}<span>${card.suit}</span></span>
        </span>
      </span>`;
    btn.addEventListener("click", () => turnOver(index, btn));
    boardEl.appendChild(btn);
  });
}

function turnOver(index, el) {
  const card = deck[index];
  if (busy || card.matched || faceUp.some((f) => f.index === index)) return;

  if (!timerId) {
    timerId = setInterval(() => {
      seconds += 1;
      timerEl.textContent = formatTime(seconds);
    }, 1000);
  }

  el.classList.add("is-up");
  el.setAttribute("aria-label", card.name);
  faceUp.push({ index, el, card });
  if (faceUp.length < 2) {
    setStatus("Find its pair", "");
    return;
  }

  moves += 1;
  movesEl.textContent = String(moves);
  busy = true;
  const [a, b] = faceUp;

  if (a.card.name === b.card.name) {
    setTimeout(() => {
      [a, b].forEach((f) => {
        deck[f.index].matched = true;
        f.el.classList.remove("is-up");
        f.el.classList.add("is-matched");
        f.el.disabled = true;
        f.el.setAttribute("aria-label", `${f.card.name}, matched`);
      });
      pairsFound += 1;
      pairsEl.textContent = `${pairsFound}/${CARDS.length}`;
      faceUp = [];
      busy = false;
      if (pairsFound === CARDS.length) finish();
      else setStatus("Pair", "is-win");
    }, 380);
  } else {
    setStatus("No pair", "");
    setTimeout(() => {
      [a, b].forEach((f) => {
        f.el.classList.remove("is-up");
        f.el.setAttribute("aria-label", "Face-down card");
      });
      faceUp = [];
      busy = false;
    }, 800);
  }
}

function finish() {
  clearInterval(timerId);
  const best = readBest();
  if (!best || moves < best) {
    saveBest(moves);
    bestEl.textContent = String(moves);
    setStatus(`Cleared in ${moves} moves. New best`, "is-win");
  } else {
    setStatus(`Cleared in ${moves} moves, ${formatTime(seconds)}`, "is-win");
  }
}

function formatTime(total) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

document.getElementById("restart").addEventListener("click", deal);

deal();
