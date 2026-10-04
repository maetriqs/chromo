// Squall: island heightfield, terrain mesh, water and road layout. By The_headphones
(function (SQ) {
  const { CFG, U } = SQ;
  const N = CFG.TERRAIN_CELLS;
  const HALF = CFG.WORLD_HALF;
  const CELL = (HALF * 2) / N;
  const ROW = N + 1;

  let heights = null;
  let noise = null;
  const segments = [];

  function buildRoadSegments() {
    segments.length = 0;
    SQ.ROADS.forEach((line) => {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i];
        const [bx, bz] = line[i + 1];
        segments.push({ ax, az, bx, bz, len2: (bx - ax) ** 2 + (bz - az) ** 2 });
      }
    });
  }

  function distToRoad(x, z) {
    let best = Infinity;
    for (const s of segments) {
      const t = U.clamp(((x - s.ax) * (s.bx - s.ax) + (z - s.az) * (s.bz - s.az)) / s.len2, 0, 1);
      const d = Math.hypot(x - (s.ax + (s.bx - s.ax) * t), z - (s.az + (s.bz - s.az) * t));
      if (d < best) best = d;
    }
    return best;
  }

  const bump = (x, z, cx, cz, size, height) => height * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * size * size));

  function naturalHeight(x, z) {
    const r = Math.hypot(x, z);
    const coast = 160 + 30 * (noise.fbm(x * 0.007 + 13.1, z * 0.007 - 4.2, 3) - 0.5);
    const land = U.smoothstep(coast + 22, coast - 18, r);
    let h = 3.5 + 9 * noise.fbm(x * 0.011 + 2.3, z * 0.011 + 7.7, 4);
    h += bump(x, z, 90, 60, 28, 26);
    h += bump(x, z, 55, 100, 16, 12);
    h += bump(x, z, -100, -30, 22, 9);
    h += bump(x, z, 30, -60, 20, 6);
    return U.lerp(-6, h, land);
  }

  function shapedHeight(x, z) {
    let h = naturalHeight(x, z);
    for (const poi of SQ.POIS) {
      if (!poi.flatten) continue;
      const t = U.smoothstep(poi.radius * 1.2, poi.radius * 0.8, Math.hypot(x - poi.x, z - poi.z));
      if (t > 0) h = U.lerp(h, poi.base, t);
    }
    // Roads cut a gentle shelf so they read as roads rather than painted stripes.
    const road = distToRoad(x, z);
    if (road < 6 && h > 1.5) h -= 0.25 * U.smoothstep(6, 2, road);
    return h;
  }

  // Height on the exact triangle the mesh draws, so feet never float or sink.
  function height(x, z) {
    const gx = U.clamp((x + HALF) / CELL, 0, N - 0.0001);
    const gz = U.clamp((z + HALF) / CELL, 0, N - 0.0001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const h00 = heights[iz * ROW + ix];
    const h10 = heights[iz * ROW + ix + 1];
    const h01 = heights[(iz + 1) * ROW + ix];
    const h11 = heights[(iz + 1) * ROW + ix + 1];
    if (fx > fz) return h00 + fx * (h10 - h00) + fz * (h11 - h10);
    return h00 + fz * (h01 - h00) + fx * (h11 - h01);
  }

  function colorFor(x, h, z, ny, out) {
    const c = SQ.Terrain.palette;
    const n = noise.fbm(x * 0.05 + 40, z * 0.05 - 9, 3);
    if (h < 0.3) {
      out.copy(c.seabed).lerp(c.deep, U.clamp(-h / 5, 0, 1));
      return;
    }
    if (h < 1.9) {
      out.copy(c.sand);
      return;
    }
    out.copy(c.grassB).lerp(c.grassC, n);
    const pine = Math.hypot(x + 85, z + 65);
    if (pine < 60) out.lerp(c.forest, U.smoothstep(60, 35, pine) * 0.8);
    const field = Math.hypot(x + 5, z - 105);
    if (field < 46 && Math.sin(x * 0.32 + noise.noise2(x * 0.1, z * 0.1) * 2) > -0.1) {
      out.lerp(n > 0.5 ? c.field : c.fieldB, U.smoothstep(46, 36, field));
    }
    if (h < 2.6) out.lerp(c.sand, U.smoothstep(2.6, 1.9, h));
    const rock = Math.max(U.smoothstep(0.86, 0.72, ny), U.smoothstep(28, 34, h));
    if (rock > 0) out.lerp(n > 0.5 ? c.rock : c.rockDark, rock);
    const road = distToRoad(x, z);
    if (road < 4.4) out.lerp(c.road, U.smoothstep(4.4, 3.0, road));
    for (const poi of SQ.POIS) {
      if (poi.kind !== "town" && poi.kind !== "industrial") continue;
      const d = Math.hypot(x - poi.x, z - poi.z);
      if (d < poi.radius) out.lerp(poi.kind === "industrial" ? c.concrete : c.dirt, U.smoothstep(poi.radius, poi.radius * 0.7, d) * (poi.kind === "industrial" ? 0.85 : 0.35));
    }
  }

  function build(scene) {
    noise = U.makeNoise(7319);
    buildRoadSegments();
    SQ.POIS.forEach((poi) => {
      poi.base = naturalHeight(poi.x, poi.z);
    });

    const hex = (h) => new THREE.Color(h);
    SQ.Terrain.palette = {
      sand: hex("#dccb93"), seabed: hex("#c2b184"), deep: hex("#5f8a87"),
      grassB: hex("#5a8c3c"), grassC: hex("#86b25a"), forest: hex("#3f6d30"),
      field: hex("#cdb85e"), fieldB: hex("#b39d48"), rock: hex("#8d918a"), rockDark: hex("#6c706a"),
      road: hex("#575b61"), dirt: hex("#9a8462"), concrete: hex("#8a8c88"),
    };

    heights = new Float32Array(ROW * ROW);
    const pos = new Float32Array(ROW * ROW * 3);
    for (let iz = 0; iz <= N; iz++) {
      for (let ix = 0; ix <= N; ix++) {
        const x = -HALF + ix * CELL;
        const z = -HALF + iz * CELL;
        const h = shapedHeight(x, z);
        const i = iz * ROW + ix;
        heights[i] = h;
        pos[i * 3] = x;
        pos[i * 3 + 1] = h;
        pos[i * 3 + 2] = z;
      }
    }
    const index = new Uint32Array(N * N * 6);
    let k = 0;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const a = iz * ROW + ix;
        const b = a + 1;
        const d = a + ROW;
        const c = d + 1;
        index[k++] = a; index[k++] = c; index[k++] = b;
        index[k++] = a; index[k++] = d; index[k++] = c;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    const normals = geo.attributes.normal.array;
    const colors = new Float32Array(ROW * ROW * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < ROW * ROW; i++) {
      colorFor(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], normals[i * 3 + 1], tmp);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    scene.add(mesh);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshPhongMaterial({ color: 0x3b8ca4, specular: 0x9fd8e4, shininess: 70, transparent: true, opacity: 0.86 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    scene.add(water);
    SQ.Terrain.water = water;
    SQ.Terrain.mesh = mesh;
  }

  // Colour for the minimap, sampled from the same palette as the mesh.
  function mapColor(x, z, out) {
    const h = height(x, z);
    if (h < 0) {
      out.set("#3b8ca4").lerp(SQ.Terrain.palette.deep, U.clamp(-h / 6, 0, 1) * 0.5);
      return out;
    }
    const e = 1.5;
    const ny = 1 / Math.hypot((height(x + e, z) - height(x - e, z)) / (2 * e), (height(x, z + e) - height(x, z - e)) / (2 * e), 1);
    colorFor(x, h, z, ny, out);
    return out;
  }

  SQ.Terrain = { build, height, distToRoad, mapColor, naturalHeight: (x, z) => naturalHeight(x, z), CELL };
})(window.SQ = window.SQ || {});
