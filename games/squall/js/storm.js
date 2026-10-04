// Squall: the shrinking squall. Phases, damage, wall visuals and the next-zone ring. By The_headphones
(function (SQ) {
  const { U } = SQ;
  const RING_POINTS = 160;
  const WALL_HEIGHT = 170;

  let wall;
  let wallTex;
  let ring;
  let ringGeo;
  const state = {
    phase: 0,
    mode: "wait",
    timer: 0,
    current: { x: 0, z: 0, r: SQ.STORM.startRadius },
    from: { x: 0, z: 0, r: SQ.STORM.startRadius },
    next: { x: 0, z: 0, r: SQ.STORM.startRadius },
    dps: 1,
    finished: false,
    flicker: 0,
  };

  function stormTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#1d6b5f";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * 256;
      const w = 1 + Math.random() * 6;
      g.fillStyle = `rgba(${150 + Math.random() * 80}, ${230 + Math.random() * 25}, ${210 + Math.random() * 40}, ${0.05 + Math.random() * 0.18})`;
      g.fillRect(x, 0, w, 256);
    }
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `rgba(10, 40, 40, ${0.05 + Math.random() * 0.1})`;
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, 30 + Math.random() * 50, 10 + Math.random() * 20, 0, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 2);
    return tex;
  }

  function init(scene) {
    wallTex = stormTexture();
    wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, WALL_HEIGHT, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: wallTex, color: 0x7fe0c8, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    wall.renderOrder = 2;
    scene.add(wall);

    ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RING_POINTS * 3), 3));
    ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
    ring.frustumCulled = false;
    scene.add(ring);
  }

  function updateRing() {
    const pos = ringGeo.attributes.position.array;
    const { x, z, r } = state.next;
    for (let i = 0; i < RING_POINTS; i++) {
      const a = (i / RING_POINTS) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      pos[i * 3] = px;
      pos[i * 3 + 1] = Math.max(0.3, SQ.Terrain.height(px, pz)) + 0.5;
      pos[i * 3 + 2] = pz;
    }
    ringGeo.attributes.position.needsUpdate = true;
    ring.visible = r > 1;
  }

  function choosePhase(index) {
    const phase = SQ.STORM.phases[index];
    const prev = state.current;
    // The next safe zone always sits fully inside the current one.
    const slack = Math.max(0, prev.r - phase.radius);
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * slack * 0.85;
    let nx = prev.x + Math.cos(a) * d;
    let nz = prev.z + Math.sin(a) * d;
    const limit = 140 - phase.radius;
    const len = Math.hypot(nx, nz);
    if (len > limit && limit > 0) {
      nx *= limit / len;
      nz *= limit / len;
    }
    state.next = { x: nx, z: nz, r: phase.radius };
    updateRing();
  }

  function reset() {
    state.phase = 0;
    state.mode = "wait";
    state.timer = SQ.STORM.phases[0].wait;
    state.current = { x: 0, z: 0, r: SQ.STORM.startRadius };
    state.from = { ...state.current };
    state.dps = 1;
    state.finished = false;
    choosePhase(0);
  }

  function update(dt, viewer) {
    if (!state.finished) {
      state.timer -= dt;
      const phase = SQ.STORM.phases[state.phase];
      if (state.mode === "wait" && state.timer <= 0) {
        state.mode = "shrink";
        state.timer = phase.shrink;
        state.from = { ...state.current };
        state.dps = phase.dps;
        SQ.HUD.announce("The squall is closing in", "storm");
      } else if (state.mode === "shrink") {
        const t = 1 - Math.max(0, state.timer) / phase.shrink;
        state.current.x = U.lerp(state.from.x, state.next.x, t);
        state.current.z = U.lerp(state.from.z, state.next.z, t);
        state.current.r = U.lerp(state.from.r, state.next.r, t);
        if (state.timer <= 0) {
          state.phase += 1;
          if (state.phase >= SQ.STORM.phases.length) {
            state.finished = true;
            state.current.r = 0;
          } else {
            state.mode = "wait";
            state.timer = SQ.STORM.phases[state.phase].wait;
            choosePhase(state.phase);
            SQ.HUD.announce("New safe zone marked", "zone");
          }
        }
      }
    }

    const r = Math.max(0.5, state.current.r);
    wall.scale.set(r, 1, r);
    wall.position.set(state.current.x, WALL_HEIGHT / 2 - 30, state.current.z);
    wallTex.offset.x += dt * 0.012;
    wallTex.offset.y -= dt * 0.05;

    state.flicker -= dt;
    if (state.flicker < -6 + Math.random() * 3) state.flicker = 0.12;
    // The wall is a looming presence up close and a faint curtain from across the island.
    let closeness = 0.5;
    if (viewer) {
      const d = Math.hypot(viewer.x - state.current.x, viewer.z - state.current.z);
      const edge = d - state.current.r;
      closeness = U.clamp(1 - Math.abs(edge) / 130, 0, 1);
      SQ.Audio.setStorm(U.clamp(1 - Math.abs(edge) / 40, 0, 1) * 0.6 + (edge > 0 ? 0.4 : 0));
    }
    wall.material.opacity = U.lerp(0.1, 0.5, closeness) + (state.flicker > 0 ? 0.15 : 0);
  }

  function isInside(x, z) {
    return Math.hypot(x - state.current.x, z - state.current.z) <= state.current.r;
  }

  SQ.Storm = { init, reset, update, isInside, state };
})(window.SQ = window.SQ || {});
