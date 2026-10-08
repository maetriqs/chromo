// Quarry: block materials, chunk mesh streaming around the player and edit rebuilds. By The_headphones
(function (QY) {
  const { CHUNK } = QY.CFG;
  const W = QY.World;

  const VERTEX = `
    attribute float tile;
    attribute vec3 light;
    varying vec2 vUv;
    varying float vTile;
    varying vec3 vLight;
    varying float vDist;
    void main() {
      vUv = uv;
      vTile = tile;
      vLight = light;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `;

  // Samples the atlas at exact texel centres, so tiles never bleed into their neighbours.
  const FRAGMENT = `
    uniform sampler2D map;
    uniform float daylight;
    uniform vec3 skyColor;
    uniform vec3 lampColor;
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    uniform float opacity;
    uniform float time;
    uniform vec3 tint;
    varying vec2 vUv;
    varying float vTile;
    varying vec3 vLight;
    varying float vDist;
    void main() {
      float t = floor(vTile + 0.5);
      float row = floor(t * 0.125);
      float col = t - row * 8.0;
      vec2 local = vUv;
      #ifdef WATER
        local = fract(local + vec2(time * 0.07, time * 0.031));
      #endif
      vec2 texel = floor(clamp(local, 0.0, 0.99999) * 16.0);
      vec2 uv = (vec2(col * 16.0 + texel.x, row * 16.0 + 15.0 - texel.y) + 0.5) / 128.0;
      vec4 c = texture2D(map, uv);
      #ifndef WATER
        if (c.a < 0.5) discard;
      #endif
      vec3 sky = skyColor * (vLight.g * daylight);
      vec3 lamp = lampColor * vLight.b;
      vec3 lit = max(max(sky, lamp), vec3(0.035));
      vec3 color = c.rgb * vLight.r * lit * tint;
      float fog = smoothstep(fogNear, fogFar, vDist);
      #ifdef WATER
        gl_FragColor = vec4(mix(color, fogColor, fog), c.a * opacity);
      #else
        gl_FragColor = vec4(mix(color, fogColor, fog), 1.0);
      #endif
    }
  `;

  let atlas = null;
  const shared = {
    map: { value: null },
    daylight: { value: 1 },
    skyColor: { value: new THREE.Color(1, 1, 1) },
    lampColor: { value: new THREE.Color(1, 0.86, 0.62) },
    fogColor: { value: new THREE.Color(0.7, 0.8, 1) },
    fogNear: { value: 40 },
    fogFar: { value: 60 },
    time: { value: 0 },
    tint: { value: new THREE.Color(1, 1, 1) },
  };

  function material(opts = {}) {
    const uniforms = {
      map: shared.map,
      daylight: shared.daylight,
      skyColor: shared.skyColor,
      lampColor: shared.lampColor,
      fogColor: shared.fogColor,
      fogNear: opts.ownFog ? { value: 1e5 } : shared.fogNear,
      fogFar: opts.ownFog ? { value: 2e5 } : shared.fogFar,
      time: shared.time,
      tint: shared.tint,
      opacity: { value: opts.opacity ?? 1 },
    };
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: opts.water ? { WATER: "" } : {},
      transparent: !!opts.water,
      depthWrite: !opts.water,
      side: opts.water ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  const materials = {};
  let group = null;
  const chunks = new Map();
  let queue = [];
  let radius = 4;
  let centre = { cx: -999, cz: -999 };
  const key = (cx, cz) => cx * 1024 + cz;

  function init(scene) {
    atlas = new THREE.CanvasTexture(QY.Textures.atlasCanvas);
    atlas.magFilter = THREE.NearestFilter;
    atlas.minFilter = THREE.NearestFilter;
    atlas.generateMipmaps = false;
    atlas.flipY = false;
    shared.map.value = atlas;
    materials.opaque = material();
    materials.water = material({ water: true, opacity: 0.78 });
    materials.hand = material({ ownFog: true });
    group = new THREE.Group();
    group.name = "terrain";
    scene.add(group);
  }

  function makeMesh(part, mat, c, minY, maxY) {
    if (!part.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(part.position, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(part.uv, 2));
    g.setAttribute("tile", new THREE.BufferAttribute(part.tile, 1));
    g.setAttribute("light", new THREE.BufferAttribute(part.light, 3, true));
    g.setIndex(new THREE.BufferAttribute(part.index, 1));
    const half = (maxY - minY) / 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CHUNK / 2, minY + half, CHUNK / 2), Math.hypot(CHUNK / 2, CHUNK / 2, half) + 0.5);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(c.cx * CHUNK, 0, c.cz * CHUNK);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.faces = part.count / 6;
    group.add(mesh);
    return mesh;
  }

  function dropMeshes(c) {
    [c.solid, c.water].forEach((m) => {
      if (!m) return;
      group.remove(m);
      m.geometry.dispose();
    });
    c.solid = null;
    c.water = null;
  }

  function buildChunk(c) {
    const data = QY.Mesher.build(c.cx, c.cz);
    dropMeshes(c);
    c.solid = makeMesh(data.opaque, materials.opaque, c, data.minY, data.maxY);
    c.water = makeMesh(data.water, materials.water, c, data.minY, data.maxY);
    c.dirty = false;
    c.built = true;
  }

  const inRange = (dx, dz, r) => dx * dx + dz * dz <= r * r + r;

  function refreshSet(cx, cz) {
    centre = { cx, cz };
    chunks.forEach((c, k) => {
      if (!inRange(c.cx - cx, c.cz - cz, radius + 1)) {
        dropMeshes(c);
        chunks.delete(k);
      }
    });
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= W.CHUNKS || z >= W.CHUNKS || !inRange(dx, dz, radius)) continue;
        const k = key(x, z);
        if (!chunks.has(k)) chunks.set(k, { cx: x, cz: z, solid: null, water: null, dirty: true, built: false });
      }
    }
    sortQueue();
  }

  function sortQueue() {
    queue = [];
    chunks.forEach((c) => {
      if (c.dirty && inRange(c.cx - centre.cx, c.cz - centre.cz, radius)) queue.push(c);
    });
    queue.sort((a, b) => {
      const da = (a.cx - centre.cx) ** 2 + (a.cz - centre.cz) ** 2 - (a.built ? 0 : 0.5);
      const db = (b.cx - centre.cx) ** 2 + (b.cz - centre.cz) ** 2 - (b.built ? 0 : 0.5);
      return da - db;
    });
  }

  // Streams chunk meshes in nearest-first, spending at most budgetMs per call.
  function update(px, pz, budgetMs) {
    const cx = Math.floor(px / CHUNK);
    const cz = Math.floor(pz / CHUNK);
    if (cx !== centre.cx || cz !== centre.cz) refreshSet(cx, cz);
    const start = performance.now();
    let built = 0;
    while (queue.length) {
      const c = queue.shift();
      if (!c.dirty || chunks.get(key(c.cx, c.cz)) !== c) continue;
      buildChunk(c);
      built++;
      if (performance.now() - start > budgetMs) break;
    }
    return built;
  }

  // After an edit: rebuild the chunks touching the block right away, queue the ones only lit by it.
  function blockChanged(x, z, box) {
    const now = new Set();
    for (let bx = x - 1; bx <= x + 1; bx++) {
      for (let bz = z - 1; bz <= z + 1; bz++) now.add(key(Math.floor(bx / CHUNK), Math.floor(bz / CHUNK)));
    }
    let later = false;
    for (let cx = Math.floor(box.x0 / CHUNK); cx <= Math.floor(box.x1 / CHUNK); cx++) {
      for (let cz = Math.floor(box.z0 / CHUNK); cz <= Math.floor(box.z1 / CHUNK); cz++) {
        const c = chunks.get(key(cx, cz));
        if (!c) continue;
        if (now.has(key(cx, cz))) buildChunk(c);
        else {
          c.dirty = true;
          later = true;
        }
      }
    }
    if (later) {
      sortQueue();
      // Light-only rebuilds jump the queue ahead of far-away new chunks.
      queue.sort((a, b) => (b.built ? 1 : 0) - (a.built ? 1 : 0));
    }
  }

  function setRadius(r) {
    if (r === radius) return;
    radius = r;
    if (centre.cx > -999) refreshSet(centre.cx, centre.cz);
  }

  function reset() {
    chunks.forEach((c) => dropMeshes(c));
    chunks.clear();
    queue = [];
    centre = { cx: -999, cz: -999 };
  }

  function stats() {
    let built = 0;
    let faces = 0;
    chunks.forEach((c) => {
      if (c.built) built++;
      if (c.solid) faces += c.solid.userData.faces;
      if (c.water) faces += c.water.userData.faces;
    });
    return { loaded: chunks.size, built, pending: queue.length, faces };
  }

  // Number of chunks the player's surroundings still need before the world looks complete.
  function pendingNear(px, pz, r) {
    const cx = Math.floor(px / CHUNK);
    const cz = Math.floor(pz / CHUNK);
    let n = 0;
    chunks.forEach((c) => {
      if (!c.built && inRange(c.cx - cx, c.cz - cz, r)) n++;
    });
    return n;
  }

  QY.Chunks = {
    init,
    update,
    blockChanged,
    setRadius,
    getRadius: () => radius,
    reset,
    stats,
    pendingNear,
    materials,
    uniforms: shared,
  };
})(window.QY = window.QY || {});
