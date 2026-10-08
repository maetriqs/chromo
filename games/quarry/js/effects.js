// Quarry: block selection outline, crack overlay and breaking debris. By The_headphones
(function (QY) {
  const W = QY.World;
  const MAX_PARTICLES = 320;

  let outline;
  let crack;
  let crackTextures = [];
  let points;
  let pGeo;
  const particles = [];

  function init(scene) {
    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    outline.visible = false;
    outline.renderOrder = 2;
    scene.add(outline);

    crackTextures = QY.Textures.crackCanvases.map((canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    });
    crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.002, 1.002, 1.002),
      new THREE.MeshBasicMaterial({
        map: crackTextures[0],
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    crack.visible = false;
    crack.renderOrder = 1;
    scene.add(crack);

    pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    pGeo.setDrawRange(0, 0);
    points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, sizeAttenuation: true }));
    points.frustumCulled = false;
    scene.add(points);
  }

  function setTarget(hit, plant) {
    if (!hit) {
      outline.visible = false;
      return;
    }
    outline.visible = true;
    if (plant) {
      outline.scale.set(0.76, 0.9, 0.76);
      outline.position.set(hit.x + 0.5, hit.y + 0.45, hit.z + 0.5);
    } else {
      outline.scale.set(1, 1, 1);
      outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    }
  }

  // progress 0-1; anything at or below zero hides the cracks.
  function setCrack(hit, progress) {
    if (!hit || progress <= 0) {
      crack.visible = false;
      return;
    }
    crack.visible = true;
    crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const stage = Math.min(4, Math.floor(progress * 5));
    if (crack.material.map !== crackTextures[stage]) crack.material.map = crackTextures[stage];
  }

  // Bright factor scales the debris colour so it matches the light where the block broke.
  function burst(x, y, z, id, bright, count = 22) {
    const b = QY.BLOCKS[id];
    if (!b) return;
    const texels = QY.Textures.tileTexels[QY.Textures.tileIndex(b.side)];
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const c = texels[Math.floor(Math.random() * texels.length)] || [0.6, 0.6, 0.6];
      particles.push({
        x: x + 0.15 + Math.random() * 0.7,
        y: y + 0.15 + Math.random() * 0.7,
        z: z + 0.15 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 1,
        vz: (Math.random() - 0.5) * 3,
        life: 0.5 + Math.random() * 0.5,
        r: c[0] * bright,
        g: c[1] * bright,
        b: c[2] * bright,
      });
    }
  }

  // A few chips flying off while a block is being mined.
  function chip(hit, id, bright) {
    burst(hit.x, hit.y, hit.z, id, bright, 2);
  }

  function update(dt) {
    const pos = pGeo.getAttribute("position");
    const col = pGeo.getAttribute("color");
    let n = 0;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy -= 18 * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;
      if (W.isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        p.vx *= 0.3;
        p.vz *= 0.3;
        p.vy = 0;
      } else {
        p.x = nx;
        p.y = ny;
        p.z = nz;
      }
    }
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      pos.array[n * 3] = p.x;
      pos.array[n * 3 + 1] = p.y;
      pos.array[n * 3 + 2] = p.z;
      col.array[n * 3] = p.r;
      col.array[n * 3 + 1] = p.g;
      col.array[n * 3 + 2] = p.b;
      n++;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    pGeo.setDrawRange(0, n);
  }

  function clear() {
    particles.length = 0;
    if (pGeo) pGeo.setDrawRange(0, 0);
    if (outline) outline.visible = false;
    if (crack) crack.visible = false;
  }

  QY.Effects = { init, setTarget, setCrack, burst, chip, update, clear };
})(window.QY = window.QY || {});
