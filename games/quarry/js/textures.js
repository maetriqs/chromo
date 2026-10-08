// Quarry: procedurally painted 16px block textures, the atlas, crack stages and UI icons. By The_headphones
(function (QY) {
  const TILE = 16;
  const COLS = 8;
  const ATLAS = 128;

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = ATLAS;
  atlasCanvas.height = ATLAS;
  const atlasCtx = atlasCanvas.getContext("2d");
  const atlasData = atlasCtx.createImageData(ATLAS, ATLAS);
  const D = atlasData.data;

  // ---- per-tile painter -------------------------------------------------------------------
  let ox = 0;
  let oy = 0;
  let rand = Math.random;

  const wrap = (v) => ((v % TILE) + TILE) % TILE;
  const ri = (n) => Math.floor(rand() * n);
  const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  function set(x, y, c, a = 255) {
    const i = ((oy + wrap(y)) * ATLAS + ox + wrap(x)) * 4;
    D[i] = clampByte(c[0]);
    D[i + 1] = clampByte(c[1]);
    D[i + 2] = clampByte(c[2]);
    D[i + 3] = a;
  }
  function get(x, y) {
    const i = ((oy + wrap(y)) * ATLAS + ox + wrap(x)) * 4;
    return [D[i], D[i + 1], D[i + 2], D[i + 3]];
  }
  const scale = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // A random 16x16 field, optionally blurred (with wrap) so the shades clump into blotches.
  function field(smooth) {
    let f = new Float32Array(256);
    for (let i = 0; i < 256; i++) f[i] = rand();
    if (smooth > 0) {
      const g = new Float32Array(256);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += f[wrap(y + dy) * 16 + wrap(x + dx)];
          g[y * 16 + x] = f[y * 16 + x] * (1 - smooth) + (sum / 9) * smooth;
        }
      }
      f = g;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 256; i++) {
      lo = Math.min(lo, f[i]);
      hi = Math.max(hi, f[i]);
    }
    for (let i = 0; i < 256; i++) f[i] = (f[i] - lo) / (hi - lo || 1);
    return f;
  }

  // Fill the tile from a palette ordered dark to light, picked by a clumped random field.
  function paletteFill(palette, smooth, rows = 16) {
    const f = field(smooth);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < 16; x++) {
        const k = Math.min(palette.length - 1, Math.floor(f[y * 16 + x] * palette.length));
        set(x, y, palette[k]);
      }
    }
    return f;
  }

  function blob(cx, cy, size, colors) {
    let x = cx;
    let y = cy;
    for (let i = 0; i < size; i++) {
      set(x, y, colors[ri(colors.length)]);
      if (rand() < 0.5) x += rand() < 0.5 ? -1 : 1;
      else y += rand() < 0.5 ? -1 : 1;
      x = Math.max(1, Math.min(14, x));
      y = Math.max(1, Math.min(14, y));
    }
  }

  // ---- palettes ---------------------------------------------------------------------------
  const GRASS = [[66, 116, 42], [80, 136, 50], [94, 152, 58], [106, 164, 64], [122, 180, 74]];
  const DIRT = [[92, 63, 42], [111, 78, 53], [128, 92, 63], [143, 105, 73], [158, 119, 85]];
  const STONE = [[104, 104, 106], [114, 114, 116], [125, 125, 127], [134, 134, 136], [145, 145, 147]];
  const SNOW = [[214, 224, 232], [226, 234, 240], [236, 242, 246], [246, 249, 251]];
  const SAND = [[203, 189, 139], [212, 199, 149], [220, 208, 159], [228, 217, 170], [235, 226, 183]];
  const WOOD = [164, 128, 78];
  const BARK = [104, 80, 50];

  const painters = {
    grass_top() {
      paletteFill(GRASS, 0.25);
      for (let i = 0; i < 10; i++) set(ri(16), ri(16), [60, 104, 38]);
    },
    grass_side() {
      painters.dirt();
      const f = field(0.2);
      for (let x = 0; x < 16; x++) {
        const len = 3 + (rand() < 0.55 ? 1 : 0) + (rand() < 0.25 ? 1 : 0);
        for (let y = 0; y < len; y++) {
          const k = Math.min(GRASS.length - 1, Math.floor(f[y * 16 + x] * GRASS.length));
          set(x, y, y === len - 1 ? scale(GRASS[Math.max(0, k - 1)], 0.92) : GRASS[k]);
        }
      }
    },
    dirt() {
      paletteFill(DIRT, 0.35);
      for (let i = 0; i < 6; i++) set(ri(16), ri(16), [152, 132, 112]);
    },
    stone() {
      paletteFill(STONE, 0.6);
      for (let i = 0; i < 4; i++) {
        let x = ri(16);
        let y = ri(16);
        const len = 2 + ri(4);
        for (let k = 0; k < len; k++) {
          set(x, y, [94, 94, 96]);
          x += rand() < 0.6 ? 1 : 0;
          y += rand() < 0.5 ? 1 : 0;
        }
      }
    },
    cobble() {
      const pts = [];
      for (let i = 0; i < 9; i++) pts.push([rand() * 16, rand() * 16, 0.8 + rand() * 0.35]);
      const tdist = (ax, ay, bx, by) => {
        let dx = Math.abs(ax - bx);
        let dy = Math.abs(ay - by);
        dx = Math.min(dx, 16 - dx);
        dy = Math.min(dy, 16 - dy);
        return Math.hypot(dx, dy);
      };
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          let d1 = Infinity;
          let d2 = Infinity;
          let best = 0;
          pts.forEach((p, i) => {
            const d = tdist(x + 0.5, y + 0.5, p[0], p[1]);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              best = i;
            } else if (d < d2) d2 = d;
          });
          if (d2 - d1 < 1.05) {
            set(x, y, [72, 72, 74]);
            continue;
          }
          const p = pts[best];
          let dx = x + 0.5 - p[0];
          let dy = y + 0.5 - p[1];
          if (dx > 8) dx -= 16;
          if (dx < -8) dx += 16;
          if (dy > 8) dy -= 16;
          if (dy < -8) dy += 16;
          const light = dx + dy < -1.5 ? 1.12 : dx + dy > 1.5 ? 0.88 : 1;
          set(x, y, scale([126, 126, 128], p[2] * light * (0.95 + rand() * 0.1)));
        }
      }
    },
    log_side() {
      for (let x = 0; x < 16; x++) {
        let shade = 0.85 + rand() * 0.25;
        let run = 0;
        for (let y = 0; y < 16; y++) {
          if (run <= 0) {
            shade = 0.82 + rand() * 0.28;
            run = 3 + ri(7);
          }
          run -= 1;
          set(x, y, scale(BARK, shade * (0.96 + rand() * 0.08)));
        }
      }
      for (let i = 0; i < 4; i++) {
        const x = ri(16);
        const y0 = ri(16);
        const len = 4 + ri(8);
        for (let k = 0; k < len; k++) set(x, y0 + k, [72, 54, 33]);
      }
    },
    log_top() {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) * 0.7 + Math.hypot(x - 7.5, y - 7.5) * 0.3;
          let c;
          if (x === 0 || y === 0 || x === 15 || y === 15) c = scale(BARK, 0.9 + rand() * 0.15);
          else if (d < 1.4) c = [134, 103, 62];
          else c = Math.floor(d) % 2 === 0 ? [176, 141, 86] : [152, 118, 70];
          set(x, y, scale(c, 0.96 + rand() * 0.08));
        }
      }
    },
    planks() {
      for (let board = 0; board < 4; board++) {
        const shade = 0.93 + rand() * 0.12;
        const joint = board % 2 ? 4 : 12;
        for (let y = board * 4; y < board * 4 + 4; y++) {
          for (let x = 0; x < 16; x++) {
            let c = scale(WOOD, shade * (0.97 + rand() * 0.06));
            if (y === board * 4 + 3) c = [112, 85, 50];
            else if (x === joint) c = [126, 96, 57];
            set(x, y, c);
          }
        }
        for (let s = 0; s < 3; s++) {
          const y = board * 4 + ri(3);
          const x0 = ri(16);
          const len = 2 + ri(4);
          for (let k = 0; k < len; k++) if (wrap(x0 + k) !== joint) set(x0 + k, y, scale(WOOD, shade * 0.86));
        }
      }
    },
    leaves() {
      paletteFill([[40, 82, 30], [52, 100, 37], [63, 117, 44], [76, 134, 52], [92, 150, 62]], 0.2);
      for (let i = 0; i < 26; i++) set(ri(16), ri(16), [30, 62, 24]);
      for (let i = 0; i < 8; i++) set(ri(16), ri(16), [112, 168, 76]);
    },
    sand() {
      paletteFill(SAND, 0.3);
    },
    glass() {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, [0, 0, 0], 0);
      for (let i = 0; i < 16; i++) {
        const edge = [206, 228, 236];
        set(i, 0, edge);
        set(i, 15, edge);
        set(0, i, edge);
        set(15, i, edge);
      }
      [[0, 0], [15, 0], [0, 15], [15, 15]].forEach(([x, y]) => set(x, y, [168, 196, 206]));
      [[3, 5], [4, 4], [5, 3], [3, 8], [4, 7], [5, 6], [6, 5], [7, 4], [8, 3]].forEach(([x, y]) => set(x, y, [236, 246, 250]));
      [[11, 12], [12, 11]].forEach(([x, y]) => set(x, y, [222, 238, 244]));
    },
    brick() {
      const shades = [];
      for (let i = 0; i < 16; i++) shades.push(0.88 + rand() * 0.2);
      for (let y = 0; y < 16; y++) {
        const row = y >> 2;
        const offset = row % 2 ? 4 : 0;
        for (let x = 0; x < 16; x++) {
          const bx = (x + offset) % 16;
          if (y % 4 === 3 || bx % 8 === 7) {
            set(x, y, scale([194, 186, 174], 0.95 + rand() * 0.08));
            continue;
          }
          const brick = row * 2 + (bx >> 3);
          const top = y % 4 === 0 ? 1.08 : 1;
          set(x, y, scale([154, 76, 56], shades[brick] * top * (0.95 + rand() * 0.1)));
        }
      }
    },
    gravel() {
      paletteFill([[86, 80, 78], [108, 102, 100], [126, 118, 112], [142, 136, 132], [158, 152, 148]], 0.12);
      for (let i = 0; i < 12; i++) set(ri(16), ri(16), [126, 104, 90]);
      for (let i = 0; i < 8; i++) set(ri(16), ri(16), [70, 66, 66]);
    },
    snow() {
      paletteFill(SNOW, 0.4);
    },
    snow_side() {
      painters.dirt();
      const f = field(0.3);
      for (let x = 0; x < 16; x++) {
        const len = 3 + (rand() < 0.6 ? 1 : 0) + (rand() < 0.3 ? 1 : 0);
        for (let y = 0; y < len; y++) {
          const k = Math.min(SNOW.length - 1, Math.floor(f[y * 16 + x] * SNOW.length));
          set(x, y, y === len - 1 ? [196, 206, 214] : SNOW[k]);
        }
      }
    },
    bedrock() {
      paletteFill([[34, 34, 36], [56, 56, 58], [82, 82, 84], [110, 110, 112], [138, 138, 140]], 0.15);
    },
    coal_ore() {
      painters.stone();
      for (let c = 0; c < 4; c++) blob(2 + ri(12), 2 + ri(12), 4 + ri(3), [[34, 34, 36], [48, 48, 52], [40, 40, 42]]);
      for (let i = 0; i < 3; i++) set(2 + ri(12), 2 + ri(12), [92, 92, 98]);
    },
    iron_ore() {
      painters.stone();
      for (let c = 0; c < 4; c++) blob(2 + ri(12), 2 + ri(12), 4 + ri(3), [[214, 176, 142], [192, 152, 120], [226, 196, 166]]);
    },
    lamp() {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const frame = x === 0 || x === 15 || y === 0 || y === 15 || x === 7 || x === 8 || y === 7 || y === 8;
          if (frame) {
            set(x, y, scale([96, 72, 44], 0.92 + rand() * 0.14));
            continue;
          }
          const px = x < 7 ? x - 3.5 : x - 11.5;
          const py = y < 7 ? y - 3.5 : y - 11.5;
          const d = Math.min(1, Math.hypot(px, py) / 3.6);
          set(x, y, mix([255, 240, 186], [240, 170, 78], d * d));
        }
      }
      for (let i = 0; i < 6; i++) {
        const x = 1 + ri(14);
        const y = 1 + ri(14);
        if (x !== 7 && x !== 8 && y !== 7 && y !== 8) set(x, y, [255, 252, 228]);
      }
    },
    stone_bricks() {
      for (let y = 0; y < 16; y++) {
        const row = y >> 3;
        const offset = row ? 4 : 0;
        for (let x = 0; x < 16; x++) {
          const bx = (x + offset) % 8;
          const by = y % 8;
          let c = [128, 128, 130];
          if (by === 7 || bx === 7) c = [86, 86, 88];
          else if (by === 0 || bx === 0) c = [148, 148, 150];
          else if (by === 6 || bx === 6) c = [112, 112, 114];
          set(x, y, scale(c, 0.96 + rand() * 0.08));
        }
      }
      for (let i = 0; i < 3; i++) {
        let x = 1 + ri(14);
        let y = 1 + ri(14);
        for (let k = 0; k < 3; k++) {
          if ((x + (y >> 3 ? 4 : 0)) % 8 !== 7 && y % 8 !== 7) set(x, y, [100, 100, 102]);
          x += 1;
          y += rand() < 0.5 ? 1 : 0;
        }
      }
    },
    bookshelf() {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const shelf = y <= 1 || y >= 14 || y === 7 || y === 8;
          set(x, y, shelf ? scale(WOOD, y === 1 || y === 8 || y === 15 ? 0.72 : 0.96 + rand() * 0.06) : [58, 42, 26]);
        }
      }
      const colors = [[142, 44, 38], [50, 72, 142], [62, 112, 54], [152, 122, 62], [98, 62, 102], [178, 168, 140]];
      [[2, 6], [9, 13]].forEach(([top, bottom]) => {
        let x = 1;
        while (x < 15) {
          const w = 1 + (rand() < 0.4 ? 1 : 0);
          if (rand() < 0.12) {
            x += 1;
            continue;
          }
          const c = colors[ri(colors.length)];
          const h = rand() < 0.3 ? 1 : 0;
          for (let bx = x; bx < Math.min(15, x + w); bx++) {
            for (let y = top + h; y <= bottom; y++) set(bx, y, scale(c, y === top + h ? 1.2 : 0.9 + rand() * 0.15));
          }
          x += w;
        }
      });
    },
    tall_grass() {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, [0, 0, 0], 0);
      for (let b = 0; b < 8; b++) {
        let x = 1 + ri(14);
        const h = 6 + ri(8);
        const lean = rand() < 0.5 ? -1 : 1;
        for (let k = 0; k < h; k++) {
          const t = k / h;
          set(x, 15 - k, mix([58, 108, 36], [118, 176, 74], t));
          if (k > 2 && rand() < 0.22) x = Math.max(0, Math.min(15, x + lean));
        }
      }
    },
    red_flower() {
      flower([[204, 42, 44], [160, 26, 32], [232, 92, 84]], [246, 204, 72]);
    },
    yellow_flower() {
      flower([[246, 212, 46], [214, 172, 22], [255, 238, 120]], [214, 132, 20]);
    },
    wool_white: () => wool([232, 235, 235]),
    wool_red: () => wool([168, 44, 38]),
    wool_blue: () => wool([56, 64, 160]),
    wool_yellow: () => wool([240, 192, 44]),
    wool_green: () => wool([88, 118, 36]),
    sandstone_top() {
      paletteFill([[206, 190, 136], [213, 198, 145], [220, 206, 155], [227, 214, 165]], 0.6);
    },
    sandstone_side() {
      for (let y = 0; y < 16; y++) {
        let base = [214, 199, 146];
        if (y <= 2) base = [228, 215, 168];
        else if (y >= 13) base = [198, 180, 126];
        if (y === 3 || y === 12) base = [194, 177, 124];
        const rowShade = 0.97 + rand() * 0.05;
        for (let x = 0; x < 16; x++) set(x, y, scale(base, rowShade * (0.97 + rand() * 0.06)));
      }
    },
    water() {
      const blues = [[36, 72, 176], [44, 86, 196], [58, 104, 212], [84, 132, 226]];
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const w =
            0.5 +
            0.24 * Math.sin((2 * Math.PI * (x + 2 * y)) / 16) +
            0.18 * Math.sin((2 * Math.PI * (2 * x - y)) / 16 + 1.3) +
            0.08 * Math.sin((2 * Math.PI * (3 * x + y)) / 16 + 2.1);
          set(x, y, blues[Math.max(0, Math.min(3, Math.floor(w * 4)))], 200);
        }
      }
    },
  };

  function flower(petals, centre) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, [0, 0, 0], 0);
    const stem = [62, 116, 40];
    for (let y = 7; y < 16; y++) set(7, y, stem);
    [[6, 12], [5, 11], [8, 10], [9, 9]].forEach(([x, y]) => set(x, y, [76, 138, 48]));
    const shape = [
      [6, 3], [7, 3], [8, 3],
      [5, 4], [6, 4], [8, 4], [9, 4],
      [5, 5], [6, 5], [8, 5], [9, 5],
      [6, 6], [7, 6], [8, 6],
      [7, 2],
    ];
    shape.forEach(([x, y]) => set(x, y, petals[ri(2)]));
    set(6, 3, petals[2]);
    set(5, 4, petals[2]);
    set(7, 4, centre);
    set(7, 5, scale(centre, 0.8));
  }

  function wool(c) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const knit = (x + (y >> 1)) % 2 === 0 ? 1.04 : 0.95;
        const row = y % 2 === 0 ? 1.01 : 0.98;
        set(x, y, scale(c, knit * row * (0.97 + rand() * 0.05)));
      }
    }
  }

  // ---- paint the atlas -------------------------------------------------------------------
  const avgColor = [];
  QY.TILES.forEach((name, index) => {
    ox = (index % COLS) * TILE;
    oy = Math.floor(index / COLS) * TILE;
    rand = QY.Noise.rng(0x51a7 + index * 7919);
    painters[name]();
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const p = get(x, y);
        if (p[3] < 128) continue;
        r += p[0];
        g += p[1];
        b += p[2];
        n++;
      }
    }
    avgColor[index] = n ? [r / n, g / n, b / n] : [200, 200, 200];
  });
  atlasCtx.putImageData(atlasData, 0, 0);

  // Opaque pixels of a tile, for particles that pick real texels.
  const tileTexels = QY.TILES.map((name, index) => {
    const out = [];
    const tx = (index % COLS) * TILE;
    const ty = Math.floor(index / COLS) * TILE;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = ((ty + y) * ATLAS + tx + x) * 4;
        if (D[i + 3] > 128) out.push([D[i] / 255, D[i + 1] / 255, D[i + 2] / 255]);
      }
    }
    return out;
  });

  function tileCanvas(index, size = TILE) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = false;
    cx.drawImage(atlasCanvas, (index % COLS) * TILE, Math.floor(index / COLS) * TILE, TILE, TILE, 0, 0, size, size);
    return c;
  }

  // ---- crack overlay stages ----------------------------------------------------------------
  const crackCanvases = [];
  (function buildCracks() {
    rand = QY.Noise.rng(0xc4ac);
    const order = [];
    const seen = new Set();
    const add = (x, y) => {
      const k = wrap(x) + wrap(y) * 16;
      if (!seen.has(k)) {
        seen.add(k);
        order.push([wrap(x), wrap(y)]);
      }
    };
    const walkers = [];
    for (let i = 0; i < 5; i++) walkers.push({ x: 7 + ri(2), y: 7 + ri(2), dx: Math.cos(i * 1.3 + rand()), dy: Math.sin(i * 1.3 + rand()) });
    for (let step = 0; step < 9; step++) {
      walkers.forEach((w) => {
        add(Math.round(w.x), Math.round(w.y));
        w.x += w.dx + (rand() - 0.5) * 0.8;
        w.y += w.dy + (rand() - 0.5) * 0.8;
        if (rand() < 0.15) walkers.push({ x: w.x, y: w.y, dx: w.dy, dy: -w.dx });
      });
    }
    for (let stage = 0; stage < 5; stage++) {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      const cx = c.getContext("2d");
      const count = Math.round(order.length * ((stage + 1) / 5));
      for (let i = 0; i < count; i++) {
        cx.fillStyle = i % 3 ? "rgba(20, 16, 14, 0.72)" : "rgba(20, 16, 14, 0.5)";
        cx.fillRect(order[i][0], order[i][1], 1, 1);
      }
      crackCanvases.push(c);
    }
  })();

  // ---- inventory icons -------------------------------------------------------------------
  const ICON = 48;
  const iconCache = {};

  function drawFace(cx, tile, transform, darken) {
    cx.save();
    cx.setTransform(...transform);
    cx.drawImage(atlasCanvas, (tile % COLS) * TILE, Math.floor(tile / COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
    if (darken > 0) {
      cx.globalCompositeOperation = "source-atop";
      cx.fillStyle = `rgba(0, 0, 0, ${darken})`;
      cx.fillRect(0, 0, TILE, TILE);
    }
    cx.restore();
  }

  function blockIcon(id) {
    if (iconCache[id]) return iconCache[id];
    const b = QY.BLOCKS[id];
    const c = document.createElement("canvas");
    c.width = ICON;
    c.height = ICON;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = false;
    const tile = (name) => QY.TILES.indexOf(name);
    if (b.kind === "plant") {
      cx.drawImage(atlasCanvas, (tile(b.top) % COLS) * TILE, Math.floor(tile(b.top) / COLS) * TILE, TILE, TILE, 0, 0, ICON, ICON);
    } else {
      // Each face is drawn on its own layer so "source-atop" darkening only touches that face.
      const layer = document.createElement("canvas");
      layer.width = ICON;
      layer.height = ICON;
      const lx = layer.getContext("2d");
      lx.imageSmoothingEnabled = false;
      const faces = [
        [tile(b.top), [1.25, -0.625, 1.25, 0.625, 4, 12], 0],
        [tile(b.side), [1.25, 0.625, 0, 1.5, 4, 12], 0.22],
        [tile(b.side), [1.25, -0.625, 0, 1.5, 24, 22], 0.4],
      ];
      faces.forEach(([t, transform, darken]) => {
        lx.clearRect(0, 0, ICON, ICON);
        drawFace(lx, t, transform, darken);
        cx.drawImage(layer, 0, 0);
      });
    }
    iconCache[id] = c.toDataURL();
    return iconCache[id];
  }

  // Small pixel-art UI glyphs: hearts and air bubbles, drawn from strings.
  function glyph(rows, colors, px = 2) {
    const c = document.createElement("canvas");
    c.width = rows[0].length * px;
    c.height = rows.length * px;
    const cx = c.getContext("2d");
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === "." || !colors[ch]) return;
        cx.fillStyle = colors[ch];
        cx.fillRect(x * px, y * px, px, px);
      });
    });
    return c.toDataURL();
  }

  const HEART = [".kk.kk.", "kffkffk", "kfwffhk", "kfffffk", ".kfffk.", "..kfk..", "...k..."];
  const HEART_HALF = [".kk.kk.", "kffkeek", "kfwfeek", "kfffeek", ".kffek.", "..kfk..", "...k..."];
  const HEART_EMPTY = [".kk.kk.", "keekeek", "keeeeek", "keeeeek", ".keeek.", "..kek..", "...k..."];
  const BUBBLE = [".kkk.", "kwbbk", "kwbbk", "kbbbk", ".kkk."];
  const heartColors = { k: "#1b0d0d", f: "#d8303a", w: "#ffd6d6", h: "#a51c26", e: "#3b2a2a" };

  const icons = {
    heart: glyph(HEART, heartColors, 3),
    heartHalf: glyph(HEART_HALF, heartColors, 3),
    heartEmpty: glyph(HEART_EMPTY, heartColors, 3),
    bubble: glyph(BUBBLE, { k: "#1f3f78", w: "#e8f4ff", b: "#78b4ee" }, 3),
  };

  // Menu backgrounds: a darkened dirt tile and a stone tile for the title lettering.
  const backgrounds = {
    dirt: tileCanvas(QY.TILES.indexOf("dirt"), 64).toDataURL(),
    stone: tileCanvas(QY.TILES.indexOf("stone"), 48).toDataURL(),
  };

  QY.Textures = {
    TILE,
    COLS,
    ATLAS,
    atlasCanvas,
    avgColor,
    tileTexels,
    crackCanvases,
    blockIcon,
    icons,
    backgrounds,
    tileIndex: (name) => QY.TILES.indexOf(name),
  };
})(window.QY = window.QY || {});
