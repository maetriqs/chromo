// By The_headphones

const LEVELS = {
  easy: { size: 9, mines: 10 },
  medium: { size: 12, mines: 22 },
  hard: { size: 16, mines: 40 },
};
const STORAGE_PREFIX = "chromo-mines-best-";
const FLAG_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3v14" stroke="#16213b" stroke-width="2.2" stroke-linecap="round"/><path d="M7 3.5h9l-3 3.5 3 3.5H7z" fill="#ea6546"/></svg>';
const MINE_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><g stroke="#16213b" stroke-width="2" stroke-linecap="round"><path d="M10 2.5v15M2.5 10h15M4.7 4.7l10.6 10.6M15.3 4.7L4.7 15.3"/></g><circle cx="10" cy="10" r="5" fill="#16213b"/><circle cx="8.3" cy="8.3" r="1.4" fill="#fafbfc"/></svg>';

const fieldEl = document.getElementById("field");
const statusEl = document.getElementById("status");
const minesLeftEl = document.getElementById("mines-left");
const timerEl = document.getElementById("timer");
const bestEl = document.getElementById("best");
const toolEl = document.getElementById("tool");
const levelEl = document.getElementById("level");

let level = "easy";
let tool = "dig";
let size, mineCount, cells, cellEls, started, over, flags, opened, seconds, timerId;

function readBest() {
  try {
    return Number(localStorage.getItem(STORAGE_PREFIX + level)) || null;
  } catch {
    return null;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + level, String(value));
  } catch {
    // Storage unavailable; best time isn't kept.
  }
}

function formatTime(total) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function neighbours(i) {
  const r = Math.floor(i / size);
  const c = i % size;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if ((dr || dc) && nr >= 0 && nc >= 0 && nr < size && nc < size) out.push(nr * size + nc);
    }
  }
  return out;
}

function newGame() {
  ({ size, mines: mineCount } = LEVELS[level]);
  cells = Array.from({ length: size * size }, () => ({ mine: false, open: false, flag: false, n: 0 }));
  started = false;
  over = false;
  flags = 0;
  opened = 0;
  seconds = 0;
  clearInterval(timerId);
  timerId = null;
  timerEl.textContent = "0:00";
  minesLeftEl.textContent = String(mineCount);
  const best = readBest();
  bestEl.textContent = best ? formatTime(best) : "–";
  setStatus("Dig anywhere to start", "");

  fieldEl.innerHTML = "";
  fieldEl.classList.remove("is-over");
  fieldEl.dataset.size = String(size);
  fieldEl.style.setProperty("--cols", size);
  cellEls = cells.map((_, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mine-cell";
    btn.dataset.index = String(i);
    btn.setAttribute("role", "gridcell");
    fieldEl.appendChild(btn);
    return btn;
  });
  cells.forEach((_, i) => render(i));
}

function placeMines(safe) {
  const banned = new Set([safe, ...neighbours(safe)]);
  let placed = 0;
  while (placed < mineCount) {
    const i = Math.floor(Math.random() * cells.length);
    if (cells[i].mine || banned.has(i)) continue;
    cells[i].mine = true;
    placed += 1;
  }
  cells.forEach((cell, i) => {
    cell.n = neighbours(i).filter((j) => cells[j].mine).length;
  });
}

function render(i) {
  const cell = cells[i];
  const el = cellEls[i];
  const r = Math.floor(i / size) + 1;
  const c = (i % size) + 1;
  el.classList.toggle("is-open", cell.open);
  delete el.dataset.n;
  if (cell.open && cell.mine) {
    el.innerHTML = MINE_SVG;
    el.setAttribute("aria-label", `Row ${r}, column ${c}, mine`);
  } else if (cell.open) {
    el.textContent = cell.n ? String(cell.n) : "";
    if (cell.n) el.dataset.n = String(cell.n);
    el.setAttribute("aria-label", `Row ${r}, column ${c}, ${cell.n || "no"} mines nearby`);
  } else if (cell.flag) {
    el.innerHTML = FLAG_SVG;
    el.setAttribute("aria-label", `Row ${r}, column ${c}, flagged`);
  } else {
    el.textContent = "";
    el.setAttribute("aria-label", `Row ${r}, column ${c}, covered`);
  }
}

function startTimer() {
  timerId = setInterval(() => {
    seconds += 1;
    timerEl.textContent = formatTime(seconds);
  }, 1000);
}

function dig(i) {
  const cell = cells[i];
  if (over || cell.open || cell.flag) return;
  if (!started) {
    placeMines(i);
    started = true;
    startTimer();
  }
  if (cell.mine) {
    lose(i);
    return;
  }
  const stack = [i];
  let count = 0;
  while (stack.length) {
    const j = stack.pop();
    const target = cells[j];
    if (target.open || target.flag) continue;
    target.open = true;
    opened += 1;
    count += 1;
    render(j);
    if (target.n === 0) neighbours(j).forEach((k) => { if (!cells[k].open && !cells[k].mine) stack.push(k); });
  }
  Sound.play(count > 6 ? "good" : "tap");
  if (opened === cells.length - mineCount) win();
  else if (count > 6) setStatus(`Opened ${count} squares`, "");
  else setStatus("Keep digging", "");
}

function chord(i) {
  const cell = cells[i];
  if (!cell.open || !cell.n) return;
  const around = neighbours(i);
  const flagged = around.filter((j) => cells[j].flag).length;
  if (flagged !== cell.n) {
    Sound.play("bounce");
    return;
  }
  for (const j of around) {
    if (over) return;
    if (!cells[j].open && !cells[j].flag) dig(j);
  }
}

function toggleFlag(i) {
  const cell = cells[i];
  if (over || cell.open) return;
  cell.flag = !cell.flag;
  flags += cell.flag ? 1 : -1;
  minesLeftEl.textContent = String(mineCount - flags);
  render(i);
  Sound.play("place");
}

function lose(i) {
  over = true;
  clearInterval(timerId);
  cells.forEach((cell, j) => {
    if (cell.mine && !cell.flag) {
      cell.open = true;
      render(j);
    } else if (cell.flag && !cell.mine) {
      cellEls[j].classList.add("is-wrong");
    }
  });
  cellEls[i].classList.add("is-boom");
  fieldEl.classList.add("is-over");
  Sound.play("boom");
  setStatus("Boom. Try another field", "is-lose");
}

function win() {
  over = true;
  clearInterval(timerId);
  cells.forEach((cell, j) => {
    if (cell.mine && !cell.flag) {
      cell.flag = true;
      render(j);
    }
  });
  minesLeftEl.textContent = "0";
  fieldEl.classList.add("is-over");
  Sound.play("win");
  const best = readBest();
  if (!best || seconds < best) {
    saveBest(seconds);
    bestEl.textContent = formatTime(seconds);
    setStatus(`Cleared in ${formatTime(seconds)}. New best`, "is-win");
  } else {
    setStatus(`Cleared in ${formatTime(seconds)}`, "is-win");
  }
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cssClass ? " " + cssClass : "");
}

function setPressed(group, attr, value) {
  group.querySelectorAll("button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset[attr] === value));
  });
}

fieldEl.addEventListener("click", (event) => {
  const btn = event.target.closest(".mine-cell");
  if (!btn) return;
  const i = Number(btn.dataset.index);
  if (tool === "flag" && !cells[i].open) toggleFlag(i);
  else if (cells[i].open) chord(i);
  else dig(i);
});

fieldEl.addEventListener("contextmenu", (event) => {
  const btn = event.target.closest(".mine-cell");
  if (!btn) return;
  event.preventDefault();
  toggleFlag(Number(btn.dataset.index));
});

fieldEl.addEventListener("keydown", (event) => {
  const btn = event.target.closest(".mine-cell");
  if (!btn || event.code !== "KeyF") return;
  event.preventDefault();
  toggleFlag(Number(btn.dataset.index));
});

toolEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-tool]");
  if (!btn) return;
  tool = btn.dataset.tool;
  setPressed(toolEl, "tool", tool);
});

levelEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-level]");
  if (!btn) return;
  level = btn.dataset.level;
  setPressed(levelEl, "level", level);
  newGame();
});

document.getElementById("new-game").addEventListener("click", newGame);

newGame();
