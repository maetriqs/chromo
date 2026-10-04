// Squall: math, noise and geometry helpers. By The_headphones
(function (SQ) {
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // Frame-rate independent exponential approach.
  const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  function weightedPick(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(seed) {
    const random = mulberry32(seed);
    const perm = new Uint8Array(512);
    const values = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
      values[i] = random();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

    const at = (x, y) => values[perm[(perm[x & 255] + y) & 255]];
    function noise2(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);
      const a = at(xi, yi);
      const b = at(xi + 1, yi);
      const c = at(xi, yi + 1);
      const d = at(xi + 1, yi + 1);
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    }
    function fbm(x, y, octaves = 4) {
      let sum = 0;
      let amp = 0.5;
      let freq = 1;
      let norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * noise2(x * freq, y * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
      }
      return sum / norm;
    }
    return { noise2, fbm, random };
  }

  // Merges many small geometries into one vertex-coloured mesh: one draw call
  // for the whole static world instead of thousands. `shade` darkens the lower
  // part of each piece, a cheap stand-in for ambient occlusion.
  function mergeGeometries(entries) {
    let total = 0;
    const parts = [];
    for (const entry of entries) {
      const g = entry.geometry.index ? entry.geometry.toNonIndexed() : entry.geometry.clone();
      g.computeBoundingBox();
      const minY = g.boundingBox.min.y;
      const spanY = Math.max(0.001, g.boundingBox.max.y - minY);
      const localY = g.attributes.position.array.slice();
      g.applyMatrix4(entry.matrix);
      parts.push({ g, color: entry.color, shade: entry.shade || 0, localY, minY, spanY });
      total += g.attributes.position.count;
    }
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let offset = 0;
    for (const part of parts) {
      const count = part.g.attributes.position.count;
      pos.set(part.g.attributes.position.array, offset * 3);
      nor.set(part.g.attributes.normal.array, offset * 3);
      for (let i = 0; i < count; i++) {
        const t = (part.localY[i * 3 + 1] - part.minY) / part.spanY;
        const f = 1 - part.shade * (1 - t);
        col[(offset + i) * 3] = part.color.r * f;
        col[(offset + i) * 3 + 1] = part.color.g * f;
        col[(offset + i) * 3 + 2] = part.color.b * f;
      }
      offset += count;
      part.g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  // Triangular prism used for gable roofs: ridge along x, slopes along z.
  function gableGeometry(w, d, h) {
    const x = w / 2;
    const z = d / 2;
    const v = [
      [-x, 0, -z], [-x, 0, z], [-x, h, 0],
      [x, 0, -z], [x, 0, z], [x, h, 0],
    ];
    const tris = [
      [0, 1, 2], [3, 5, 4],
      [0, 2, 5], [0, 5, 3],
      [1, 4, 5], [1, 5, 2],
      [0, 3, 4], [0, 4, 1],
    ];
    const pos = [];
    tris.forEach((t) => t.forEach((i) => pos.push(...v[i])));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function storageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable; settings last for this visit.
    }
  }

  SQ.U = {
    clamp, lerp, smoothstep, damp, rand, randInt, pick, wrapAngle, dist2D, weightedPick,
    mulberry32, makeNoise, mergeGeometries, gableGeometry, formatTime, storageGet, storageSet,
  };
})(window.SQ = window.SQ || {});
