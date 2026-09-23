// Self-playing previews on the home shelf. By The_headphones

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function rand(n) {
  return Math.floor(Math.random() * n);
}

function setup(canvas) {
  const size = Number(canvas.dataset.size);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(canvas);
  return {
    ctx,
    size,
    ink: css.getPropertyValue("--ink").trim(),
    paper: css.getPropertyValue("--paper").trim(),
    red: css.getPropertyValue("--suit-red").trim(),
  };
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function run(demo, interval, preroll) {
  for (let i = 0; i < preroll; i++) demo.step();
  demo.draw();
  if (reduceMotion) return;
  setInterval(() => {
    demo.step();
    demo.draw();
  }, interval);
}

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function ticTacToeDemo(canvas) {
  const { ctx, size, ink, paper } = setup(canvas);
  let cells, turn, hold, winLine;

  function reset() {
    cells = Array(9).fill(null);
    turn = "X";
    hold = 0;
    winLine = null;
  }

  function findWin(board) {
    return WIN_LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) || null;
  }

  function pickMove() {
    const empty = cells.flatMap((v, i) => (v ? [] : [i]));
    const other = turn === "X" ? "O" : "X";
    for (const who of [turn, other]) {
      for (const i of empty) {
        const trial = [...cells];
        trial[i] = who;
        if (findWin(trial)) return i;
      }
    }
    return empty[rand(empty.length)];
  }

  function step() {
    if (hold > 0) {
      hold -= 1;
      if (hold === 0) reset();
      return;
    }
    cells[pickMove()] = turn;
    winLine = findWin(cells);
    if (winLine || cells.every(Boolean)) {
      hold = 4;
      return;
    }
    turn = turn === "X" ? "O" : "X";
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function center(i, pad, cell) {
    return [pad + cell * (i % 3) + cell / 2, pad + cell * Math.floor(i / 3) + cell / 2];
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const pad = size * 0.05;
    const cell = (size - pad * 2) / 3;
    ctx.lineCap = "round";
    ctx.lineWidth = size * 0.028;
    ctx.strokeStyle = ink;
    for (let i = 1; i < 3; i++) {
      line(pad + cell * i, pad, pad + cell * i, size - pad);
      line(pad, pad + cell * i, size - pad, pad + cell * i);
    }
    ctx.lineWidth = size * 0.04;
    cells.forEach((mark, i) => {
      const [cx, cy] = center(i, pad, cell);
      const r = cell * 0.27;
      if (mark === "X") {
        ctx.strokeStyle = ink;
        line(cx - r, cy - r, cx + r, cy + r);
        line(cx + r, cy - r, cx - r, cy + r);
      } else if (mark === "O") {
        ctx.strokeStyle = paper;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    if (winLine) {
      const [x1, y1] = center(winLine[0], pad, cell);
      const [x2, y2] = center(winLine[2], pad, cell);
      ctx.strokeStyle = ink;
      ctx.lineWidth = size * 0.022;
      line(x1, y1, x2, y2);
    }
  }

  reset();
  run({ step, draw }, 650, 5);
}

function snakeDemo(canvas) {
  const { ctx, size, ink, paper } = setup(canvas);
  const N = 12;
  let snake, dir, food;

  function reset() {
    snake = [5, 4, 3, 2, 1].map((x) => ({ x, y: 7 }));
    dir = { x: 1, y: 0 };
    placeFood();
  }

  function occupied(p) {
    return snake.some((s) => s.x === p.x && s.y === p.y);
  }

  function placeFood() {
    do {
      food = { x: rand(N), y: rand(N) };
    } while (occupied(food));
  }

  function safe(p) {
    if (p.x < 0 || p.y < 0 || p.x >= N || p.y >= N) return false;
    return !snake.slice(0, -1).some((s) => s.x === p.x && s.y === p.y);
  }

  function distance(p) {
    return Math.abs(p.x - food.x) + Math.abs(p.y - food.y);
  }

  function step() {
    const head = snake[0];
    const options = [dir, { x: dir.y, y: -dir.x }, { x: -dir.y, y: dir.x }]
      .map((d) => ({ d, p: { x: head.x + d.x, y: head.y + d.y } }))
      .filter((o) => safe(o.p))
      .sort((a, b) => distance(a.p) - distance(b.p));

    if (!options.length || snake.length > 28) {
      reset();
      return;
    }

    const choice = Math.random() < 0.85 ? options[0] : options[options.length - 1];
    dir = choice.d;
    snake.unshift(choice.p);
    if (choice.p.x === food.x && choice.p.y === food.y) placeFood();
    else snake.pop();
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const cell = size / N;

    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.22;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        ctx.beginPath();
        ctx.arc(x * cell + cell / 2, y * cell + cell / 2, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ink;
    snake.forEach((s) => {
      roundedRect(ctx, s.x * cell + 1.5, s.y * cell + 1.5, cell - 3, cell - 3, cell * 0.25);
      ctx.fill();
    });

    const head = snake[0];
    ctx.fillStyle = paper;
    const hx = head.x * cell + cell / 2;
    const hy = head.y * cell + cell / 2;
    const off = cell * 0.18;
    const fwd = cell * 0.12;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(hx + dir.x * fwd + dir.y * off * side, hy + dir.y * fwd + dir.x * off * side, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  reset();
  run({ step, draw }, 140, 6);
}

function memoryDemo(canvas) {
  const { ctx, size, ink, paper, red } = setup(canvas);
  const FACES = ["A♠", "K♥", "Q♦", "J♣", "10♠", "9♥", "8♦", "7♣"];
  let deck, hold;

  function reset() {
    deck = [...FACES, ...FACES]
      .map((face) => ({ face, state: "down", order: Math.random() }))
      .sort((a, b) => a.order - b.order);
    hold = 0;
  }

  function step() {
    const up = deck.filter((c) => c.state === "up");
    if (up.length === 2) {
      const next = up[0].face === up[1].face ? "matched" : "down";
      up.forEach((c) => { c.state = next; });
      return;
    }
    const hidden = deck.filter((c) => c.state === "down");
    if (!hidden.length) {
      hold += 1;
      if (hold > 3) reset();
      return;
    }
    const a = hidden[rand(hidden.length)];
    const others = hidden.filter((c) => c !== a);
    const twin = others.find((c) => c.face === a.face);
    const b = twin && Math.random() < 0.45 ? twin : others[rand(others.length)];
    a.state = "up";
    b.state = "up";
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const gap = size * 0.04;
    const cellH = (size - gap * 3) / 4;
    const cardW = cellH * 0.74;
    const offsetX = (size - (cardW * 4 + gap * 3)) / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(cellH * 0.3)}px "Atkinson Hyperlegible", Arial, sans-serif`;

    deck.forEach((card, i) => {
      const x = offsetX + (i % 4) * (cardW + gap);
      const y = Math.floor(i / 4) * (cellH + gap);
      ctx.globalAlpha = card.state === "matched" ? 0.4 : 1;
      ctx.fillStyle = card.state === "down" ? ink : paper;
      roundedRect(ctx, x, y, cardW, cellH, 3);
      ctx.fill();
      if (card.state !== "down") {
        ctx.fillStyle = /[♥♦]/.test(card.face) ? red : ink;
        ctx.fillText(card.face, x + cardW / 2, y + cellH / 2);
      }
    });
    ctx.globalAlpha = 1;
  }

  reset();
  run({ step, draw }, 850, 7);
}

const DEMOS = { ttt: ticTacToeDemo, snake: snakeDemo, memory: memoryDemo };

function startDemos() {
  document.querySelectorAll("canvas[data-demo]").forEach((canvas) => {
    DEMOS[canvas.dataset.demo](canvas);
  });
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(startDemos);
else startDemos();
