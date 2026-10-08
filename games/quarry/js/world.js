// Quarry: the block grid, terrain generation, block light and voxel raycasts. By The_headphones
(function (QY) {
  const { CHUNK, HEIGHT: H, SIZE, SEA, SNOW_LINE, SPAWN_RADIUS } = QY.CFG;
  const { fbm, hash2, hash3, rng } = QY.Noise;
  const { clamp, smoothstep } = QY.MathX;
  const ID = QY.ID;
  const T_SKY = QY.T_SKY;
  const T_OPAQUE = QY.T_OPAQUE;
  const T_EMIT = QY.T_EMIT;
  const T_SOLID = QY.T_SOLID;
  const T_TARGET = QY.T_TARGET;
  const T_KIND = QY.T_KIND;
  const CHUNKS = SIZE / CHUNK;
  const COLUMN = H;
  const ROW = SIZE * H;

  // Column-major layout: a column of H blocks is contiguous, which suits generation and lighting.
  const blocks = new Uint8Array(SIZE * SIZE * H);
  const light = new Uint8Array(SIZE * SIZE * H);
  const tops = new Int16Array(SIZE * SIZE);
  const heights = new Int16Array(SIZE * SIZE);
  const treeMask = new Uint8Array(SIZE * SIZE);
  const edits = new Map();
  const spawn = { x: SIZE / 2 + 0.5, y: SEA + 2, z: SIZE / 2 + 0.5, bx: SIZE / 2, by: SEA + 1, bz: SIZE / 2 };
  let lampSeeds = [];

  const index = (x, y, z) => (x * SIZE + z) * H + y;
  const inside = (x, y, z) => x >= 0 && z >= 0 && x < SIZE && z < SIZE && y >= 0 && y < H;

  function get(x, y, z) {
    if (x < 0 || z < 0 || x >= SIZE || z >= SIZE || y >= H) return 0;
    if (y < 0) return ID.bedrock;
    return blocks[(x * SIZE + z) * H + y];
  }

  function topAt(x, z) {
    if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return -1;
    return tops[x * SIZE + z];
  }

  // Approximate skylight: open sky = 1, beside open sky = 0.72, otherwise darker with depth.
  function skyAt(x, y, z) {
    if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return 1;
    const t = tops[x * SIZE + z];
    if (y > t) return 1;
    if (y > topAt(x + 1, z) || y > topAt(x - 1, z) || y > topAt(x, z + 1) || y > topAt(x, z - 1)) return 0.72;
    return 0.46 * clamp(1 - (t - y) / 24, 0.32, 1);
  }

  function lightAt(x, y, z) {
    if (!inside(x, y, z)) return 0;
    return light[index(x, y, z)];
  }

  // ---- terrain shape ------------------------------------------------------------------------
  function columnHeight(x, z) {
    const continental = fbm(x / 170, z / 170, 4);
    const hills = fbm(x / 55 + 40, z / 55 - 70, 4);
    const flat = smoothstep(-0.05, 0.3, fbm(x / 95 - 300, z / 95 + 120, 3));
    const mountain = smoothstep(0.08, 0.38, fbm(x / 140 + 900, z / 140 + 400, 4));
    const ridge = 1 - Math.abs(fbm(x / 34 + 5, z / 34 + 9, 3));
    let h = SEA + 4 + continental * 16 + hills * 12 * (1 - flat * 0.8) + mountain * (6 + ridge * ridge * 28);
    // Sink the edges into the sea so the world is an island with a squarish, wobbly coast.
    const dx = (x + 0.5) / (SIZE / 2) - 1;
    const dz = (z + 0.5) / (SIZE / 2) - 1;
    const r = Math.max(Math.abs(dx), Math.abs(dz)) * 0.5 + Math.hypot(dx, dz) * 0.5 + continental * 0.08;
    const fall = smoothstep(0.66, 0.94, r);
    h = h * (1 - fall) + (SEA - 10 + continental * 4) * fall;
    return clamp(Math.floor(h), 3, H - 12);
  }

  const isDesert = (x, z, h) => h < 42 && h > SEA && fbm(x / 150 + 1500, z / 150 - 900, 3) > 0.2;

  function fillColumn(x, z) {
    const col = x * SIZE + z;
    const base = col * H;
    const h = columnHeight(x, z);
    heights[col] = h;
    const desert = isDesert(x, z, h);
    const jitter = Math.floor(hash2(x, z) * 3) - 1;
    let surface = ID.grass;
    let under = ID.dirt;
    let depth = 3 + (hash2(z, x) < 0.5 ? 1 : 0);
    if (h < SEA - 1) {
      const deep = h < SEA - 6;
      const patch = fbm(x / 18 + 300, z / 18 - 80, 2);
      surface = deep ? (patch > 0.05 ? ID.gravel : ID.dirt) : patch > 0.25 ? ID.gravel : ID.sand;
      under = deep ? ID.dirt : ID.sand;
    } else if (h <= SEA + 1) {
      surface = ID.sand;
      under = ID.sand;
    } else if (desert) {
      surface = ID.sand;
      under = ID.sand;
      depth = 5;
    } else if (h >= SNOW_LINE + jitter) {
      surface = ID.snow;
    } else if (h >= 45 + jitter && fbm(x / 12, z / 12, 2) > -0.15) {
      surface = ID.stone;
      under = ID.stone;
    }

    blocks[base] = ID.bedrock;
    if (hash3(x, 1, z) < 0.5) blocks[base + 1] = ID.bedrock;
    if (hash3(x, 2, z) < 0.2) blocks[base + 2] = ID.bedrock;
    for (let y = 1; y <= h; y++) {
      if (blocks[base + y]) continue;
      let id;
      if (y === h) id = surface;
      else if (y > h - depth) id = under;
      else if (desert && y > h - depth - 3) id = ID.sandstone;
      else id = ID.stone;
      blocks[base + y] = id;
    }
    for (let y = h + 1; y < SEA; y++) blocks[base + y] = ID.water;
  }

  function terrainChunk(k) {
    const cx = k % CHUNKS;
    const cz = Math.floor(k / CHUNKS);
    for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) {
      for (let z = cz * CHUNK; z < cz * CHUNK + CHUNK; z++) fillColumn(x, z);
    }
  }

  // ---- ore veins ----------------------------------------------------------------------------
  function placeOres(seed) {
    const r = rng(seed ^ 0x0e5);
    const vein = (id, count, maxY, minSize, maxSize) => {
      for (let v = 0; v < count; v++) {
        let x = Math.floor(r() * SIZE);
        let z = Math.floor(r() * SIZE);
        let y = 3 + Math.floor(r() * (maxY - 3));
        const size = minSize + Math.floor(r() * (maxSize - minSize + 1));
        for (let i = 0; i < size; i++) {
          if (inside(x, y, z) && blocks[index(x, y, z)] === ID.stone) blocks[index(x, y, z)] = id;
          const axis = Math.floor(r() * 3);
          const step = r() < 0.5 ? -1 : 1;
          if (axis === 0) x += step;
          else if (axis === 1) y += step;
          else z += step;
        }
      }
    };
    vein(ID.coal, 2400, 54, 4, 8);
    vein(ID.iron, 1200, 36, 3, 6);
  }

  // ---- trees and plants ---------------------------------------------------------------------
  function placeIfFree(x, y, z, id) {
    if (!inside(x, y, z)) return;
    const i = index(x, y, z);
    const cur = blocks[i];
    if (cur === 0 || T_KIND[cur] === QY.KIND.PLANT) blocks[i] = id;
  }

  function oak(x, h, z, salt) {
    const trunk = 4 + Math.floor(hash3(x, salt, z) * 3);
    const top = h + trunk;
    for (let y = h + 1; y <= top; y++) blocks[index(x, y, z)] = ID.log;
    for (let y = top - 2; y <= top + 1; y++) {
      const radius = y <= top - 1 ? 2 : 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (corner && (y === top + 1 || hash3(x + dx, y, z + dz) < 0.5)) continue;
          placeIfFree(x + dx, y, z + dz, ID.leaves);
        }
      }
    }
  }

  function pine(x, h, z, salt) {
    const trunk = 6 + Math.floor(hash3(x, salt, z) * 3);
    const top = h + trunk;
    for (let y = h + 1; y < top; y++) blocks[index(x, y, z)] = ID.log;
    const radii = [2, 1, 2, 1, 1, 0];
    for (let i = 0; i < radii.length; i++) {
      const y = top - 4 + i;
      const radius = radii[i];
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + (radius === 2 ? 1 : 0)) continue;
          placeIfFree(x + dx, y, z + dz, ID.leaves);
        }
      }
    }
    placeIfFree(x, top + 2, z, ID.leaves);
  }

  function decorateChunk(k) {
    const cx = k % CHUNKS;
    const cz = Math.floor(k / CHUNKS);
    for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) {
      for (let z = cz * CHUNK; z < cz * CHUNK + CHUNK; z++) {
        const col = x * SIZE + z;
        const h = heights[col];
        const surface = blocks[col * H + h];
        if (h >= H - 12 || blocks[col * H + h + 1] !== 0) continue;
        const nearSpawn = Math.abs(x - spawn.bx) <= SPAWN_RADIUS + 5 && Math.abs(z - spawn.bz) <= SPAWN_RADIUS + 5;
        if (surface !== ID.grass && surface !== ID.snow) continue;
        const forest = smoothstep(0, 0.32, fbm(x / 80 + 77, z / 80 - 31, 3));
        const chance = 0.004 + forest * 0.07;
        const edge = x < 3 || z < 3 || x > SIZE - 4 || z > SIZE - 4;
        if (!nearSpawn && !edge && !treeMask[col] && hash2(x * 3 + 1, z * 7 + 2) < chance) {
          if (h > 40 || surface === ID.snow) pine(x, h, z, 11);
          else oak(x, h, z, 5);
          blocks[col * H + h] = ID.dirt;
          for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
              const mx = x + dx;
              const mz = z + dz;
              if (mx >= 0 && mz >= 0 && mx < SIZE && mz < SIZE) treeMask[mx * SIZE + mz] = 1;
            }
          }
          continue;
        }
        if (surface !== ID.grass || nearSpawn) continue;
        const meadow = fbm(x / 30 + 11, z / 30 - 7, 2);
        const roll = hash3(x, 99, z);
        if (roll < 0.05 + Math.max(0, meadow) * 0.3) blocks[col * H + h + 1] = ID.tallgrass;
        else if (roll > 0.985 && fbm(x / 40 - 200, z / 40 + 50, 2) > 0.15) {
          blocks[col * H + h + 1] = hash3(x, 7, z) < 0.5 ? ID.rose : ID.dandelion;
        }
      }
    }
  }

  // ---- spawn ----------------------------------------------------------------------------------
  function findSpawn() {
    const c = SIZE / 2;
    const ok = (x, z) => {
      if (x < 12 || z < 12 || x >= SIZE - 12 || z >= SIZE - 12) return false;
      const h = heights[x * SIZE + z];
      if (h < SEA + 2 || h > SEA + 16) return false;
      let lo = h;
      let hi = h;
      for (let dx = -SPAWN_RADIUS; dx <= SPAWN_RADIUS; dx++) {
        for (let dz = -SPAWN_RADIUS; dz <= SPAWN_RADIUS; dz++) {
          const hh = heights[(x + dx) * SIZE + z + dz];
          lo = Math.min(lo, hh);
          hi = Math.max(hi, hh);
        }
      }
      return lo > SEA && hi - lo <= 3;
    };
    let found = null;
    for (let r = 0; r < 110 && !found; r += 2) {
      for (let a = 0; a < 8 * Math.max(1, r) && !found; a++) {
        const t = (a / (8 * Math.max(1, r))) * Math.PI * 2;
        const x = Math.round(c + Math.cos(t) * r);
        const z = Math.round(c + Math.sin(t) * r);
        if (ok(x, z)) found = [x, z];
      }
    }
    if (!found) found = [c, c];
    const [x, z] = found;
    // Use the most common height of the area so the platform sits flush with the ground.
    const counts = {};
    for (let dx = -SPAWN_RADIUS; dx <= SPAWN_RADIUS; dx++) {
      for (let dz = -SPAWN_RADIUS; dz <= SPAWN_RADIUS; dz++) {
        const hh = heights[(x + dx) * SIZE + z + dz];
        counts[hh] = (counts[hh] || 0) + 1;
      }
    }
    const level = Math.max(SEA, Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]));
    spawn.bx = x;
    spawn.bz = z;
    spawn.by = level;
    spawn.x = x + 0.5;
    spawn.z = z + 0.5;
    spawn.y = level + 1;
  }

  function buildSpawn() {
    const { bx, by, bz } = spawn;
    const R = SPAWN_RADIUS;
    for (let dx = -R - 2; dx <= R + 2; dx++) {
      for (let dz = -R - 2; dz <= R + 2; dz++) {
        const x = bx + dx;
        const z = bz + dz;
        for (let y = by + 1; y < Math.min(H, by + 12); y++) {
          const id = blocks[index(x, y, z)];
          if (id && id !== ID.log && id !== ID.leaves) blocks[index(x, y, z)] = y < SEA ? ID.water : 0;
        }
        if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
        const rim = Math.abs(dx) === R || Math.abs(dz) === R;
        blocks[index(x, by, z)] = rim ? ID.cobble : ID.stonebrick;
        for (let y = by - 1; y > 0 && !T_SOLID[blocks[index(x, y, z)]]; y--) blocks[index(x, y, z)] = ID.dirt;
      }
    }
    lampSeeds = [];
    [[-R, -R], [R, -R], [-R, R], [R, R]].forEach(([dx, dz]) => {
      blocks[index(bx + dx, by + 1, bz + dz)] = ID.cobble;
      blocks[index(bx + dx, by + 2, bz + dz)] = ID.lamp;
      lampSeeds.push(index(bx + dx, by + 2, bz + dz));
    });
  }

  // ---- saved changes --------------------------------------------------------------------------
  function serializeEdits() {
    const parts = [];
    edits.forEach((id, i) => parts.push((i * 32 + id).toString(36)));
    return parts.join(",");
  }

  function applyEdits(text) {
    if (!text) return;
    text.split(",").forEach((part) => {
      const v = parseInt(part, 36);
      if (!Number.isFinite(v)) return;
      const id = v % 32;
      const i = Math.floor(v / 32);
      if (i < 0 || i >= blocks.length || (id !== 0 && !QY.BLOCKS[id])) return;
      blocks[i] = id;
      edits.set(i, id);
      if (T_EMIT[id]) lampSeeds.push(i);
    });
  }

  function computeTopsChunk(k) {
    const cx = k % CHUNKS;
    const cz = Math.floor(k / CHUNKS);
    for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) {
      for (let z = cz * CHUNK; z < cz * CHUNK + CHUNK; z++) {
        const col = x * SIZE + z;
        let y = H - 1;
        while (y >= 0 && !T_SKY[blocks[col * H + y]]) y--;
        tops[col] = y;
      }
    }
  }

  // ---- block light (flood fill, 15 at a lamp, minus one per step) ------------------------------
  const addQueue = [];
  const removeQueue = [];
  const changed = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, any: false };

  function touch(i) {
    const y = i % H;
    const col = (i - y) / H;
    const x = Math.floor(col / SIZE);
    const z = col - x * SIZE;
    if (!changed.any) {
      changed.x0 = changed.x1 = x;
      changed.y0 = changed.y1 = y;
      changed.z0 = changed.z1 = z;
      changed.any = true;
      return;
    }
    if (x < changed.x0) changed.x0 = x;
    if (x > changed.x1) changed.x1 = x;
    if (y < changed.y0) changed.y0 = y;
    if (y > changed.y1) changed.y1 = y;
    if (z < changed.z0) changed.z0 = z;
    if (z > changed.z1) changed.z1 = z;
  }

  // Calls fn(neighbourIndex) for the in-bounds face neighbours of cell i.
  function forNeighbours(i, fn) {
    const y = i % H;
    const col = (i - y) / H;
    const x = Math.floor(col / SIZE);
    const z = col - x * SIZE;
    if (y > 0) fn(i - 1);
    if (y < H - 1) fn(i + 1);
    if (z > 0) fn(i - COLUMN);
    if (z < SIZE - 1) fn(i + COLUMN);
    if (x > 0) fn(i - ROW);
    if (x < SIZE - 1) fn(i + ROW);
  }

  function propagate() {
    let head = 0;
    while (head < addQueue.length) {
      const i = addQueue[head++];
      const level = light[i];
      if (level <= 1) continue;
      forNeighbours(i, (n) => {
        if (T_OPAQUE[blocks[n]] || light[n] + 2 > level) return;
        light[n] = level - 1;
        touch(n);
        addQueue.push(n);
      });
    }
    addQueue.length = 0;
  }

  function removeFrom(i) {
    const start = light[i];
    if (!start) return;
    light[i] = 0;
    touch(i);
    removeQueue.push(i, start);
    let head = 0;
    while (head < removeQueue.length) {
      const cell = removeQueue[head++];
      const level = removeQueue[head++];
      forNeighbours(cell, (n) => {
        const nl = light[n];
        if (!nl) return;
        if (nl < level && !T_EMIT[blocks[n]]) {
          light[n] = 0;
          touch(n);
          removeQueue.push(n, nl);
        } else {
          addQueue.push(n);
        }
      });
    }
    removeQueue.length = 0;
  }

  function lightAll() {
    lampSeeds.forEach((i) => {
      if (T_EMIT[blocks[i]]) {
        light[i] = 15;
        addQueue.push(i);
      }
    });
    propagate();
  }

  // ---- editing ----------------------------------------------------------------------------------
  // Returns the box of blocks whose meshes may need rebuilding, or null if nothing changed.
  function setBlock(x, y, z, id) {
    if (!inside(x, y, z)) return null;
    const i = index(x, y, z);
    const old = blocks[i];
    if (old === id) return null;
    blocks[i] = id;
    edits.set(i, id);

    const col = x * SIZE + z;
    if (T_SKY[id] && y > tops[col]) tops[col] = y;
    else if (T_SKY[old] && !T_SKY[id] && y === tops[col]) {
      let t = y - 1;
      while (t >= 0 && !T_SKY[blocks[col * H + t]]) t--;
      tops[col] = t;
    }

    changed.any = false;
    if (T_EMIT[old] || (T_OPAQUE[id] && light[i] > 0)) removeFrom(i);
    if (T_EMIT[id]) {
      light[i] = 15;
      touch(i);
      addQueue.push(i);
    } else if (T_OPAQUE[old] && !T_OPAQUE[id]) {
      forNeighbours(i, (n) => {
        if (light[n] > 1) addQueue.push(n);
      });
    }
    propagate();

    const box = { x0: x - 2, y0: y - 2, z0: z - 2, x1: x + 2, y1: y + 2, z1: z + 2 };
    if (changed.any) {
      box.x0 = Math.min(box.x0, changed.x0 - 1);
      box.x1 = Math.max(box.x1, changed.x1 + 1);
      box.z0 = Math.min(box.z0, changed.z0 - 1);
      box.z1 = Math.max(box.z1, changed.z1 + 1);
    }
    return box;
  }

  // ---- raycast (Amanatides & Woo grid walk) ---------------------------------------------------
  function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tdx = sx ? Math.abs(1 / dx) : Infinity;
    const tdy = sy ? Math.abs(1 / dy) : Infinity;
    const tdz = sz ? Math.abs(1 / dz) : Infinity;
    let tx = sx > 0 ? (x + 1 - ox) * tdx : sx < 0 ? (ox - x) * tdx : Infinity;
    let ty = sy > 0 ? (y + 1 - oy) * tdy : sy < 0 ? (oy - y) * tdy : Infinity;
    let tz = sz > 0 ? (z + 1 - oz) * tdz : sz < 0 ? (oz - z) * tdz : Infinity;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    for (let guard = 0; guard < 256 && t <= maxDist; guard++) {
      const id = get(x, y, z);
      if (id && T_TARGET[id] && y >= 0) return { x, y, z, nx, ny, nz, id, t };
      if (tx < ty && tx < tz) {
        x += sx;
        t = tx;
        tx += tdx;
        nx = -sx;
        ny = 0;
        nz = 0;
      } else if (ty < tz) {
        y += sy;
        t = ty;
        ty += tdy;
        nx = 0;
        ny = -sy;
        nz = 0;
      } else {
        z += sz;
        t = tz;
        tz += tdz;
        nx = 0;
        ny = 0;
        nz = -sz;
      }
    }
    return null;
  }

  // ---- generation driver ------------------------------------------------------------------------
  function generator(seed, save) {
    QY.Noise.setSeed(seed);
    blocks.fill(0);
    light.fill(0);
    tops.fill(-1);
    treeMask.fill(0);
    edits.clear();
    lampSeeds = [];
    const total = CHUNKS * CHUNKS;
    const stages = [
      { label: "Shaping the land", count: total, weight: 4, run: terrainChunk },
      { label: "Choosing a spawn point", count: 1, weight: 4, run: findSpawn },
      { label: "Burying ore", count: 1, weight: 30, run: () => placeOres(seed) },
      { label: "Planting trees", count: total, weight: 1.5, run: decorateChunk },
      { label: "Building the spawn", count: 1, weight: 2, run: buildSpawn },
      { label: "Restoring your builds", count: 1, weight: 4, run: () => applyEdits(save && save.edits) },
      { label: "Lighting", count: total, weight: 0.6, run: computeTopsChunk },
      { label: "Lighting", count: 1, weight: 4, run: lightAll },
    ];
    const totalWeight = stages.reduce((sum, s) => sum + s.count * s.weight, 0);
    let stage = 0;
    let k = 0;
    let doneWeight = 0;
    return {
      step(budgetMs) {
        const start = performance.now();
        while (stage < stages.length) {
          stages[stage].run(k);
          doneWeight += stages[stage].weight;
          k++;
          if (k >= stages[stage].count) {
            stage++;
            k = 0;
          }
          if (performance.now() - start > budgetMs) break;
        }
        const done = stage >= stages.length;
        return { done, progress: done ? 1 : doneWeight / totalWeight, label: done ? "Done" : stages[stage].label };
      },
    };
  }

  QY.World = {
    SIZE,
    H,
    CHUNKS,
    blocks,
    light,
    tops,
    heights,
    edits,
    spawn,
    index,
    inside,
    get,
    topAt,
    skyAt,
    lightAt,
    isSolid: (x, y, z) => T_SOLID[get(x, y, z)] === 1,
    setBlock,
    raycast,
    generator,
    serializeEdits,
    columnHeight,
  };
})(window.QY = window.QY || {});
