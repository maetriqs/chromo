// Squall: pooled particles, tracers, muzzle flashes, explosions and damage numbers. By The_headphones
(function (SQ) {
  const MAX_PARTICLES = 900;
  const MAX_TRACERS = 90;
  const MAX_FLASHES = 10;
  const MAX_NUMBERS = 18;

  let scene;
  let camera;
  const systems = {};
  const tracers = [];
  let tracerGeo;
  const flashes = [];
  const lights = [];
  const numbers = [];
  const projected = new THREE.Vector3();

  function makeSystem(name, size, additive) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    systems[name] = { points, geo, pos, col, list: [], additive };
  }

  function radialTexture(inner, outer) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function init(sceneRef, cameraRef, numberLayer) {
    scene = sceneRef;
    camera = cameraRef;
    makeSystem("spark", 0.16, true);
    makeSystem("debris", 0.24, false);
    makeSystem("smoke", 0.9, false);

    tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tracerGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tracerGeo.setDrawRange(0, 0);
    const tracerMesh = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    tracerMesh.frustumCulled = false;
    scene.add(tracerMesh);

    const flashTex = radialTexture("rgba(255,250,220,1)", "rgba(255,170,60,0.8)");
    for (let i = 0; i < MAX_FLASHES; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      scene.add(s);
      flashes.push({ sprite: s, life: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xffc070, 0, 14, 2);
      scene.add(light);
      lights.push({ light, life: 0 });
    }

    for (let i = 0; i < MAX_NUMBERS; i++) {
      const el = document.createElement("span");
      el.className = "dmg-number";
      el.hidden = true;
      numberLayer.appendChild(el);
      numbers.push({ el, life: 0, x: 0, y: 0, z: 0 });
    }
  }

  // opts: { color, speed, life, gravity, nx, ny, nz (bias direction), spread, drag }
  const tmpColor = new THREE.Color();
  function emit(name, x, y, z, count, opts = {}) {
    const sys = systems[name];
    if (!sys) return;
    tmpColor.set(opts.color || "#ffffff");
    const speed = opts.speed ?? 4;
    const spread = opts.spread ?? 1;
    for (let i = 0; i < count && sys.list.length < MAX_PARTICLES; i++) {
      let vx = (Math.random() * 2 - 1) * spread;
      let vy = (Math.random() * 2 - 1) * spread;
      let vz = (Math.random() * 2 - 1) * spread;
      vx += opts.nx || 0;
      vy += opts.ny || 0;
      vz += opts.nz || 0;
      const len = Math.hypot(vx, vy, vz) || 1;
      const s = speed * (0.5 + Math.random() * 0.7);
      const life = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.6);
      const jitter = opts.jitter ?? 0.1;
      sys.list.push({
        x, y, z,
        vx: (vx / len) * s, vy: (vy / len) * s + (opts.lift || 0), vz: (vz / len) * s,
        life, max: life,
        r: tmpColor.r * (1 - Math.random() * jitter), g: tmpColor.g * (1 - Math.random() * jitter), b: tmpColor.b * (1 - Math.random() * jitter),
        gravity: opts.gravity ?? 9, drag: opts.drag ?? 1.5,
      });
    }
  }

  function tracer(ax, ay, az, bx, by, bz, hex = "#ffe2a0", life = 0.07) {
    if (tracers.length >= MAX_TRACERS) tracers.shift();
    tmpColor.set(hex);
    tracers.push({ ax, ay, az, bx, by, bz, r: tmpColor.r, g: tmpColor.g, b: tmpColor.b, life, max: life });
  }

  function flash(x, y, z, scale = 0.6, withLight = true) {
    const f = flashes.find((item) => item.life <= 0) || flashes[0];
    f.life = 0.05;
    f.sprite.position.set(x, y, z);
    f.sprite.scale.setScalar(scale * (0.8 + Math.random() * 0.4));
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.visible = true;
    if (withLight) {
      const l = lights.find((item) => item.life <= 0) || lights[0];
      l.life = 0.06;
      l.light.position.set(x, y, z);
      l.light.intensity = 2.2;
    }
  }

  function impact(x, y, z, nx, ny, nz, surface) {
    const dust = { wood: "#b48a5a", metal: "#c9ced4", stone: "#9a9c96", grass: "#7f9a58", sand: "#d8c690", terrain: "#8c8a6a" }[surface] || "#a09a8a";
    emit("debris", x, y, z, 5, { color: dust, speed: 3, life: 0.45, nx: nx * 1.5, ny: ny * 1.5, nz: nz * 1.5, spread: 0.9 });
    emit("spark", x, y, z, surface === "metal" ? 6 : 2, { color: "#ffd38a", speed: 5, life: 0.18, nx, ny, nz, spread: 1 });
  }

  function hitCharacter(x, y, z, shield) {
    emit("spark", x, y, z, 10, { color: shield ? "#6fd6ff" : "#fff1d6", speed: 4.5, life: 0.25, spread: 1, gravity: 4 });
  }

  function explosion(x, y, z) {
    emit("spark", x, y, z, 70, { color: "#ffb347", speed: 13, life: 0.6, spread: 1, gravity: 6, lift: 3 });
    emit("spark", x, y, z, 30, { color: "#fff0b0", speed: 7, life: 0.35, spread: 1, gravity: 2 });
    emit("smoke", x, y + 0.5, z, 26, { color: "#4a4a4a", speed: 3, life: 1.6, spread: 1, gravity: -1.5, lift: 2, jitter: 0.3 });
    emit("debris", x, y, z, 30, { color: "#3a2a20", speed: 9, life: 1.1, spread: 1, lift: 4 });
    flash(x, y + 0.6, z, 6, true);
  }

  function burst(x, y, z, hex, count = 24) {
    emit("debris", x, y, z, count, { color: hex, speed: 6, life: 0.9, spread: 1, lift: 2.5, jitter: 0.25 });
  }

  function damageNumber(x, y, z, amount, kind) {
    const n = numbers.find((item) => item.life <= 0) || numbers[0];
    n.life = 0.85;
    n.x = x + (Math.random() - 0.5) * 0.4;
    n.y = y;
    n.z = z + (Math.random() - 0.5) * 0.4;
    n.el.textContent = String(Math.round(amount));
    n.el.className = `dmg-number is-${kind}`;
    n.el.hidden = false;
  }

  function updateSystem(sys, dt) {
    let n = 0;
    const list = sys.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (const p of list) {
      const fade = sys.additive ? p.life / p.max : 1;
      sys.pos[n * 3] = p.x;
      sys.pos[n * 3 + 1] = p.y;
      sys.pos[n * 3 + 2] = p.z;
      sys.col[n * 3] = p.r * fade;
      sys.col[n * 3 + 1] = p.g * fade;
      sys.col[n * 3 + 2] = p.b * fade;
      n++;
    }
    sys.geo.setDrawRange(0, n);
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.color.needsUpdate = true;
  }

  function update(dt) {
    Object.values(systems).forEach((sys) => updateSystem(sys, dt));

    const tp = tracerGeo.attributes.position.array;
    const tc = tracerGeo.attributes.color.array;
    let t = 0;
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) tracers.splice(i, 1);
    }
    for (const tr of tracers) {
      const f = tr.life / tr.max;
      tp.set([tr.ax, tr.ay, tr.az, tr.bx, tr.by, tr.bz], t * 6);
      tc.set([tr.r * f * 0.3, tr.g * f * 0.3, tr.b * f * 0.3, tr.r * f, tr.g * f, tr.b * f], t * 6);
      t++;
    }
    tracerGeo.setDrawRange(0, t * 2);
    tracerGeo.attributes.position.needsUpdate = true;
    tracerGeo.attributes.color.needsUpdate = true;

    flashes.forEach((f) => {
      if (f.life > 0) {
        f.life -= dt;
        if (f.life <= 0) f.sprite.visible = false;
      }
    });
    lights.forEach((l) => {
      if (l.life > 0) {
        l.life -= dt;
        l.light.intensity = Math.max(0, l.life / 0.06) * 2.2;
      }
    });

    const w = window.innerWidth;
    const h = window.innerHeight;
    numbers.forEach((n) => {
      if (n.life <= 0) return;
      n.life -= dt;
      n.y += dt * 1.1;
      projected.set(n.x, n.y, n.z).project(camera);
      if (n.life <= 0 || projected.z > 1) {
        n.el.hidden = true;
        n.life = 0;
        return;
      }
      const sx = (projected.x * 0.5 + 0.5) * w;
      const sy = (-projected.y * 0.5 + 0.5) * h;
      n.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
      n.el.style.opacity = Math.min(1, n.life * 3).toFixed(2);
    });
  }

  function clear() {
    Object.values(systems).forEach((sys) => {
      sys.list.length = 0;
    });
    tracers.length = 0;
    numbers.forEach((n) => {
      n.life = 0;
      n.el.hidden = true;
    });
  }

  SQ.Effects = { init, update, emit, tracer, flash, impact, hitCharacter, explosion, burst, damageNumber, clear };
})(window.SQ = window.SQ || {});
