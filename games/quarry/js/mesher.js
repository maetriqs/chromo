// Quarry: builds chunk vertex buffers with face culling, ambient occlusion and smooth light. By The_headphones
(function (QY) {
  const { CHUNK, HEIGHT: H } = QY.CFG;
  const W = QY.World;
  const SIZE = W.SIZE;
  const { T_KIND, T_OPAQUE, T_EMIT, T_FACE, KIND } = QY;

  // Padded copy of a chunk plus a one-block border, so neighbour lookups never leave the array.
  const P = CHUNK + 2;
  const PH = H + 2;
  const DY = 1;
  const DZ = PH;
  const DX = P * PH;
  const pb = new Uint8Array(P * P * PH);
  const pl = new Uint8Array(P * P * PH);
  const ps = new Float32Array(P * P * PH);
  const TP = P + 2;
  const ptop = new Int16Array(TP * TP);

  // Faces in the order +X, -X, +Y, -Y, +Z, -Z. t1/t2 span the face; corners go (0,0) (1,0) (1,1) (0,1).
  const FACES = [
    { n: [1, 0, 0], t1: [0, 1, 0], t2: [0, 0, 1], shade: 0.72 },
    { n: [-1, 0, 0], t1: [0, 0, 1], t2: [0, 1, 0], shade: 0.72 },
    { n: [0, 1, 0], t1: [0, 0, 1], t2: [1, 0, 0], shade: 1 },
    { n: [0, -1, 0], t1: [1, 0, 0], t2: [0, 0, 1], shade: 0.55 },
    { n: [0, 0, 1], t1: [1, 0, 0], t2: [0, 1, 0], shade: 0.86 },
    { n: [0, 0, -1], t1: [0, 1, 0], t2: [1, 0, 0], shade: 0.86 },
  ];
  const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const AO_CURVE = [0.47, 0.64, 0.81, 1];

  const pad = (v) => v[0] * DX + v[1] * DY + v[2] * DZ;
  const FACE_OFF = new Int32Array(6);
  const CX = new Float32Array(24);
  const CY = new Float32Array(24);
  const CZ = new Float32Array(24);
  const CU = new Uint8Array(24);
  const CV = new Uint8Array(24);
  const S1 = new Int32Array(24);
  const S2 = new Int32Array(24);
  const SC = new Int32Array(24);

  FACES.forEach((face, f) => {
    FACE_OFF[f] = pad(face.n);
    const base = face.n.map((v) => (v > 0 ? 1 : 0));
    CORNERS.forEach(([a, b], c) => {
      const k = f * 4 + c;
      const p = [0, 1, 2].map((i) => base[i] + a * face.t1[i] + b * face.t2[i]);
      CX[k] = p[0];
      CY[k] = p[1];
      CZ[k] = p[2];
      let u;
      let v;
      if (f === 0) [u, v] = [1 - p[2], p[1]];
      else if (f === 1) [u, v] = [p[2], p[1]];
      else if (f === 4) [u, v] = [p[0], p[1]];
      else if (f === 5) [u, v] = [1 - p[0], p[1]];
      else [u, v] = [p[0], p[2]];
      CU[k] = u;
      CV[k] = v;
      const s1 = face.t1.map((t) => (a ? t : -t));
      const s2 = face.t2.map((t) => (b ? t : -t));
      S1[k] = pad(s1);
      S2[k] = pad(s2);
      SC[k] = pad([s1[0] + s2[0], s1[1] + s2[1], s1[2] + s2[2]]);
    });
  });

  // Block light level (0-15, averaged in quarter steps) to brightness.
  const BLOCK_CURVE = new Float32Array(61);
  for (let i = 0; i <= 60; i++) BLOCK_CURVE[i] = Math.pow(i / 60, 1.8);
  const blockBright = (level) => BLOCK_CURVE[Math.max(0, Math.min(60, Math.round(level * 4)))];

  // ---- output buffers, reused between chunks ----------------------------------------------
  function makeBuffers(maxFaces) {
    return {
      maxFaces,
      position: new Float32Array(maxFaces * 12),
      uv: new Uint8Array(maxFaces * 8),
      tile: new Uint8Array(maxFaces * 4),
      light: new Uint8Array(maxFaces * 12),
      index: new Uint32Array(maxFaces * 6),
      v: 0,
      i: 0,
    };
  }
  const solidBuf = makeBuffers(60000);
  const waterBuf = makeBuffers(20000);
  let minY = H;
  let maxY = 0;

  function vertex(buf, x, y, z, u, v, tile, r, g, b) {
    const n = buf.v++;
    buf.position[n * 3] = x;
    buf.position[n * 3 + 1] = y;
    buf.position[n * 3 + 2] = z;
    buf.uv[n * 2] = u;
    buf.uv[n * 2 + 1] = v;
    buf.tile[n] = tile;
    buf.light[n * 3] = r;
    buf.light[n * 3 + 1] = g;
    buf.light[n * 3 + 2] = b;
  }

  function quadIndices(buf, v0, flip) {
    const I = buf.index;
    let i = buf.i;
    if (flip) {
      I[i++] = v0 + 1;
      I[i++] = v0 + 2;
      I[i++] = v0 + 3;
      I[i++] = v0 + 1;
      I[i++] = v0 + 3;
      I[i++] = v0;
    } else {
      I[i++] = v0;
      I[i++] = v0 + 1;
      I[i++] = v0 + 2;
      I[i++] = v0;
      I[i++] = v0 + 2;
      I[i++] = v0 + 3;
    }
    buf.i = i;
  }

  // ---- padded volume ------------------------------------------------------------------------
  function fill(cx, cz) {
    const x0 = cx * CHUNK - 1;
    const z0 = cz * CHUNK - 1;
    for (let i = 0; i < TP; i++) {
      for (let j = 0; j < TP; j++) ptop[i * TP + j] = W.topAt(x0 - 1 + i, z0 - 1 + j);
    }
    for (let px = 0; px < P; px++) {
      const wx = x0 + px;
      for (let pz = 0; pz < P; pz++) {
        const wz = z0 + pz;
        const base = px * DX + pz * DZ;
        const insideXZ = wx >= 0 && wz >= 0 && wx < SIZE && wz < SIZE;
        // Below the world counts as solid rock; above it is open sky.
        pb[base] = QY.ID.bedrock;
        pl[base] = 0;
        ps[base] = 0;
        pb[base + PH - 1] = 0;
        pl[base + PH - 1] = 0;
        ps[base + PH - 1] = 1;
        if (insideXZ) {
          const src = (wx * SIZE + wz) * H;
          pb.set(W.blocks.subarray(src, src + H), base + 1);
          pl.set(W.light.subarray(src, src + H), base + 1);
        } else {
          pb.fill(0, base + 1, base + 1 + H);
          pl.fill(0, base + 1, base + 1 + H);
        }
        const ti = (px + 1) * TP + pz + 1;
        const top = ptop[ti];
        const nearest = Math.min(ptop[ti + TP], ptop[ti - TP], ptop[ti + 1], ptop[ti - 1]);
        for (let y = 0; y < H; y++) {
          let s;
          if (!insideXZ || y > top) s = 1;
          else if (y > nearest) s = 0.72;
          else s = 0.46 * Math.min(1, Math.max(0.32, 1 - (top - y) / 24));
          ps[base + 1 + y] = s;
        }
      }
    }
  }

  // ---- emitters ------------------------------------------------------------------------------
  const ao = new Int32Array(4);

  function cubeFace(lx, y, lz, f, ai, id) {
    const buf = solidBuf;
    if (buf.v + 4 > buf.maxFaces * 4) return;
    const tile = T_FACE[id * 6 + f];
    const emit = T_EMIT[id];
    const shade = FACES[f].shade;
    const v0 = buf.v;
    for (let c = 0; c < 4; c++) {
      const k = f * 4 + c;
      const s1 = ai + S1[k];
      const s2 = ai + S2[k];
      const sc = ai + SC[k];
      const o1 = T_OPAQUE[pb[s1]];
      const o2 = T_OPAQUE[pb[s2]];
      const oc = T_OPAQUE[pb[sc]];
      const level = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
      ao[c] = level;
      let sky = ps[ai];
      let blk = pl[ai];
      let n = 1;
      if (!o1) {
        sky += ps[s1];
        blk += pl[s1];
        n++;
      }
      if (!o2) {
        sky += ps[s2];
        blk += pl[s2];
        n++;
      }
      if (!oc && !(o1 && o2)) {
        sky += ps[sc];
        blk += pl[sc];
        n++;
      }
      const r = emit ? 255 : Math.round(shade * AO_CURVE[level] * 255);
      const g = Math.round((sky / n) * 255);
      const b = emit ? 255 : Math.round(blockBright(blk / n) * 255);
      vertex(buf, lx + CX[k], y + CY[k], lz + CZ[k], CU[k], CV[k], tile, r, g, b);
    }
    quadIndices(buf, v0, ao[0] + ao[2] < ao[1] + ao[3]);
    if (y < minY) minY = y;
    if (y + 1 > maxY) maxY = y + 1;
  }

  function plant(lx, y, lz, pi, id) {
    const buf = solidBuf;
    if (buf.v + 8 > buf.maxFaces * 4) return;
    const tile = T_FACE[id * 6 + 2];
    const g = Math.round(ps[pi] * 255);
    const b = Math.round(blockBright(pl[pi]) * 255);
    const r = 230;
    const lo = 0.12;
    const hi = 0.88;
    [[lo, lo, hi, hi], [hi, lo, lo, hi]].forEach(([ax, az, bx, bz]) => {
      const v0 = buf.v;
      vertex(buf, lx + ax, y, lz + az, 0, 0, tile, r, g, b);
      vertex(buf, lx + bx, y, lz + bz, 1, 0, tile, r, g, b);
      vertex(buf, lx + bx, y + 1, lz + bz, 1, 1, tile, r, g, b);
      vertex(buf, lx + ax, y + 1, lz + az, 0, 1, tile, r, g, b);
      quadIndices(buf, v0, false);
      // Same quad wound the other way so it shows from both sides with back-face culling on.
      const I = buf.index;
      let i = buf.i;
      I[i++] = v0;
      I[i++] = v0 + 2;
      I[i++] = v0 + 1;
      I[i++] = v0;
      I[i++] = v0 + 3;
      I[i++] = v0 + 2;
      buf.i = i;
    });
    if (y < minY) minY = y;
    if (y + 1 > maxY) maxY = y + 1;
  }

  function water(lx, y, lz, pi, id) {
    const buf = waterBuf;
    const topOpen = T_KIND[pb[pi + DY]] !== KIND.WATER;
    const surface = topOpen ? 0.875 : 1;
    for (let f = 0; f < 6; f++) {
      const ai = pi + FACE_OFF[f];
      const nb = pb[ai];
      if (T_OPAQUE[nb] || T_KIND[nb] === KIND.WATER) continue;
      if (buf.v + 4 > buf.maxFaces * 4) return;
      const tile = T_FACE[id * 6 + f];
      const r = Math.round(FACES[f].shade * 255);
      const g = Math.round(ps[ai] * 255);
      const b = Math.round(blockBright(pl[ai]) * 255);
      const v0 = buf.v;
      for (let c = 0; c < 4; c++) {
        const k = f * 4 + c;
        const cy = CY[k] === 1 ? surface : CY[k];
        vertex(buf, lx + CX[k], y + cy, lz + CZ[k], CU[k], CV[k], tile, r, g, b);
      }
      quadIndices(buf, v0, false);
    }
    if (y < minY) minY = y;
    if (y + 1 > maxY) maxY = y + 1;
  }

  function take(buf) {
    return {
      count: buf.i,
      position: buf.position.slice(0, buf.v * 3),
      uv: buf.uv.slice(0, buf.v * 2),
      tile: buf.tile.slice(0, buf.v),
      light: buf.light.slice(0, buf.v * 3),
      index: buf.v > 65535 ? buf.index.slice(0, buf.i) : Uint16Array.from(buf.index.subarray(0, buf.i)),
    };
  }

  function build(cx, cz) {
    fill(cx, cz);
    solidBuf.v = solidBuf.i = 0;
    waterBuf.v = waterBuf.i = 0;
    minY = H;
    maxY = 0;
    for (let lx = 0; lx < CHUNK; lx++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        const base = (lx + 1) * DX + (lz + 1) * DZ + 1;
        for (let y = 0; y < H; y++) {
          const pi = base + y;
          const id = pb[pi];
          if (!id) continue;
          const kind = T_KIND[id];
          if (kind === KIND.PLANT) {
            plant(lx, y, lz, pi, id);
            continue;
          }
          if (kind === KIND.WATER) {
            water(lx, y, lz, pi, id);
            continue;
          }
          for (let f = 0; f < 6; f++) {
            const ai = pi + FACE_OFF[f];
            const nb = pb[ai];
            if (T_OPAQUE[nb]) continue;
            if (nb === id && kind === KIND.GLASS) continue;
            cubeFace(lx, y, lz, f, ai, id);
          }
        }
      }
    }
    if (minY > maxY) {
      minY = 0;
      maxY = 1;
    }
    return { opaque: take(solidBuf), water: take(waterBuf), minY, maxY };
  }

  // ---- single-item geometry for the hand and dropped items ------------------------------------
  const itemCache = {};
  function itemGeometry(id) {
    if (itemCache[id]) return itemCache[id];
    const kind = T_KIND[id];
    const pos = [];
    const uv = [];
    const tile = [];
    const lightArr = [];
    const index = [];
    if (kind === KIND.PLANT) {
      const t = T_FACE[id * 6 + 2];
      [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]].forEach(([x, y, u, v]) => {
        pos.push(x, y, 0);
        uv.push(u, v);
        tile.push(t);
        lightArr.push(255, 255, 0);
      });
      index.push(0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2);
    } else {
      FACES.forEach((face, f) => {
        const v0 = pos.length / 3;
        for (let c = 0; c < 4; c++) {
          const k = f * 4 + c;
          pos.push(CX[k] - 0.5, CY[k] - 0.5, CZ[k] - 0.5);
          uv.push(CU[k], CV[k]);
          tile.push(T_FACE[id * 6 + f]);
          lightArr.push(T_EMIT[id] ? 255 : Math.round(face.shade * 255), 255, T_EMIT[id] ? 255 : 0);
        }
        index.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Uint8Array(uv), 2));
    g.setAttribute("tile", new THREE.BufferAttribute(new Uint8Array(tile), 1));
    g.setAttribute("light", new THREE.BufferAttribute(new Uint8Array(lightArr), 3, true));
    g.setIndex(index);
    g.computeBoundingSphere();
    itemCache[id] = g;
    return g;
  }

  // Copies an item geometry and lights it for one spot in the world (sky 0-1, block light 0-15).
  function litItem(id, sky, blockLevel, existing) {
    const src = itemGeometry(id);
    const g = existing || src.clone();
    const attr = g.getAttribute("light");
    const base = src.getAttribute("light").array;
    const emit = T_EMIT[id];
    for (let i = 0; i < attr.count; i++) {
      attr.array[i * 3] = base[i * 3];
      attr.array[i * 3 + 1] = Math.round(sky * 255);
      attr.array[i * 3 + 2] = emit ? 255 : Math.round(blockBright(blockLevel) * 255);
    }
    attr.needsUpdate = true;
    return g;
  }

  QY.Mesher = { build, itemGeometry, litItem, blockBright, FACES };
})(window.QY = window.QY || {});
