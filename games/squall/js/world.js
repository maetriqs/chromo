// Squall: Kestrel Isle. Points of interest, buildings, props, trees and rocks. By The_headphones
(function (SQ) {
  const { U } = SQ;
  const UP = new THREE.Vector3(0, 1, 0);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  const colorCache = new Map();
  const color = (hex) => {
    if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex));
    return colorCache.get(hex);
  };

  const PALETTE = {
    walls: ["#dccdb0", "#b7cfd4", "#e2b8a0", "#c7d3ae", "#e6d69c", "#d9c2d0"],
    roofs: ["#a5503d", "#3e5f7a", "#5b6a46", "#7b4a3b", "#4f4a63"],
    trim: "#efe9dc",
    glass: "#2e4a5d",
    door: "#5a3f2e",
    foundation: "#8d8a82",
    wood: "#a9784b",
    woodDark: "#7a5434",
    metal: "#8d98a2",
    metalDark: "#5f6a73",
    rust: "#a4603c",
    containers: ["#b8462f", "#2f6f9f", "#3e7d4f", "#c99a2e", "#6f4f8f", "#d26b3a"],
    cars: ["#c0392b", "#2e86c1", "#e5c04a", "#ecf0f1", "#27ae60", "#34495e"],
  };

  let rng;
  let entries;
  let footprints;
  let chests;
  let lootSpots;
  let trees;
  let rocks;
  let hay;
  let barrels;

  const rnd = (min, max) => min + rng() * (max - min);
  const rpick = (list) => list[Math.floor(rng() * list.length)];

  function matrixFor(cx, cy, cz, sx, sy, sz, rotY = 0, rotX = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, "YXZ"));
    return new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), q, new THREE.Vector3(sx, sy, sz));
  }

  // y0 is the bottom of the box.
  function visBox(cx, y0, cz, w, h, d, hex, shade = 0.22, rotY = 0) {
    entries.push({ geometry: unitBox, matrix: matrixFor(cx, y0 + h / 2, cz, w, h, d, rotY), color: color(hex), shade });
  }

  function solidBox(cx, y0, cz, w, h, d, hex, surface = "stone", extra = {}) {
    visBox(cx, y0, cz, w, h, d, hex);
    return SQ.Physics.add({ shape: "box", minX: cx - w / 2, maxX: cx + w / 2, minY: y0, maxY: y0 + h, minZ: cz - d / 2, maxZ: cz + d / 2, surface, ...extra });
  }

  function visCyl(cx, y0, cz, r, h, hex, shade = 0.15) {
    entries.push({ geometry: unitCyl, matrix: matrixFor(cx, y0 + h / 2, cz, r, h, r), color: color(hex), shade });
  }

  function solidCyl(cx, y0, cz, r, h, hex, surface = "metal", extra = {}) {
    visCyl(cx, y0, cz, r, h, hex);
    return SQ.Physics.add({ shape: "cyl", x: cx, z: cz, r, minY: y0, maxY: y0 + h, surface, ...extra });
  }

  // A walkable ramp: visual plank plus a slope collider. dir 0:+x 1:+z 2:-x 3:-z (rising direction).
  function ramp(minX, minZ, maxX, maxZ, y0, rise, dir, hex) {
    const alongX = dir === 0 || dir === 2;
    const run = alongX ? maxX - minX : maxZ - minZ;
    const width = alongX ? maxZ - minZ : maxX - minX;
    const len = Math.hypot(run, rise);
    const angle = Math.atan2(rise, run);
    const rotY = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][dir];
    const m = matrixFor((minX + maxX) / 2, y0 + rise / 2, (minZ + maxZ) / 2, width, 0.22, len, rotY + Math.PI, angle);
    entries.push({ geometry: unitBox, matrix: m, color: color(hex), shade: 0 });
    return SQ.Physics.add({ shape: "ramp", minX, minZ, maxX, maxZ, y0, rise, dir, surface: "wood" });
  }

  function overlapsFootprint(x, z, hw, hd, margin = 1.5) {
    return footprints.some((f) => Math.abs(f.x - x) < f.hw + hw + margin && Math.abs(f.z - z) < f.hd + hd + margin);
  }

  function addFootprint(x, z, hw, hd, hex) {
    footprints.push({ x, z, hw, hd, color: hex });
  }

  function addChest(x, y, z, rotY = 0) {
    chests.push({ x, y, z, rotY });
  }

  // Houses are authored in local space (door on local +z) and rotated in 90° steps
  // so every collider stays axis-aligned.
  function house({ x, z, w, d, h = 3.4, rot = 0, wall, roof, ruined = false, door = 0, chestInside = true, roofLess = false }) {
    const base = SQ.Terrain.height(x, z);
    const t = 0.3;
    const cos = [1, 0, -1, 0][rot];
    const sin = [0, 1, 0, -1][rot];
    const toWorld = (lx, lz) => [x + lx * cos - lz * sin, z + lx * sin + lz * cos];
    const dims = (lw, ld) => (rot % 2 ? [ld, lw] : [lw, ld]);
    const part = (lx, ly, lz, lw, lh, ld, hex, solid = true, surface = "wood") => {
      if (ruined && solid && ly > 0.2 && rng() < 0.18) return;
      const [wx, wz] = toWorld(lx, lz);
      const [ww, wd] = dims(lw, ld);
      let height = lh;
      if (ruined && solid && lh > 1.5) height = lh * rnd(0.35, 1);
      if (solid) solidBox(wx, base + ly, wz, ww, height, wd, hex, surface);
      else visBox(wx, base + ly, wz, ww, height, wd, hex, 0);
    };
    const dirFor = (lx, lz) => {
      const wx = lx * cos - lz * sin;
      const wz = lx * sin + lz * cos;
      if (Math.abs(wx) > Math.abs(wz)) return wx > 0 ? 0 : 2;
      return wz > 0 ? 1 : 3;
    };

    const [fw, fd] = dims(w, d);
    addFootprint(x, z, fw / 2, fd / 2, ruined ? "#8a8070" : roof);
    solidBox(x, base - 1.6, z, fw + 0.4, 1.85, fd + 0.4, PALETTE.foundation, "stone");
    const floorY = 0.25;

    part(0, floorY, -(d / 2 - t / 2), w, h, t, wall);
    part(-(w / 2 - t / 2), floorY, 0, t, h, d - 2 * t, wall);
    part(w / 2 - t / 2, floorY, 0, t, h, d - 2 * t, wall);
    const dw = 1.6;
    const leftW = door - dw / 2 + w / 2;
    const rightW = w / 2 - (door + dw / 2);
    part(-w / 2 + leftW / 2, floorY, d / 2 - t / 2, leftW, h, t, wall);
    part(door + dw / 2 + rightW / 2, floorY, d / 2 - t / 2, rightW, h, t, wall);
    part(door, floorY + 2.4, d / 2 - t / 2, dw, h - 2.4, t, wall);
    if (!ruined) {
      part(door - dw / 2 - 0.08, floorY, d / 2 - t / 2, 0.16, 2.5, t + 0.06, PALETTE.trim, false);
      part(door + dw / 2 + 0.08, floorY, d / 2 - t / 2, 0.16, 2.5, t + 0.06, PALETTE.trim, false);
      part(door, floorY + 2.4, d / 2 - t / 2, dw + 0.32, 0.16, t + 0.06, PALETTE.trim, false);
    }

    const windows = [
      [-(w / 2 - t / 2), 0, t + 0.08, 1.3],
      [w / 2 - t / 2, 0, t + 0.08, 1.3],
      [-w / 4, -(d / 2 - t / 2), 1.3, t + 0.08],
      [w / 4, -(d / 2 - t / 2), 1.3, t + 0.08],
    ];
    if (!ruined) {
      windows.forEach(([lx, lz, sw, sd]) => {
        part(lx, floorY + 1.05, lz, sw + (sw > 1 ? 0.25 : 0), 1.25, sd + (sd > 1 ? 0.25 : 0), PALETTE.trim, false);
        part(lx, floorY + 1.15, lz, sw + (sw > 1 ? 0 : 0.03), 1.05, sd + (sd > 1 ? 0 : 0.03), PALETTE.glass, false);
      });
    }

    if (!ruined && !roofLess) {
      const top = base + floorY + h;
      const rh = Math.min(2.2, d * 0.32);
      const g = SQ.U.gableGeometry(w + 0.6, d + 0.8, rh);
      entries.push({ geometry: g, matrix: matrixFor(x, top, z, 1, 1, 1, -rot * Math.PI / 2), color: color(roof), shade: 0 });
      SQ.Physics.add({ shape: "box", minX: x - fw / 2, maxX: x + fw / 2, minY: top - 0.2, maxY: top, minZ: z - fd / 2, maxZ: z + fd / 2, surface: "wood" });
      const half = d / 2 + 0.4;
      const frontRect = rectFromLocal(toWorld, -w / 2 - 0.3, 0, w / 2 + 0.3, half);
      const backRect = rectFromLocal(toWorld, -w / 2 - 0.3, -half, w / 2 + 0.3, 0);
      SQ.Physics.add({ shape: "ramp", ...frontRect, y0: top, rise: rh, dir: dirFor(0, -1), surface: "wood" });
      SQ.Physics.add({ shape: "ramp", ...backRect, y0: top, rise: rh, dir: dirFor(0, 1), surface: "wood" });
      if (rng() < 0.5) {
        const [cx, cz] = toWorld(w / 4, -d / 6);
        visBox(cx, top, cz, 0.7, rh + 0.8, 0.7, "#8a5a46");
      }
    }

    if (ruined) {
      for (let i = 0; i < 4; i++) {
        const [rx, rz] = toWorld(rnd(-w / 2, w / 2), rnd(-d / 2, d / 2));
        solidBox(rx, base + floorY, rz, rnd(0.6, 1.4), rnd(0.3, 0.8), rnd(0.6, 1.4), "#7d766a", "stone");
      }
    } else {
      const [tx, tz] = toWorld(-w / 4, d / 6);
      solidBox(tx, base + floorY, tz, 1.4, 0.8, 0.9, PALETTE.woodDark, "wood");
    }
    if (chestInside) {
      const [cx, cz] = toWorld(w / 2 - 1.1, -(d / 2 - 1.0));
      addChest(cx, base + floorY, cz, -rot * Math.PI / 2);
    }
    const [lx, lz] = toWorld(0.6, 0.4);
    lootSpots.push({ x: lx, y: base + floorY, z: lz });
  }

  function rectFromLocal(toWorld, ax, az, bx, bz) {
    const [x1, z1] = toWorld(ax, az);
    const [x2, z2] = toWorld(bx, bz);
    return { minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2) };
  }

  function rotFacing(dx, dz) {
    // Door (local +z) should face the given direction.
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 1;
    return dz > 0 ? 0 : 2;
  }

  function placeRing(poi, radius, count, sizeFn, place) {
    const offset = rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const x = poi.x + Math.cos(a) * radius;
      const z = poi.z + Math.sin(a) * radius;
      const { w, d } = sizeFn();
      const half = Math.max(w, d) / 2;
      if (SQ.Terrain.distToRoad(x, z) < half + 4) continue;
      if (overlapsFootprint(x, z, half, half, 2.5)) continue;
      place(x, z, w, d, rotFacing(poi.x - x, poi.z - z));
    }
  }

  function car(x, z, rotY) {
    const y = SQ.Terrain.height(x, z);
    const hex = rpick(PALETTE.cars);
    const along = Math.abs(Math.sin(rotY)) > 0.5;
    const [w, d] = along ? [4.2, 1.9] : [1.9, 4.2];
    const harvest = { hp: 300, mats: 30, surface: "metal" };
    solidBox(x, y + 0.35, z, w, 0.9, d, hex, "metal", { harvest });
    const [cw, cd] = along ? [2.2, 1.7] : [1.7, 2.2];
    solidBox(x, y + 1.25, z, cw, 0.75, cd, "#3a4a58", "metal", { harvest });
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => {
      const wx = x + (along ? a * 1.4 : b * 0.9);
      const wz = z + (along ? b * 0.9 : a * 1.4);
      visCyl(wx, y, wz, 0.36, 0.7, "#1e2328");
    }));
  }

  function container(x, y0, z, along, hex) {
    const [w, d] = along ? [6.1, 2.5] : [2.5, 6.1];
    solidBox(x, y0, z, w, 2.6, d, hex, "metal");
    for (let i = -2; i <= 2; i++) {
      const ox = along ? i * 1.2 : 0;
      const oz = along ? 0 : i * 1.2;
      visBox(x + ox, y0 + 0.1, z + oz, along ? 0.12 : d + 0.06, 2.4, along ? d + 0.06 : 0.12, PALETTE.metalDark, 0);
    }
    addFootprint(x, z, w / 2, d / 2, hex);
  }

  function warehouse(x, z, rot) {
    const base = SQ.Terrain.height(x, z);
    const w = rot % 2 ? 16 : 24;
    const d = rot % 2 ? 24 : 16;
    const h = 8;
    const t = 0.4;
    const wallHex = rpick(["#8b96a1", "#9d917f", "#7f8f8a"]);
    addFootprint(x, z, w / 2, d / 2, "#6f7a82");
    solidBox(x, base - 1.6, z, w + 0.6, 1.8, d + 0.6, PALETTE.foundation, "stone");
    const floor = base + 0.2;
    // Doorways cut through the two long walls.
    const long = rot % 2 ? "z" : "x";
    const span = long === "x" ? w : d;
    const doorW = 5;
    const segW = (span - doorW) / 2;
    [-1, 1].forEach((side) => {
      [-1, 1].forEach((half) => {
        const offset = half * (doorW / 2 + segW / 2);
        if (long === "x") solidBox(x + offset, floor, z + side * (d / 2 - t / 2), segW, h, t, wallHex, "metal");
        else solidBox(x + side * (w / 2 - t / 2), floor, z + offset, t, h, segW, wallHex, "metal");
      });
      if (long === "x") solidBox(x, floor + 5.5, z + side * (d / 2 - t / 2), doorW, h - 5.5, t, wallHex, "metal");
      else solidBox(x + side * (w / 2 - t / 2), floor + 5.5, z, t, h - 5.5, doorW, wallHex, "metal");
    });
    if (long === "x") {
      solidBox(x - w / 2 + t / 2, floor, z, t, h, d - 2 * t, wallHex, "metal");
      solidBox(x + w / 2 - t / 2, floor, z, t, h, d - 2 * t, wallHex, "metal");
    } else {
      solidBox(x, floor, z - d / 2 + t / 2, w - 2 * t, h, t, wallHex, "metal");
      solidBox(x, floor, z + d / 2 - t / 2, w - 2 * t, h, t, wallHex, "metal");
    }
    solidBox(x, floor + h, z, w + 0.4, 0.35, d + 0.4, "#6b7680", "metal");
    for (let i = -1; i <= 1; i++) {
      const ox = long === "x" ? i * 7 : 0;
      const oz = long === "x" ? 0 : i * 7;
      visBox(x + ox, floor + h + 0.35, z + oz, long === "x" ? 2.4 : w - 3, 0.5, long === "x" ? d - 3 : 2.4, PALETTE.rust);
    }
    // Mezzanine with a ramp, along the short wall.
    const mezH = 3.6;
    if (long === "x") {
      solidBox(x - w / 2 + 2.2, floor + mezH - 0.3, z, 4, 0.3, d - 2, PALETTE.metalDark, "metal");
      for (const s of [-1, 1]) solidBox(x - w / 2 + 4.0, floor, z + s * (d / 2 - 2), 0.3, mezH - 0.3, 0.3, PALETTE.metalDark, "metal");
      ramp(x - w / 2 + 4.2, z - d / 2 + 1, x - w / 2 + 4.2 + mezH, z - d / 2 + 3.2, floor, mezH, 2, PALETTE.wood);
      addChest(x - w / 2 + 1.6, floor + mezH, z + 2, Math.PI / 2);
    } else {
      solidBox(x, floor + mezH - 0.3, z - d / 2 + 2.2, w - 2, 0.3, 4, PALETTE.metalDark, "metal");
      for (const s of [-1, 1]) solidBox(x + s * (w / 2 - 2), floor, z - d / 2 + 4.0, 0.3, mezH - 0.3, 0.3, PALETTE.metalDark, "metal");
      ramp(x - w / 2 + 1, z - d / 2 + 4.2, x - w / 2 + 3.2, z - d / 2 + 4.2 + mezH, floor, mezH, 3, PALETTE.wood);
      addChest(x + 2, floor + mezH, z - d / 2 + 1.6, 0);
    }
    for (let i = 0; i < 6; i++) {
      const cx = x + rnd(-w / 2 + 6, w / 2 - 3);
      const cz = z + rnd(-d / 2 + 3, d / 2 - 3);
      if (Math.abs(long === "x" ? cx - x : cz - z) < 3.2) continue;
      const s = rnd(1.1, 1.6);
      solidBox(cx, floor, cz, s, s, s, PALETTE.wood, "wood", { harvest: { hp: 90, mats: 15, surface: "wood" } });
      if (rng() < 0.4) solidBox(cx, floor + s, cz, s * 0.8, s * 0.8, s * 0.8, PALETTE.woodDark, "wood", { harvest: { hp: 90, mats: 15, surface: "wood" } });
    }
    addChest(x + (long === "x" ? w / 4 : -w / 4), floor, z + (long === "x" ? -d / 4 : d / 4), 0);
    lootSpots.push({ x: x + 2, y: floor, z: z - 1 }, { x: x - 3, y: floor, z: z + 2 });
  }

  function barrel(x, z) {
    const y = SQ.Terrain.height(x, z);
    const b = { x, y, z, alive: true, index: barrels.length };
    b.collider = SQ.Physics.add({ shape: "cyl", x, z, r: 0.45, minY: y, maxY: y + 1.15, surface: "metal", barrel: b });
    barrels.push(b);
  }

  function tree(x, z, kind, scale = 1) {
    const y = SQ.Terrain.height(x, z);
    const h = (kind === "pine" ? rnd(6, 10) : rnd(4.5, 7)) * scale;
    const t = { x, y, z, h, kind, scale, alive: true, dead: kind === "dead", tint: rnd(-0.06, 0.06) };
    t.collider = SQ.Physics.add({ shape: "cyl", x, z, r: 0.42 * scale, minY: y, maxY: y + h * 0.75, surface: "wood", harvest: { hp: 120, mats: 12, surface: "wood", tree: t } });
    trees.push(t);
    return t;
  }

  function rock(x, z, size) {
    const y = SQ.Terrain.height(x, z);
    const r = { x, y, z, size, rot: rnd(0, Math.PI), alive: true, tint: rnd(-0.05, 0.05) };
    r.collider = SQ.Physics.add({
      shape: "box", minX: x - size * 0.8, maxX: x + size * 0.8, minZ: z - size * 0.8, maxZ: z + size * 0.8,
      minY: y - 0.5, maxY: y + size * 1.1, surface: "stone", harvest: { hp: 160, mats: 14, surface: "stone", rock: r },
    });
    rocks.push(r);
  }

  function hayBale(x, z) {
    const y = SQ.Terrain.height(x, z);
    const h = { x, y, z, alive: true };
    h.collider = SQ.Physics.add({ shape: "cyl", x, z, r: 0.9, minY: y, maxY: y + 1.3, surface: "grass", harvest: { hp: 60, mats: 8, surface: "wood", hay: h } });
    hay.push(h);
  }

  function fenceLine(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const posts = Math.floor(len / 2.5);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      visBox(x, SQ.Terrain.height(x, z), z, 0.18, 1.1, 0.18, PALETTE.woodDark);
    }
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const y = SQ.Terrain.height(cx, cz);
    visBox(cx, y + 0.75, cz, alongX ? len : 0.08, 0.12, alongX ? 0.08 : len, PALETTE.wood, 0);
    visBox(cx, y + 0.4, cz, alongX ? len : 0.08, 0.12, alongX ? 0.08 : len, PALETTE.wood, 0);
  }

  // ---- Points of interest ----
  function millbrook(poi) {
    const sizes = () => ({ w: rnd(7, 9.5), d: rnd(6, 8) });
    const build = (x, z, w, d, rot) => house({ x, z, w, d, rot, wall: rpick(PALETTE.walls), roof: rpick(PALETTE.roofs), door: rnd(-1, 1) });
    placeRing(poi, 17, 7, sizes, build);
    placeRing(poi, 31, 9, sizes, build);
    // Water tower in the square.
    const tx = poi.x + 6;
    const tz = poi.z + 6;
    const ty = SQ.Terrain.height(tx, tz);
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => solidBox(tx + a * 1.6, ty, tz + b * 1.6, 0.3, 9, 0.3, PALETTE.metalDark, "metal")));
    solidCyl(tx, ty + 9, tz, 2.6, 3.6, "#c7d6d9", "metal");
    visCyl(tx, ty + 12.6, tz, 2.75, 0.5, "#a5503d");
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2;
      const r = rnd(8, 26);
      const x = poi.x + Math.cos(a) * r;
      const z = poi.z + Math.sin(a) * r;
      if (SQ.Terrain.distToRoad(x, z) < 6 && SQ.Terrain.distToRoad(x, z) > 3 && !overlapsFootprint(x, z, 2.5, 2.5, 0.5)) car(x, z, rng() < 0.5 ? 0 : Math.PI / 2);
    }
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const x = poi.x + Math.cos(a) * rnd(5, 34);
      const z = poi.z + Math.sin(a) * rnd(5, 34);
      if (!overlapsFootprint(x, z, 0.5, 0.5, 1)) lootSpots.push({ x, y: SQ.Terrain.height(x, z), z });
    }
  }

  function rustworks(poi) {
    warehouse(poi.x - 13, poi.z - 12, 0);
    warehouse(poi.x + 15, poi.z + 10, 1);
    solidCyl(poi.x + 14, SQ.Terrain.height(poi.x + 14, poi.z - 16), poi.z - 16, 3.6, 7.5, "#c9c4b6", "metal");
    solidCyl(poi.x + 22, SQ.Terrain.height(poi.x + 22, poi.z - 10), poi.z - 10, 3.0, 6.5, "#b9b3a3", "metal");
    addFootprint(poi.x + 18, poi.z - 13, 7, 6, "#b9b3a3");
    solidCyl(poi.x - 2, SQ.Terrain.height(poi.x - 2, poi.z + 18), poi.z + 18, 1.4, 24, PALETTE.rust, "metal");
    for (let i = 0; i < 14; i++) {
      const x = poi.x + rnd(-30, 30);
      const z = poi.z + rnd(-28, 28);
      const along = rng() < 0.5;
      if (overlapsFootprint(x, z, 3.2, 3.2, 1.2) || SQ.Terrain.distToRoad(x, z) < 6) continue;
      const y = SQ.Terrain.height(x, z);
      const hex = rpick(PALETTE.containers);
      container(x, y, z, along, hex);
      if (rng() < 0.35) solidBox(x, y + 2.6, z, along ? 6.1 : 2.5, 2.6, along ? 2.5 : 6.1, rpick(PALETTE.containers), "metal");
      else if (rng() < 0.4) lootSpots.push({ x, y: y + 2.6, z });
    }
    for (let i = 0; i < 8; i++) {
      const x = poi.x + rnd(-26, 26);
      const z = poi.z + rnd(-26, 26);
      if (!overlapsFootprint(x, z, 0.6, 0.6, 0.6)) barrel(x, z);
    }
    for (let i = 0; i < 4; i++) {
      const x = poi.x + rnd(-25, 25);
      const z = poi.z + rnd(-25, 25);
      if (!overlapsFootprint(x, z, 0.5, 0.5, 1)) lootSpots.push({ x, y: SQ.Terrain.height(x, z), z });
    }
  }

  function pinewood(poi) {
    house({ x: poi.x, z: poi.z, w: 7, d: 6, rot: 0, wall: "#8a6440", roof: "#4a5a3a" });
    let placed = 0;
    for (let i = 0; i < 400 && placed < 120; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * poi.radius * 1.15;
      const x = poi.x + Math.cos(a) * r;
      const z = poi.z + Math.sin(a) * r;
      if (overlapsFootprint(x, z, 0.5, 0.5, 2.5) || SQ.Terrain.height(x, z) < 2.4 || SQ.Terrain.distToRoad(x, z) < 5) continue;
      if (trees.some((t) => Math.abs(t.x - x) < 3 && Math.abs(t.z - z) < 3)) continue;
      tree(x, z, "pine", rnd(0.9, 1.25));
      placed++;
    }
    for (let i = 0; i < 10; i++) rock(poi.x + rnd(-40, 40), poi.z + rnd(-40, 40), rnd(0.8, 1.8));
    for (let i = 0; i < 5; i++) {
      const x = poi.x + rnd(-30, 30);
      const z = poi.z + rnd(-30, 30);
      lootSpots.push({ x, y: SQ.Terrain.height(x, z), z });
    }
    chests.push({ x: poi.x + 12, y: SQ.Terrain.height(poi.x + 12, poi.z - 9), z: poi.z - 9, rotY: 0.4 });
  }

  function highridge(poi) {
    const base = SQ.Terrain.height(poi.x, poi.z);
    const top = base + 9;
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => solidBox(poi.x + a * 2.6, base - 2, poi.z + b * 2.6, 0.4, 11, 0.4, PALETTE.woodDark, "wood")));
    solidBox(poi.x, top, poi.z, 6.4, 0.3, 6.4, PALETTE.wood, "wood");
    solidBox(poi.x, top + 0.3, poi.z - 3.1, 6.4, 1.0, 0.15, PALETTE.woodDark, "wood");
    solidBox(poi.x - 3.1, top + 0.3, poi.z, 0.15, 1.0, 6.4, PALETTE.woodDark, "wood");
    solidBox(poi.x, top + 0.3, poi.z + 3.1, 6.4, 1.0, 0.15, PALETTE.woodDark, "wood");
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => visBox(poi.x + a * 2.9, top + 0.3, poi.z + b * 2.9, 0.2, 2.6, 0.2, PALETTE.woodDark)));
    visBox(poi.x, top + 2.9, poi.z, 7, 0.3, 7, "#5b6a46");
    // Ramp climbs from the east into the open east edge of the platform.
    const run = 9.3;
    const lowY = Math.min(top - 8.5, SQ.Terrain.height(poi.x + 3.2 + run, poi.z));
    ramp(poi.x + 3.2, poi.z - 1.3, poi.x + 3.2 + run, poi.z + 1.3, lowY, top + 0.3 - lowY, 2, PALETTE.wood);
    addFootprint(poi.x, poi.z, 3.4, 3.4, "#7a5434");
    addChest(poi.x - 1.5, top + 0.3, poi.z - 1.5, 0);
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2;
      const r = rnd(8, poi.radius * 1.2);
      rock(poi.x + Math.cos(a) * r, poi.z + Math.sin(a) * r, rnd(0.8, 2.4));
    }
    for (let i = 0; i < 30; i++) {
      const a = rng() * Math.PI * 2;
      const r = rnd(10, poi.radius * 1.3);
      const x = poi.x + Math.cos(a) * r;
      const z = poi.z + Math.sin(a) * r;
      if (!overlapsFootprint(x, z, 0.5, 0.5, 1.5)) tree(x, z, "pine", rnd(0.8, 1.1));
    }
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2;
      const x = poi.x + Math.cos(a) * rnd(6, 30);
      const z = poi.z + Math.sin(a) * rnd(6, 30);
      lootSpots.push({ x, y: SQ.Terrain.height(x, z), z });
    }
  }

  function barley(poi) {
    house({ x: poi.x - 14, z: poi.z - 6, w: 14, d: 10, h: 5, rot: 0, wall: "#b4432f", roof: "#5a4a3c", door: 0 });
    house({ x: poi.x + 14, z: poi.z - 10, w: 8, d: 7, rot: 3, wall: rpick(PALETTE.walls), roof: rpick(PALETTE.roofs) });
    solidCyl(poi.x - 24, SQ.Terrain.height(poi.x - 24, poi.z - 4), poi.z - 4, 2.6, 12, "#c9c1ae", "metal");
    visCyl(poi.x - 24, SQ.Terrain.height(poi.x - 24, poi.z - 4) + 12, poi.z - 4, 2.7, 0.6, "#5a4a3c");
    addFootprint(poi.x - 24, poi.z - 4, 2.6, 2.6, "#c9c1ae");
    for (let i = 0; i < 26; i++) {
      const x = poi.x + rnd(-38, 38);
      const z = poi.z + rnd(-30, 36);
      if (!overlapsFootprint(x, z, 1, 1, 1.5) && SQ.Terrain.distToRoad(x, z) > 5) hayBale(x, z);
    }
    fenceLine(poi.x - 40, poi.z + 38, poi.x + 20, poi.z + 38);
    fenceLine(poi.x + 28, poi.z + 14, poi.x + 28, poi.z + 40);
    for (let i = 0; i < 6; i++) {
      const x = poi.x + rnd(-35, 35);
      const z = poi.z + rnd(-25, 35);
      lootSpots.push({ x, y: SQ.Terrain.height(x, z), z });
    }
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const r = rnd(poi.radius, poi.radius * 1.4);
      tree(poi.x + Math.cos(a) * r, poi.z + Math.sin(a) * r, "round");
    }
  }

  function hollowstead(poi) {
    const spots = [[-10, -8, 0], [10, -9, 0], [-9, 9, 2], [11, 8, 2], [0, -20, 0]];
    spots.forEach(([dx, dz, rot]) => {
      house({ x: poi.x + dx, z: poi.z + dz, w: rnd(6.5, 8.5), d: rnd(6, 7.5), rot, wall: "#a49c8c", roof: "#5a554c", ruined: true, door: 0 });
    });
    for (let i = 0; i < 10; i++) {
      const x = poi.x + rnd(-24, 24);
      const z = poi.z + rnd(-24, 24);
      if (!overlapsFootprint(x, z, 0.5, 0.5, 2)) tree(x, z, "dead", rnd(0.8, 1.2));
    }
    for (let i = 0; i < 4; i++) {
      const x = poi.x + rnd(-20, 20);
      const z = poi.z + rnd(-20, 20);
      lootSpots.push({ x, y: SQ.Terrain.height(x, z), z });
    }
  }

  function scatter() {
    let planted = 0;
    for (let i = 0; i < 3000 && planted < 260; i++) {
      const x = rnd(-170, 170);
      const z = rnd(-170, 170);
      const h = SQ.Terrain.height(x, z);
      if (h < 2.6 || SQ.Terrain.distToRoad(x, z) < 6 || overlapsFootprint(x, z, 0.5, 0.5, 3)) continue;
      const poiClear = SQ.POIS.some((p) => (p.kind === "town" || p.kind === "industrial" || p.kind === "fields") && Math.hypot(x - p.x, z - p.z) < p.radius);
      if (poiClear) continue;
      if (trees.some((t) => Math.abs(t.x - x) < 4 && Math.abs(t.z - z) < 4)) continue;
      const pineBias = h > 14 || Math.hypot(x + 85, z + 65) < 70 ? 0.8 : 0.35;
      tree(x, z, rng() < pineBias ? "pine" : "round", rnd(0.85, 1.2));
      planted++;
    }
    for (let i = 0; i < 70; i++) {
      const x = rnd(-165, 165);
      const z = rnd(-165, 165);
      if (SQ.Terrain.height(x, z) < 1 || SQ.Terrain.distToRoad(x, z) < 5 || overlapsFootprint(x, z, 1.5, 1.5, 1)) continue;
      rock(x, z, rnd(0.6, 2));
    }
    for (let i = 0; i < 18; i++) {
      const x = rnd(-150, 150);
      const z = rnd(-150, 150);
      if (SQ.Terrain.height(x, z) < 2.5 || overlapsFootprint(x, z, 1, 1, 2)) continue;
      lootSpots.push({ x, y: SQ.Terrain.height(x, z), z });
    }
  }

  // ---- Instanced vegetation and props ----
  const dummy = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const meshes = {};

  function buildInstances(scene) {
    const lambert = (opts) => new THREE.MeshLambertMaterial(opts);
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const pineGeo = new THREE.ConeGeometry(1, 1, 7);
    pineGeo.translate(0, 0.5, 0);
    const roundGeo = new THREE.IcosahedronGeometry(1, 1);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const hayGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.3, 14);
    hayGeo.rotateZ(Math.PI / 2);
    hayGeo.translate(0, 0.9, 0);
    const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.15, 12);
    barrelGeo.translate(0, 0.575, 0);

    const make = (name, geo, count, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      meshes[name] = m;
      return m;
    };
    make("trunk", trunkGeo, trees.length, lambert({ color: 0xffffff }));
    make("pine", pineGeo, trees.length, lambert({ color: 0xffffff }));
    make("round", roundGeo, trees.length, lambert({ color: 0xffffff }));
    make("rock", rockGeo, rocks.length, lambert({ color: 0xffffff }));
    make("hay", hayGeo, hay.length, lambert({ color: 0xd8bf62 }));
    make("barrel", barrelGeo, barrels.length, lambert({ color: 0xc53a2c }));
    refreshInstances();
  }

  function setInstance(mesh, i, visible, fn) {
    if (!visible) {
      mesh.setMatrixAt(i, hidden);
      return;
    }
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    fn(dummy);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function refreshInstances() {
    const tint = new THREE.Color();
    trees.forEach((t, i) => {
      setInstance(meshes.trunk, i, t.alive, (o) => {
        o.position.set(t.x, t.y - 0.3, t.z);
        o.scale.set(t.scale, t.dead ? t.h * 0.8 : t.h * 0.45, t.scale);
      });
      meshes.trunk.setColorAt(i, tint.set(t.dead ? "#6e6152" : "#6b4a2f"));
      setInstance(meshes.pine, i, t.alive && t.kind === "pine", (o) => {
        o.position.set(t.x, t.y + t.h * 0.22, t.z);
        o.scale.set(t.h * 0.3, t.h * 0.85, t.h * 0.3);
      });
      meshes.pine.setColorAt(i, tint.setHSL(0.33 + t.tint * 0.3, 0.42, 0.25 + t.tint));
      setInstance(meshes.round, i, t.alive && t.kind === "round", (o) => {
        o.position.set(t.x, t.y + t.h * 0.62, t.z);
        o.scale.set(t.h * 0.36, t.h * 0.32, t.h * 0.36);
      });
      meshes.round.setColorAt(i, tint.setHSL(0.27 + t.tint, 0.45, 0.36 + t.tint));
    });
    rocks.forEach((r, i) => {
      setInstance(meshes.rock, i, r.alive, (o) => {
        o.position.set(r.x, r.y + r.size * 0.25, r.z);
        o.rotation.set(r.rot * 0.3, r.rot, 0);
        o.scale.set(r.size, r.size * 0.8, r.size * 0.9);
      });
      meshes.rock.setColorAt(i, tint.setHSL(0.1, 0.05, 0.55 + r.tint));
    });
    hay.forEach((h, i) => setInstance(meshes.hay, i, h.alive, (o) => o.position.set(h.x, h.y, h.z)));
    barrels.forEach((b, i) => setInstance(meshes.barrel, i, b.alive, (o) => o.position.set(b.x, b.y, b.z)));
    Object.values(meshes).forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }

  function build(scene) {
    rng = U.mulberry32(20261003);
    entries = [];
    footprints = [];
    chests = [];
    lootSpots = [];
    trees = [];
    rocks = [];
    hay = [];
    barrels = [];

    const byId = Object.fromEntries(SQ.POIS.map((p) => [p.id, p]));
    millbrook(byId.millbrook);
    rustworks(byId.rustworks);
    highridge(byId.highridge);
    barley(byId.barley);
    hollowstead(byId.hollowstead);
    pinewood(byId.pinewood);
    scatter();

    const geo = U.mergeGeometries(entries);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    entries = null;

    buildInstances(scene);
    SQ.World.footprints = footprints;
    SQ.World.chestSpots = chests;
    SQ.World.lootSpots = lootSpots;
    SQ.World.trees = trees;
    SQ.World.barrels = barrels;
  }

  // Harvest a tree, rock, hay bale or prop. Returns materials gained.
  function harvest(collider, damage) {
    const info = collider.harvest;
    if (!info) return 0;
    info.hpLeft = (info.hpLeft === undefined ? info.hp : info.hpLeft) - damage;
    const gained = info.mats;
    if (info.hpLeft <= 0) {
      const owner = info.tree || info.rock || info.hay;
      if (owner) {
        owner.alive = false;
        SQ.Physics.remove(collider);
        refreshInstances();
      }
      info.hpLeft = info.hp;
    }
    return gained;
  }

  function resetDynamic() {
    const restore = (item) => {
      if (!item.alive) {
        item.alive = true;
        SQ.Physics.add(item.collider);
      }
      if (item.collider.harvest) item.collider.harvest.hpLeft = undefined;
    };
    trees.forEach(restore);
    rocks.forEach(restore);
    hay.forEach(restore);
    barrels.forEach(restore);
    refreshInstances();
  }

  function destroyBarrel(b) {
    if (!b.alive) return;
    b.alive = false;
    SQ.Physics.remove(b.collider);
    refreshInstances();
  }

  // Random dry-land point away from buildings, for bot spawns and wander targets.
  function randomLandPoint(cx = 0, cz = 0, radius = 150) {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (Math.hypot(x, z) > 165) continue;
      if (SQ.Terrain.height(x, z) < 2.2) continue;
      if (footprints.some((f) => Math.abs(f.x - x) < f.hw + 1.2 && Math.abs(f.z - z) < f.hd + 1.2)) continue;
      return { x, z };
    }
    return { x: cx, z: cz };
  }

  SQ.World = { build, harvest, resetDynamic, destroyBarrel, randomLandPoint };
})(window.SQ = window.SQ || {});
