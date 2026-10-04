// Squall: grid building. Walls, floors, ramps and roofs with ghost preview, validation and destruction. By The_headphones
(function (SQ) {
  const { CFG, U } = SQ;
  const B = CFG.BUILD;
  const CELL = B.cell;
  const LEVEL = B.level;
  const ROOF_RISE = 1.6;
  const HP = { wall: 150, floor: 140, ramp: 140, roof: 120 };
  const BUILD_TIME = 1.1;
  const RAMP_ROT = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];

  let scene;
  const pieces = new Map();
  let geos;
  let baseMaterial;
  const ghosts = {};
  let ghostValid;
  let ghostInvalid;

  function plankTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#b8874f";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) {
      const shade = 0.85 + Math.random() * 0.25;
      g.fillStyle = `rgba(${Math.round(184 * shade)}, ${Math.round(135 * shade)}, ${Math.round(79 * shade)}, 1)`;
      g.fillRect(0, i * 32 + 2, 128, 28);
      g.fillStyle = "rgba(60, 35, 15, 0.25)";
      for (let k = 0; k < 6; k++) g.fillRect(Math.random() * 128, i * 32 + 6 + Math.random() * 20, 18 + Math.random() * 30, 1);
    }
    g.fillStyle = "#5a3a1e";
    for (let i = 0; i <= 4; i++) g.fillRect(0, i * 32, 128, 2);
    g.fillRect(0, 0, 3, 128);
    g.fillRect(125, 0, 3, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function init(sceneRef) {
    scene = sceneRef;
    const roof = new THREE.ConeGeometry(Math.SQRT2 * 2, ROOF_RISE, 4, 1);
    roof.rotateY(Math.PI / 4);
    geos = {
      wall: new THREE.BoxGeometry(CELL, LEVEL, 0.22),
      floor: new THREE.BoxGeometry(CELL, 0.22, CELL),
      ramp: new THREE.BoxGeometry(CELL, 0.22, Math.hypot(CELL, LEVEL)),
      roof,
    };
    baseMaterial = new THREE.MeshLambertMaterial({ map: plankTexture() });
    ghostValid = new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.35, depthWrite: false });
    ghostInvalid = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.35, depthWrite: false });
    Object.keys(geos).forEach((type) => {
      const m = new THREE.Mesh(geos[type], ghostValid);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geos[type]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      m.add(edges);
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      ghosts[type] = m;
    });
  }

  function facingDir(yaw) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 0 : 2;
    return fz > 0 ? 1 : 3;
  }

  // Pieces near each other share one vertical lattice, so stacked builds line up.
  function latticeOrigin(x, z, feet) {
    let best = null;
    let bestD = 12;
    pieces.forEach((p) => {
      const d = Math.hypot(p.cx - x, p.cz - z);
      if (d < bestD && Math.abs(p.base - feet) < LEVEL * 3) {
        bestD = d;
        best = p;
      }
    });
    return best ? best.base : feet - 0.1;
  }

  function cellOf(v) {
    return Math.floor(v / CELL);
  }

  // Works out where a piece of `type` would go for a character looking along yaw/pitch.
  function target(ch, type, yaw, pitch) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const { x: px, y: feet, z: pz } = ch.pos;
    const origin = latticeOrigin(px, pz, feet);
    const snap = (y) => origin + Math.round((y - origin) / LEVEL) * LEVEL;
    const dir = facingDir(yaw);
    const t = { type, dir, axis: null, base: 0, x0: 0, z0: 0, cx: 0, cz: 0, box: null };

    if (type === "wall") {
      const cx = cellOf(px + fx * 1.2);
      const cz = cellOf(pz + fz * 1.2);
      t.base = origin + Math.floor((feet - origin + 1) / LEVEL) * LEVEL;
      if (dir === 0 || dir === 2) {
        const ex = (dir === 0 ? cx + 1 : cx) * CELL;
        t.axis = "z";
        t.cx = ex;
        t.cz = cz * CELL + CELL / 2;
        t.key = `w:z:${ex / CELL}:${cz}`;
        t.box = { minX: ex - 0.11, maxX: ex + 0.11, minZ: cz * CELL, maxZ: cz * CELL + CELL };
      } else {
        const ez = (dir === 1 ? cz + 1 : cz) * CELL;
        t.axis = "x";
        t.cx = cx * CELL + CELL / 2;
        t.cz = ez;
        t.key = `w:x:${cx}:${ez / CELL}`;
        t.box = { minX: cx * CELL, maxX: cx * CELL + CELL, minZ: ez - 0.11, maxZ: ez + 0.11 };
      }
      t.box.minY = t.base;
      t.box.maxY = t.base + LEVEL;
    } else {
      let cx;
      let cz;
      if (type === "floor") {
        const ahead = pitch < -0.6 ? 0 : 3;
        cx = cellOf(px + fx * ahead);
        cz = cellOf(pz + fz * ahead);
        t.base = snap(feet + (pitch > 0.45 ? LEVEL : 0));
      } else if (type === "ramp") {
        cx = cellOf(px + fx * 2.2);
        cz = cellOf(pz + fz * 2.2);
        t.base = snap(feet);
      } else {
        cx = cellOf(px + fx * 0.5);
        cz = cellOf(pz + fz * 0.5);
        t.base = snap(feet) + LEVEL;
      }
      t.x0 = cx * CELL;
      t.z0 = cz * CELL;
      t.cx = t.x0 + CELL / 2;
      t.cz = t.z0 + CELL / 2;
      t.key = `${type[0]}:${cx}:${cz}`;
      const top = type === "floor" ? t.base + 0.11 : type === "ramp" ? t.base + LEVEL : t.base + ROOF_RISE;
      const bottom = type === "floor" ? t.base - 0.11 : t.base;
      t.box = { minX: t.x0, maxX: t.x0 + CELL, minZ: t.z0, maxZ: t.z0 + CELL, minY: bottom, maxY: top };
    }
    t.key += `:${Math.round(t.base * 4)}`;
    return t;
  }

  function intersectsCharacter(box) {
    for (const ch of SQ.Game.characters) {
      if (!ch.alive) continue;
      const cx = U.clamp(ch.pos.x, box.minX, box.maxX);
      const cz = U.clamp(ch.pos.z, box.minZ, box.maxZ);
      if (Math.hypot(ch.pos.x - cx, ch.pos.z - cz) < ch.radius - 0.05 && ch.pos.y < box.maxY && ch.pos.y + ch.currentHeight() > box.minY) return true;
    }
    return false;
  }

  function validate(ch, t) {
    if (ch.inventory.mats < B.cost) return "Not enough materials";
    if (pieces.has(t.key)) return "Already built there";
    if (Math.hypot(t.cx, t.cz) > CFG.BOUNDARY - 4) return "Out of bounds";
    if (t.base > 140) return "Too high";
    const buried = t.type === "wall" ? t.box.maxY - 0.6 : t.box.maxY + 0.4;
    if (SQ.Terrain.height(t.cx, t.cz) > buried) return "Blocked by terrain";
    if (t.type === "wall" && intersectsCharacter(t.box)) return "Someone is in the way";
    return null;
  }

  function transform(obj, t) {
    obj.rotation.set(0, 0, 0);
    if (t.type === "wall") {
      obj.position.set(t.cx, t.base + LEVEL / 2, t.cz);
      obj.rotation.y = t.axis === "z" ? Math.PI / 2 : 0;
    } else if (t.type === "floor") {
      obj.position.set(t.cx, t.base, t.cz);
    } else if (t.type === "ramp") {
      obj.position.set(t.cx, t.base + LEVEL / 2, t.cz);
      obj.rotation.set(Math.PI / 4, RAMP_ROT[t.dir] + Math.PI, 0, "YXZ");
    } else {
      obj.position.set(t.cx, t.base + ROOF_RISE / 2, t.cz);
    }
  }

  function showGhost(t, valid) {
    Object.entries(ghosts).forEach(([type, mesh]) => {
      mesh.visible = !!t && type === t.type;
    });
    if (!t) return;
    const g = ghosts[t.type];
    g.material = valid ? ghostValid : ghostInvalid;
    transform(g, t);
  }

  function place(ch, t) {
    const material = baseMaterial.clone();
    const mesh = new THREE.Mesh(geos[t.type], material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    transform(mesh, t);
    mesh.scale.setScalar(0.4);
    scene.add(mesh);
    const piece = {
      type: t.type, key: t.key, base: t.base, dir: t.dir, cx: t.cx, cz: t.cz,
      hp: HP[t.type] * 0.35, maxHp: HP[t.type], buildT: 0, owner: ch, mesh, material, flash: 0, colliders: [],
    };
    const b = t.box;
    let collider;
    if (t.type === "ramp") collider = { shape: "ramp", minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, y0: t.base, rise: LEVEL, dir: t.dir };
    else if (t.type === "roof") collider = { shape: "roof", minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, y0: t.base, rise: ROOF_RISE };
    else collider = { shape: "box", ...b };
    collider.surface = "wood";
    collider.piece = piece;
    piece.colliders.push(SQ.Physics.add(collider));
    pieces.set(t.key, piece);
    ch.inventory.mats -= B.cost;
    ch.buildCooldown = B.cooldown;
    SQ.Audio.build(mesh.position, ch.isPlayer);
    return piece;
  }

  // Convenience for bots: place a piece in front if possible.
  function tryBuild(ch, type, yaw, pitch = 0) {
    if (ch.buildCooldown > 0) return null;
    const t = target(ch, type, yaw, pitch);
    if (validate(ch, t)) return null;
    return place(ch, t);
  }

  function destroy(piece) {
    if (!pieces.has(piece.key)) return;
    pieces.delete(piece.key);
    piece.colliders.forEach((c) => SQ.Physics.remove(c));
    scene.remove(piece.mesh);
    piece.material.dispose();
    const p = piece.mesh.position;
    SQ.Effects.burst(p.x, p.y, p.z, "#b8874f", 34);
    SQ.Effects.emit("smoke", p.x, p.y, p.z, 8, { color: "#9c8a72", speed: 1.5, life: 1, gravity: -0.5, spread: 1 });
    SQ.Audio.buildBreak(p);
  }

  function damage(piece, amount, attacker, hit) {
    if (!pieces.has(piece.key)) return;
    piece.hp -= amount;
    piece.flash = 0.08;
    if (hit) SQ.Effects.emit("debris", hit.x, hit.y, hit.z, 4, { color: "#c9965c", speed: 3, life: 0.5, spread: 1 });
    if (attacker && attacker.isPlayer) SQ.HUD.structureHit(Math.max(0, piece.hp), piece.maxHp);
    if (piece.hp <= 0) destroy(piece);
  }

  const damaged = new THREE.Color("#6b3b2a");
  const white = new THREE.Color("#ffffff");
  function update(dt) {
    pieces.forEach((piece) => {
      if (piece.buildT < 1) {
        piece.buildT = Math.min(1, piece.buildT + dt / BUILD_TIME);
        piece.hp = Math.min(piece.maxHp, piece.hp + (piece.maxHp * 0.65 * dt) / BUILD_TIME);
        piece.mesh.scale.setScalar(U.lerp(0.4, 1, Math.min(1, piece.buildT * 4)));
      }
      const ratio = U.clamp(piece.hp / piece.maxHp, 0, 1);
      piece.material.color.copy(white).lerp(damaged, (1 - ratio) * 0.75);
      if (piece.flash > 0) {
        piece.flash -= dt;
        piece.material.emissive.setRGB(piece.flash > 0 ? 0.35 : 0, piece.flash > 0 ? 0.3 : 0, piece.flash > 0 ? 0.25 : 0);
      }
    });
  }

  function clear() {
    pieces.forEach((piece) => {
      piece.colliders.forEach((c) => SQ.Physics.remove(c));
      scene.remove(piece.mesh);
      piece.material.dispose();
    });
    pieces.clear();
    showGhost(null);
  }

  SQ.Building = {
    init, target, validate, place, tryBuild, damage, destroy, update, clear, showGhost, facingDir,
    get count() {
      return pieces.size;
    },
  };
})(window.SQ = window.SQ || {});
