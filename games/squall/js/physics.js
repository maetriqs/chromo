// Squall: collider registry, character movement and raycasts. By The_headphones
//
// Collider shapes:
//   box  {minX,minY,minZ,maxX,maxY,maxZ}          solid, standable on top
//   cyl  {x,z,r,minY,maxY}                         solid, standable on top
//   ramp {minX,minZ,maxX,maxZ,y0,rise,dir}         walkable slope (dir 0:+x 1:+z 2:-x 3:-z)
//   roof {minX,minZ,maxX,maxZ,y0,rise}             walkable pyramid
// Every collider may carry `surface`, `owner` (build piece, harvestable, barrel).
(function (SQ) {
  const { CFG, U } = SQ;
  const CELL = 8;
  const STEP = CFG.STEP_HEIGHT;
  const grid = new Map();
  const list = [];
  const scratch = [];
  let stamp = 0;
  let lastSurface = "grass";

  const cellKey = (ix, iz) => (ix + 2048) * 4096 + (iz + 2048);

  function computeBounds(c) {
    if (c.shape === "cyl") {
      c.minX = c.x - c.r;
      c.maxX = c.x + c.r;
      c.minZ = c.z - c.r;
      c.maxZ = c.z + c.r;
    } else if (c.shape === "ramp" || c.shape === "roof") {
      c.minY = c.y0;
      c.maxY = c.y0 + c.rise;
    }
  }

  function add(c) {
    computeBounds(c);
    c.cells = [];
    const x0 = Math.floor(c.minX / CELL);
    const x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL);
    const z1 = Math.floor(c.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = cellKey(ix, iz);
        let bucket = grid.get(k);
        if (!bucket) grid.set(k, (bucket = []));
        bucket.push(c);
        c.cells.push(k);
      }
    }
    c.index = list.length;
    list.push(c);
    c.alive = true;
    return c;
  }

  function remove(c) {
    if (!c.alive) return;
    c.alive = false;
    for (const k of c.cells) {
      const bucket = grid.get(k);
      const i = bucket.indexOf(c);
      if (i >= 0) bucket.splice(i, 1);
    }
    const last = list.pop();
    if (last !== c) {
      list[c.index] = last;
      last.index = c.index;
    }
  }

  function query(minX, minZ, maxX, maxZ, out) {
    stamp += 1;
    out.length = 0;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const bucket = grid.get(cellKey(ix, iz));
        if (!bucket) continue;
        for (const c of bucket) {
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  function surfaceAt(c, x, z) {
    if (c.shape === "ramp") {
      let t;
      if (c.dir === 0) t = (x - c.minX) / (c.maxX - c.minX);
      else if (c.dir === 1) t = (z - c.minZ) / (c.maxZ - c.minZ);
      else if (c.dir === 2) t = (c.maxX - x) / (c.maxX - c.minX);
      else t = (c.maxZ - z) / (c.maxZ - c.minZ);
      return c.y0 + c.rise * U.clamp(t, 0, 1);
    }
    const hx = Math.abs(x - (c.minX + c.maxX) / 2) / ((c.maxX - c.minX) / 2);
    const hz = Math.abs(z - (c.minZ + c.maxZ) / 2) / ((c.maxZ - c.minZ) / 2);
    return c.y0 + c.rise * (1 - U.clamp(Math.max(hx, hz), 0, 1));
  }

  function insideFootprint(c, x, z) {
    return x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ;
  }

  function groundHeight(x, z, feet, r) {
    const terrain = SQ.Terrain.height(x, z);
    let best = Math.max(terrain, -1.1);
    lastSurface = terrain < 1.9 ? "sand" : "grass";
    query(x - r, z - r, x + r, z + r, scratch);
    for (const c of scratch) {
      if (c.shape === "ramp" || c.shape === "roof") {
        if (!insideFootprint(c, x, z)) continue;
        const s = surfaceAt(c, x, z);
        if (s <= feet + STEP * 1.6 && s > best) {
          best = s;
          lastSurface = c.surface || "wood";
        }
        continue;
      }
      if (c.maxY > feet + STEP + 0.01 || c.maxY <= best) continue;
      let overlap;
      if (c.shape === "box") {
        const dx = x - U.clamp(x, c.minX, c.maxX);
        const dz = z - U.clamp(z, c.minZ, c.maxZ);
        overlap = dx * dx + dz * dz < r * r * 0.56;
      } else {
        overlap = Math.hypot(x - c.x, z - c.z) < c.r + r * 0.4;
      }
      if (overlap) {
        best = c.maxY;
        lastSurface = c.surface || "stone";
      }
    }
    return best;
  }

  function ceilingHeight(x, z, feet, r) {
    let ceil = Infinity;
    query(x - r, z - r, x + r, z + r, scratch);
    for (const c of scratch) {
      if (c.shape !== "box" || c.minY < feet + 0.25 || c.minY >= ceil) continue;
      const dx = x - U.clamp(x, c.minX, c.maxX);
      const dz = z - U.clamp(z, c.minZ, c.maxZ);
      if (dx * dx + dz * dz < r * r * 0.64) ceil = c.minY;
    }
    return ceil;
  }

  function resolveHorizontal(ch, height) {
    const r = ch.radius;
    const feet = ch.pos.y;
    for (let iter = 0; iter < 2; iter++) {
      query(ch.pos.x - r - 0.2, ch.pos.z - r - 0.2, ch.pos.x + r + 0.2, ch.pos.z + r + 0.2, scratch);
      for (const c of scratch) {
        if (c.shape === "ramp" || c.shape === "roof") continue;
        if (c.maxY <= feet + STEP || c.minY >= feet + height - 0.05) continue;
        let nx;
        let nz;
        let depth;
        if (c.shape === "box") {
          const px = U.clamp(ch.pos.x, c.minX, c.maxX);
          const pz = U.clamp(ch.pos.z, c.minZ, c.maxZ);
          const dx = ch.pos.x - px;
          const dz = ch.pos.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            nz = dz / d;
            depth = r - d;
          } else {
            const left = ch.pos.x - c.minX;
            const right = c.maxX - ch.pos.x;
            const back = ch.pos.z - c.minZ;
            const front = c.maxZ - ch.pos.z;
            const m = Math.min(left, right, back, front);
            nx = m === left ? -1 : m === right ? 1 : 0;
            nz = nx !== 0 ? 0 : m === back ? -1 : 1;
            depth = m + r;
          }
        } else {
          const dx = ch.pos.x - c.x;
          const dz = ch.pos.z - c.z;
          const d = Math.hypot(dx, dz);
          if (d >= c.r + r) continue;
          nx = d > 1e-6 ? dx / d : 1;
          nz = d > 1e-6 ? dz / d : 0;
          depth = c.r + r - d;
        }
        ch.pos.x += nx * depth;
        ch.pos.z += nz * depth;
        const vn = ch.vel.x * nx + ch.vel.z * nz;
        if (vn < 0) {
          ch.vel.x -= vn * nx;
          ch.vel.z -= vn * nz;
        }
        ch.blocked = true;
      }
    }
  }

  // Moves a character by its velocity and returns the landing speed (0 if it didn't land).
  function moveCharacter(ch, dt, gravityScale = 1) {
    const height = ch.currentHeight();
    const travel = Math.hypot(ch.vel.x, ch.vel.z) * dt;
    const steps = Math.max(1, Math.ceil(travel / (ch.radius * 0.8)));
    ch.blocked = false;
    for (let s = 0; s < steps; s++) {
      ch.pos.x += (ch.vel.x * dt) / steps;
      ch.pos.z += (ch.vel.z * dt) / steps;
      resolveHorizontal(ch, height);
    }
    const r = Math.hypot(ch.pos.x, ch.pos.z);
    if (r > CFG.BOUNDARY) {
      ch.pos.x *= CFG.BOUNDARY / r;
      ch.pos.z *= CFG.BOUNDARY / r;
      ch.blocked = true;
    }

    const ground = groundHeight(ch.pos.x, ch.pos.z, ch.pos.y, ch.radius);
    ch.vel.y -= CFG.GRAVITY * gravityScale * dt;
    let y = ch.pos.y + ch.vel.y * dt;
    if (ch.vel.y > 0) {
      const ceil = ceilingHeight(ch.pos.x, ch.pos.z, ch.pos.y, ch.radius);
      if (y + height > ceil) {
        y = ceil - height;
        ch.vel.y = 0;
      }
    }
    let landed = 0;
    if (y <= ground) {
      if (!ch.onGround) landed = -ch.vel.y;
      y = ground;
      ch.vel.y = 0;
      ch.onGround = true;
    } else if (ch.onGround && ch.vel.y <= 0 && ch.pos.y - ground < 0.6) {
      y = ground;
      ch.vel.y = 0;
    } else {
      ch.onGround = false;
    }
    ch.pos.y = y;
    ch.surface = lastSurface;
    ch.inWater = SQ.Terrain.height(ch.pos.x, ch.pos.z) < -0.3 && y < 0.2;
    return landed;
  }

  // ---- Raycasting ----
  const hit = { dist: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, kind: null, collider: null, character: null, headshot: false };
  let slabAxis = -1;
  let slabSign = 0;

  // Ray/AABB entry distance; -1 on miss or when the ray starts inside the box.
  let tmin = 0;
  let tmax = 0;
  function slabAxisTest(lo, hi, o, inv, axis) {
    let t1 = (lo - o) * inv;
    let t2 = (hi - o) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      slabAxis = axis;
      slabSign = sign;
    }
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  }

  function slab(c, ox, oy, oz, ix, iy, iz, maxT) {
    tmin = 0;
    tmax = maxT;
    slabAxis = -1;
    if (!slabAxisTest(c.minX, c.maxX, ox, ix, 0)) return -1;
    if (!slabAxisTest(c.minY, c.maxY, oy, iy, 1)) return -1;
    if (!slabAxisTest(c.minZ, c.maxZ, oz, iz, 2)) return -1;
    return slabAxis === -1 ? -1 : tmin;
  }

  function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1, maxT) {
    const px = ox - cx;
    const pz = oz - cz;
    const a = dx * dx + dz * dz;
    let best = -1;
    if (a > 1e-9) {
      const b = 2 * (px * dx + pz * dz);
      const c = px * px + pz * pz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t >= 0 && t < maxT) {
          const y = oy + dy * t;
          if (y >= y0 && y <= y1) best = t;
        }
      }
    }
    if (dy < 0 && oy > y1) {
      const t = (y1 - oy) / dy;
      if (t >= 0 && t < maxT && (best < 0 || t < best)) {
        const x = px + dx * t;
        const z = pz + dz * t;
        if (x * x + z * z <= r * r) best = t;
      }
    }
    return best;
  }

  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const px = ox - cx;
    const py = oy - cy;
    const pz = oz - cz;
    const b = px * dx + py * dy + pz * dz;
    const c = px * px + py * py + pz * pz - r * r;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t >= 0 ? t : -1;
  }

  function rayRamp(c, ox, oy, oz, dx, dy, dz, maxT) {
    const alongX = c.dir === 0 || c.dir === 2;
    const span = alongX ? c.maxX - c.minX : c.maxZ - c.minZ;
    const k = (c.dir < 2 ? 1 : -1) * (c.rise / span);
    const ref = c.dir === 0 ? c.minX : c.dir === 1 ? c.minZ : c.dir === 2 ? c.maxX : c.maxZ;
    const ou = alongX ? ox : oz;
    const du = alongX ? dx : dz;
    const denom = dy - k * du;
    if (Math.abs(denom) < 1e-6) return -1;
    const t = (c.y0 + k * (ou - ref) - oy) / denom;
    if (t < 0 || t >= maxT) return -1;
    const x = ox + dx * t;
    const z = oz + dz * t;
    if (x < c.minX - 0.01 || x > c.maxX + 0.01 || z < c.minZ - 0.01 || z > c.maxZ + 0.01) return -1;
    const len = Math.hypot(k, 1);
    hit.nx = alongX ? -k / len : 0;
    hit.nz = alongX ? 0 : -k / len;
    hit.ny = 1 / len;
    return t;
  }

  function record(t, kind, collider, character) {
    hit.dist = t;
    hit.kind = kind;
    hit.collider = collider;
    hit.character = character;
  }

  // opts: { characters: bool, ignore: Character, terrain: bool }
  function raycast(ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
    hit.dist = maxDist;
    hit.kind = null;
    hit.collider = null;
    hit.character = null;
    hit.headshot = false;
    const ix = dx !== 0 ? 1 / dx : 1e12;
    const iy = dy !== 0 ? 1 / dy : 1e12;
    const iz = dz !== 0 ? 1 / dz : 1e12;
    let nx = 0;
    let ny = 1;
    let nz = 0;

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const t = slab(c, ox, oy, oz, ix, iy, iz, hit.dist);
      if (t < 0 || t >= hit.dist) continue;
      if (c.shape === "box" || c.shape === "roof") {
        record(t, "collider", c, null);
        nx = slabAxis === 0 ? slabSign : 0;
        ny = slabAxis === 1 ? slabSign : 0;
        nz = slabAxis === 2 ? slabSign : 0;
      } else if (c.shape === "cyl") {
        const tc = rayCylinder(ox, oy, oz, dx, dy, dz, c.x, c.z, c.r, c.minY, c.maxY, hit.dist);
        if (tc >= 0) {
          record(tc, "collider", c, null);
          const px = ox + dx * tc - c.x;
          const pz = oz + dz * tc - c.z;
          const len = Math.hypot(px, pz) || 1;
          nx = px / len;
          ny = 0;
          nz = pz / len;
        }
      } else {
        const tr = rayRamp(c, ox, oy, oz, dx, dy, dz, hit.dist);
        if (tr >= 0) {
          record(tr, "collider", c, null);
          nx = hit.nx;
          ny = hit.ny;
          nz = hit.nz;
        }
      }
    }

    if (opts.terrain !== false && !(oy > 60 && dy >= 0)) {
      const H = SQ.Terrain.height;
      const step = 1.2;
      let prevT = 0;
      if (oy - H(ox, oz) > 0) {
        for (let t = step; ; t += step) {
          const tt = Math.min(t, hit.dist);
          if (oy + dy * tt - H(ox + dx * tt, oz + dz * tt) < 0) {
            let lo = prevT;
            let hiT = tt;
            for (let k = 0; k < 8; k++) {
              const mid = (lo + hiT) / 2;
              if (oy + dy * mid - H(ox + dx * mid, oz + dz * mid) < 0) hiT = mid;
              else lo = mid;
            }
            record(hiT, "terrain", null, null);
            const x = ox + dx * hiT;
            const z = oz + dz * hiT;
            const gx = H(x - 0.5, z) - H(x + 0.5, z);
            const gz = H(x, z - 0.5) - H(x, z + 0.5);
            const len = Math.hypot(gx, 1, gz);
            nx = gx / len;
            ny = 1 / len;
            nz = gz / len;
            break;
          }
          prevT = tt;
          if (tt >= hit.dist) break;
        }
      }
    }

    if (opts.characters && SQ.Game) {
      for (const ch of SQ.Game.characters) {
        if (!ch.alive || ch === opts.ignore) continue;
        const ex = ch.pos.x - ox;
        const ez = ch.pos.z - oz;
        const along = ex * dx + ez * dz;
        if (along < -1 || along > hit.dist + 1) continue;
        const crouch = ch.crouching;
        const headY = ch.pos.y + (crouch ? 1.18 : 1.62);
        const th = raySphere(ox, oy, oz, dx, dy, dz, ch.pos.x, headY, ch.pos.z, 0.27);
        const tb = rayCylinder(ox, oy, oz, dx, dy, dz, ch.pos.x, ch.pos.z, 0.42, ch.pos.y, ch.pos.y + (crouch ? 0.98 : 1.4), hit.dist);
        let t = -1;
        let head = false;
        if (th >= 0 && (tb < 0 || th <= tb)) {
          t = th;
          head = true;
        } else if (tb >= 0) {
          t = tb;
        }
        if (t >= 0 && t < hit.dist) {
          record(t, "character", null, ch);
          hit.headshot = head;
          nx = -dx;
          ny = -dy;
          nz = -dz;
        }
      }
    }

    if (!hit.kind) return null;
    hit.x = ox + dx * hit.dist;
    hit.y = oy + dy * hit.dist;
    hit.z = oz + dz * hit.dist;
    hit.nx = nx;
    hit.ny = ny;
    hit.nz = nz;
    return hit;
  }

  function lineBlocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return false;
    const h = raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
    return h !== null && h.dist < len - 0.3;
  }

  function clear() {
    grid.clear();
    list.length = 0;
  }

  SQ.Physics = { add, remove, query, groundHeight, moveCharacter, raycast, lineBlocked, surfaceAt, clear, list };
})(window.SQ = window.SQ || {});
