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
  const color = (name) => css.getPropertyValue(`--${name}`).trim();
  return {
    ctx,
    size,
    color,
    ink: color("ink"),
    paper: color("paper"),
    red: color("suit-red"),
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

function fourDemo(canvas) {
  const { ctx, size, ink, color } = setup(canvas);
  const ROWS = 6;
  const COLS = 7;
  const discColors = [color("tomato"), color("mustard")];
  const hole = color("box");
  let grid, turn, count;

  function reset() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    turn = 0;
    count = 0;
  }

  function step() {
    if (count >= 22) {
      reset();
      return;
    }
    const open = [];
    for (let c = 0; c < COLS; c++) if (grid[0][c] === -1) open.push(c);
    const weighted = open.flatMap((c) => (Math.abs(c - 3) <= 1 ? [c, c] : [c]));
    const col = weighted[rand(weighted.length)];
    let r = ROWS - 1;
    while (grid[r][col] !== -1) r -= 1;
    grid[r][col] = turn;
    turn = 1 - turn;
    count += 1;
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const pad = size * 0.04;
    const cell = (size - pad * 2) / COLS;
    const boardH = cell * ROWS + pad * 2;
    const top = (size - boardH) / 2;
    ctx.fillStyle = ink;
    roundedRect(ctx, 0, top, size, boardH, 6);
    ctx.fill();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        ctx.fillStyle = v === -1 ? hole : discColors[v];
        ctx.beginPath();
        ctx.arc(pad + c * cell + cell / 2, top + pad + r * cell + cell / 2, cell * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  reset();
  run({ step, draw }, 520, 9);
}

function bricksDemo(canvas) {
  const { ctx, size, ink, paper } = setup(canvas);
  const COLS = 7;
  const ROWS = 4;
  const bw = size / COLS;
  const bh = size * 0.06;
  let bricks, ball, paddleX;

  function reset() {
    bricks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bricks.push({ r, c, alive: true });
    ball = { x: size / 2, y: size * 0.7, vx: size * 0.011, vy: -size * 0.014 };
    paddleX = size / 2;
  }

  function step() {
    for (let i = 0; i < 3; i++) {
      ball.x += ball.vx;
      ball.y += ball.vy;
      const r = size * 0.025;
      if (ball.x < r || ball.x > size - r) ball.vx *= -1;
      if (ball.y < r) ball.vy = Math.abs(ball.vy);
      const paddleY = size * 0.9;
      if (ball.vy > 0 && ball.y + r >= paddleY && ball.y < paddleY + 4) {
        ball.vy = -Math.abs(ball.vy);
        ball.vx = (ball.x - paddleX) * 0.08 + (Math.random() - 0.5) * 1.5;
      }
      if (ball.y > size) reset();
      const top = size * 0.08;
      const row = Math.floor((ball.y - top) / bh);
      const col = Math.floor(ball.x / bw);
      const hit = bricks.find((b) => b.alive && b.r === row && b.c === col);
      if (hit) {
        hit.alive = false;
        ball.vy *= -1;
      }
    }
    paddleX += (ball.x - paddleX) * 0.5;
    if (!bricks.some((b) => b.alive)) reset();
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const top = size * 0.08;
    bricks.forEach((b) => {
      if (!b.alive) return;
      ctx.fillStyle = b.r % 2 ? paper : ink;
      roundedRect(ctx, b.c * bw + 2, top + b.r * bh + 2, bw - 4, bh - 4, 2);
      ctx.fill();
    });
    ctx.fillStyle = ink;
    const pw = size * 0.24;
    roundedRect(ctx, paddleX - pw / 2, size * 0.9, pw, size * 0.035, 4);
    ctx.fill();
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, size * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }

  reset();
  run({ step, draw }, 33, 40);
}

function glideDemo(canvas) {
  const { ctx, size, ink, paper, color } = setup(canvas);
  const planeColor = color("tomato");
  const gapH = size * 0.42;
  let y, vy, pillars, tick;

  function reset() {
    y = size / 2;
    vy = 0;
    tick = 0;
    pillars = [0, 1, 2].map((i) => ({ x: size * 0.7 + i * size * 0.55, gap: size * (0.3 + Math.random() * 0.4) }));
  }

  function step() {
    tick += 1;
    vy += size * 0.0016;
    y += vy;
    const next = pillars
      .filter((p) => p.x + size * 0.14 > size * 0.2)
      .reduce((a, b) => (b.x < a.x ? b : a));
    if (y > next.gap + gapH * 0.1 && vy > 0) vy = -size * 0.014;
    pillars.forEach((p) => {
      p.x -= size * 0.012;
      if (p.x < -size * 0.2) {
        p.x += size * 0.55 * 3;
        p.gap = size * (0.3 + Math.random() * 0.4);
      }
    });
    if (y > size || y < 0) reset();
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = paper;
    [[0.2, 0.15], [0.75, 0.3], [0.45, 0.82]].forEach(([cx, cy], i) => {
      const x = ((cx * size - tick * (0.6 + i * 0.2)) % (size * 1.3) + size * 1.3) % (size * 1.3) - size * 0.15;
      ctx.beginPath();
      ctx.ellipse(x, cy * size, size * 0.1, size * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = ink;
    const pw = size * 0.14;
    pillars.forEach((p) => {
      roundedRect(ctx, p.x, -4, pw, p.gap - gapH / 2 + 4, 4);
      ctx.fill();
      roundedRect(ctx, p.x, p.gap + gapH / 2, pw, size, 4);
      ctx.fill();
    });
    const px = size * 0.25;
    ctx.save();
    ctx.translate(px, y);
    ctx.rotate(Math.max(-0.5, Math.min(0.8, vy / (size * 0.03))));
    const s = size * 0.07;
    ctx.fillStyle = planeColor;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s, -s * 0.7);
    ctx.lineTo(-s * 0.55, 0);
    ctx.lineTo(-s, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  reset();
  run({ step, draw }, 33, 30);
}

function slideRow(row) {
  const values = row.filter(Boolean);
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) {
      out.push(values[i] * 2);
      i += 1;
    } else {
      out.push(values[i]);
    }
  }
  while (out.length < 4) out.push(0);
  return out;
}

function tile2048Demo(canvas) {
  const { ctx, size, ink, paper, color } = setup(canvas);
  const palette = {
    2: [paper, ink], 4: ["#f3e3c3", ink], 8: [color("mustard"), ink], 16: [color("tomato"), ink],
    32: [color("pink"), ink], 64: [color("lilac"), ink], 128: [color("sky"), ink], 256: [color("sea"), ink],
  };
  let grid;

  function spawn() {
    const empty = [];
    grid.forEach((row, r) => row.forEach((v, c) => { if (!v) empty.push([r, c]); }));
    if (!empty.length) return;
    const [r, c] = empty[rand(empty.length)];
    grid[r][c] = Math.random() < 0.85 ? 2 : 4;
  }

  function reset() {
    grid = Array.from({ length: 4 }, () => Array(4).fill(0));
    spawn();
    spawn();
  }

  function moved(dir) {
    const next = grid.map((row) => [...row]);
    for (let i = 0; i < 4; i++) {
      let line = dir === "left" || dir === "right" ? [...grid[i]] : grid.map((row) => row[i]);
      if (dir === "right" || dir === "down") line.reverse();
      line = slideRow(line);
      if (dir === "right" || dir === "down") line.reverse();
      for (let j = 0; j < 4; j++) {
        if (dir === "left" || dir === "right") next[i][j] = line[j];
        else next[j][i] = line[j];
      }
    }
    return next;
  }

  function step() {
    const dirs = ["left", "down", "right", "down", "left", "up"].sort(() => Math.random() - 0.5);
    for (const dir of dirs) {
      const next = moved(dir);
      if (JSON.stringify(next) !== JSON.stringify(grid)) {
        grid = next;
        spawn();
        if (Math.max(...grid.flat()) >= 256) reset();
        return;
      }
    }
    reset();
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const gap = size * 0.035;
    const cell = (size - gap * 5) / 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    grid.forEach((row, r) => row.forEach((v, c) => {
      const x = gap + c * (cell + gap);
      const y = gap + r * (cell + gap);
      const [bg, fg] = palette[v] || [ink, paper];
      ctx.fillStyle = v ? bg : "rgba(22, 33, 59, 0.14)";
      roundedRect(ctx, x, y, cell, cell, 4);
      ctx.fill();
      if (v) {
        ctx.fillStyle = fg;
        ctx.font = `900 ${Math.round(cell * (v > 99 ? 0.36 : 0.48))}px "Big Shoulders Display", Arial, sans-serif`;
        ctx.fillText(String(v), x + cell / 2, y + cell / 2 + 1);
      }
    }));
  }

  reset();
  run({ step, draw }, 650, 6);
}

function minesDemo(canvas) {
  const { ctx, size, ink, paper, color } = setup(canvas);
  const N = 8;
  const flagColor = color("tomato");
  let cells, hold;

  function neighbours(i) {
    const r = Math.floor(i / N);
    const c = i % N;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if ((dr || dc) && nr >= 0 && nc >= 0 && nr < N && nc < N) out.push(nr * N + nc);
      }
    }
    return out;
  }

  function reset() {
    cells = Array.from({ length: N * N }, () => ({ mine: false, open: false, flag: false, n: 0 }));
    let placed = 0;
    while (placed < 9) {
      const i = rand(N * N);
      if (!cells[i].mine) {
        cells[i].mine = true;
        placed += 1;
      }
    }
    cells.forEach((cell, i) => { cell.n = neighbours(i).filter((j) => cells[j].mine).length; });
    hold = 0;
  }

  function open(i) {
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (cells[j].open) continue;
      cells[j].open = true;
      if (cells[j].n === 0) neighbours(j).forEach((k) => { if (!cells[k].open && !cells[k].mine) stack.push(k); });
    }
  }

  function step() {
    const closedSafe = cells.flatMap((c, i) => (!c.open && !c.mine ? [i] : []));
    if (!closedSafe.length) {
      cells.forEach((c) => { if (c.mine) c.flag = true; });
      hold += 1;
      if (hold > 4) reset();
      return;
    }
    const zeros = closedSafe.filter((i) => cells[i].n === 0);
    open(zeros.length && Math.random() < 0.6 ? zeros[rand(zeros.length)] : closedSafe[rand(closedSafe.length)]);
    const unflagged = cells.filter((c) => c.mine && !c.flag);
    if (unflagged.length && Math.random() < 0.3) unflagged[rand(unflagged.length)].flag = true;
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const gap = size * 0.018;
    const cell = (size - gap * (N - 1)) / N;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(cell * 0.62)}px "Big Shoulders Display", Arial, sans-serif`;
    cells.forEach((c, i) => {
      const x = (i % N) * (cell + gap);
      const y = Math.floor(i / N) * (cell + gap);
      ctx.fillStyle = c.open ? paper : ink;
      roundedRect(ctx, x, y, cell, cell, 3);
      ctx.fill();
      if (c.open && c.n) {
        ctx.fillStyle = ink;
        ctx.fillText(String(c.n), x + cell / 2, y + cell / 2 + 1);
      } else if (c.flag) {
        ctx.fillStyle = flagColor;
        ctx.beginPath();
        ctx.moveTo(x + cell * 0.32, y + cell * 0.22);
        ctx.lineTo(x + cell * 0.75, y + cell * 0.4);
        ctx.lineTo(x + cell * 0.32, y + cell * 0.58);
        ctx.fill();
        ctx.fillRect(x + cell * 0.28, y + cell * 0.2, cell * 0.07, cell * 0.6);
      }
    });
  }

  reset();
  run({ step, draw }, 380, 5);
}

function lightsDemo(canvas) {
  const { ctx, size, ink, color } = setup(canvas);
  const N = 5;
  const lit = color("mustard");
  let grid;

  function press(i) {
    const r = Math.floor(i / N);
    const c = i % N;
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < N && nc < N) grid[nr * N + nc] = !grid[nr * N + nc];
    });
  }

  function step() {
    press(rand(N * N));
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const cell = size / N;
    grid.forEach((on, i) => {
      const cx = (i % N) * cell + cell / 2;
      const cy = Math.floor(i / N) * cell + cell / 2;
      if (on) {
        ctx.fillStyle = lit;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.46, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = on ? lit : ink;
      ctx.globalAlpha = on ? 1 : 0.16;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  grid = Array(N * N).fill(false);
  run({ step, draw }, 700, 6);
}

const DEMOS = {
  ttt: ticTacToeDemo,
  snake: snakeDemo,
  memory: memoryDemo,
  four: fourDemo,
  bricks: bricksDemo,
  glide: glideDemo,
  2048: tile2048Demo,
  mines: minesDemo,
  lights: lightsDemo,
};

function startDemos() {
  document.querySelectorAll("canvas[data-demo]").forEach((canvas) => {
    DEMOS[canvas.dataset.demo](canvas);
  });
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(startDemos);
else startDemos();
