// Quarry: first-person movement, collision, swimming, flight, health, mining and building. By The_headphones
(function (QY) {
  const CFG = QY.CFG;
  const W = QY.World;
  const ID = QY.ID;
  const { T_SOLID, T_KIND, KIND } = QY;
  const HALF = CFG.PLAYER_WIDTH / 2;
  const TALL = CFG.PLAYER_HEIGHT;
  const EPS = 1e-4;
  const MAX_AIR = 10;

  const P = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    onGround: false,
    inWater: false,
    headInWater: false,
    flying: false,
    creative: false,
    health: 20,
    air: MAX_AIR,
    alive: true,
    deathReason: "",
    target: null,
    mining: null,
    hurtFlash: 0,
    speed: 0,
    sprinting: false,
    fov: 70,
    currentFov: 70,
    autoJump: false,
    bobbing: true,
    sensitivity: 1,
    invertY: false,
  };

  let fallTop = null;
  let sinceHurt = 10;
  let regenTimer = 0;
  let drownTimer = 0;
  let stepDist = 0;
  let breakCooldown = 0;
  let placeCooldown = 0;
  let digSoundTimer = 0;
  let swingTimer = 0;
  let wasInWater = false;
  const events = [];

  // ---- collision ------------------------------------------------------------------------------
  function overlaps(px, py, pz) {
    const x0 = Math.floor(px - HALF + EPS);
    const x1 = Math.floor(px + HALF - EPS);
    const y0 = Math.floor(py + EPS);
    const y1 = Math.floor(py + TALL - EPS);
    const z0 = Math.floor(pz - HALF + EPS);
    const z1 = Math.floor(pz + HALF - EPS);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) if (T_SOLID[W.get(x, y, z)]) return true;
      }
    }
    return false;
  }

  // Moves along one axis in sub-steps, stopping flush against the first solid block.
  function moveAxis(axis, delta) {
    if (!delta) return false;
    const steps = Math.ceil(Math.abs(delta) / 0.4);
    const d = delta / steps;
    const p = P.pos;
    for (let i = 0; i < steps; i++) {
      p[axis] += d;
      if (!overlaps(p.x, p.y, p.z)) continue;
      if (axis === "y") {
        if (d < 0) p.y = Math.floor(p.y + EPS) + 1;
        else p.y = Math.floor(p.y + TALL - EPS) - TALL - 0.001;
      } else if (d > 0) {
        p[axis] = Math.floor(p[axis] + HALF - EPS) - HALF - 0.001;
      } else {
        p[axis] = Math.floor(p[axis] - HALF + EPS) + 1 + HALF + 0.001;
      }
      return true;
    }
    return false;
  }

  function waterAt(x, y, z) {
    return T_KIND[W.get(Math.floor(x), Math.floor(y), Math.floor(z))] === KIND.WATER;
  }

  // ---- life -----------------------------------------------------------------------------------
  function damage(amount, reason) {
    if (P.creative || !P.alive || amount <= 0) return;
    P.health = Math.max(0, P.health - amount);
    P.hurtFlash = 1;
    sinceHurt = 0;
    QY.Audio.hurt();
    if (P.health <= 0) {
      P.alive = false;
      P.deathReason = reason;
      P.mining = null;
      events.push({ type: "death", reason });
    }
  }

  function placeAt(x, y, z, yaw = P.yaw, pitch = 0) {
    P.pos.set(x, y, z);
    P.vel.set(0, 0, 0);
    P.yaw = yaw;
    P.pitch = pitch;
    // Never start inside blocks: climb until there is room.
    for (let i = 0; i < 80 && overlaps(P.pos.x, P.pos.y, P.pos.z); i++) P.pos.y += 1;
    fallTop = null;
  }

  function respawn() {
    const s = W.spawn;
    placeAt(s.x, s.y, s.z, Math.PI * 0.25, -0.15);
    P.health = 20;
    P.air = MAX_AIR;
    P.alive = true;
    P.flying = false;
    P.mining = null;
    P.hurtFlash = 0;
    sinceHurt = 10;
  }

  // ---- interaction ----------------------------------------------------------------------------
  function viewDir(out) {
    const cp = Math.cos(P.pitch);
    return out.set(-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp);
  }
  const dir = new THREE.Vector3();

  const breakTime = (id) => QY.BLOCKS[id].hardness * 1.2;

  function lightAt(x, y, z) {
    const sky = W.skyAt(x, y, z) * QY.Chunks.uniforms.daylight.value;
    return Math.max(0.25, sky, QY.Mesher.blockBright(W.lightAt(x, y, z)));
  }

  function breakBlock(hit) {
    const { x, y, z } = hit;
    const id = W.get(x, y, z);
    if (!id) return;
    const b = QY.BLOCKS[id];
    const nearWater = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(
      ([dx, dy, dz]) => T_KIND[W.get(x + dx, y + dy, z + dz)] === KIND.WATER,
    );
    const box = W.setBlock(x, y, z, nearWater ? ID.water : 0);
    if (!box) return;
    QY.Chunks.blockChanged(x, z, box);
    const bright = lightAt(x, y + 1, z);
    QY.Effects.burst(x, y, z, id, bright);
    QY.Audio.breakBlock(id);
    if (!P.creative && b.drop) {
      QY.Drops.spawn(b.drop, x + 0.5, y + 0.5, z + 0.5, (Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2);
    }
    // Flowers and grass fall with the block they stood on.
    const above = W.get(x, y + 1, z);
    if (T_KIND[above] === KIND.PLANT) {
      const box2 = W.setBlock(x, y + 1, z, 0);
      if (box2) QY.Chunks.blockChanged(x, z, box2);
      QY.Effects.burst(x, y + 1, z, above, bright, 10);
      const drop = QY.BLOCKS[above].drop;
      if (!P.creative && drop) QY.Drops.spawn(drop, x + 0.5, y + 1.3, z + 0.5, 0, 2, 0);
    }
    events.push({ type: "break", id });
  }

  function tryPlace(hit) {
    const id = QY.Inventory.selectedId();
    if (!id || !hit) return false;
    const b = QY.BLOCKS[id];
    let x = hit.x + hit.nx;
    let y = hit.y + hit.ny;
    let z = hit.z + hit.nz;
    if (T_KIND[hit.id] === KIND.PLANT) {
      x = hit.x;
      y = hit.y;
      z = hit.z;
    } else if (!hit.nx && !hit.ny && !hit.nz) return false;
    if (!W.inside(x, y, z)) return false;
    const cur = W.get(x, y, z);
    if (cur && T_KIND[cur] !== KIND.WATER && T_KIND[cur] !== KIND.PLANT) return false;
    if (b.kind === "plant") {
      const below = W.get(x, y - 1, z);
      if (cur || (below !== ID.grass && below !== ID.dirt && below !== ID.snow)) return false;
    } else if (T_SOLID[id]) {
      const p = P.pos;
      const hitsPlayer =
        x < p.x + HALF - 0.01 && x + 1 > p.x - HALF + 0.01 && z < p.z + HALF - 0.01 && z + 1 > p.z - HALF + 0.01 && y < p.y + TALL - 0.01 && y + 1 > p.y + 0.01;
      if (hitsPlayer) return false;
    }
    if (!QY.Inventory.consumeSelected()) return false;
    const box = W.setBlock(x, y, z, id);
    if (box) QY.Chunks.blockChanged(x, z, box);
    QY.Audio.place(id);
    QY.Hand.swing();
    events.push({ type: "place", id });
    return true;
  }

  function dropSelected() {
    const s = QY.Inventory.selectedStack();
    if (!s || P.creative) return;
    const id = s.id;
    QY.Inventory.consumeSelected();
    viewDir(dir);
    const e = eye();
    QY.Drops.spawn(id, e.x + dir.x * 0.5, e.y - 0.3 + dir.y * 0.5, e.z + dir.z * 0.5, dir.x * 5, dir.y * 5 + 1.5, dir.z * 5, 1, 1.5);
    QY.Hand.swing();
  }

  const eyeVec = new THREE.Vector3();
  function eye() {
    return eyeVec.set(P.pos.x, P.pos.y + CFG.EYE, P.pos.z);
  }

  function interact(dt, I) {
    const e = eye();
    viewDir(dir);
    const hit = W.raycast(e.x, e.y, e.z, dir.x, dir.y, dir.z, P.creative ? CFG.REACH_CREATIVE : CFG.REACH);
    P.target = hit;
    breakCooldown = Math.max(0, breakCooldown - dt);
    placeCooldown = Math.max(0, placeCooldown - dt);
    swingTimer = Math.max(0, swingTimer - dt);

    if (I.breakHeld()) {
      if (swingTimer <= 0) {
        QY.Hand.swing();
        swingTimer = 0.25;
      }
      if (hit) {
        const hardness = QY.BLOCKS[hit.id].hardness;
        if (P.creative) {
          if (breakCooldown <= 0 && hit.id !== ID.bedrock) {
            breakBlock(hit);
            breakCooldown = 0.22;
          }
          P.mining = null;
        } else if (Number.isFinite(hardness)) {
          const m = P.mining;
          if (!m || m.x !== hit.x || m.y !== hit.y || m.z !== hit.z) P.mining = { x: hit.x, y: hit.y, z: hit.z, progress: 0, id: hit.id };
          if (breakCooldown <= 0) {
            const t = breakTime(hit.id);
            P.mining.progress += t > 0 ? dt / t : 1;
            digSoundTimer -= dt;
            if (digSoundTimer <= 0 && t > 0) {
              QY.Audio.dig(hit.id);
              QY.Effects.chip(hit, hit.id, lightAt(hit.x, hit.y + 1, hit.z));
              digSoundTimer = 0.24;
            }
            if (P.mining.progress >= 1) {
              breakBlock(hit);
              P.mining = null;
              breakCooldown = 0.12;
            }
          }
        } else P.mining = null;
      } else P.mining = null;
    } else {
      P.mining = null;
      digSoundTimer = 0;
    }

    if (I.placePressed()) {
      if (tryPlace(hit)) placeCooldown = 0.25;
      else placeCooldown = 0.1;
    } else if (I.placeHeld() && placeCooldown <= 0) {
      if (tryPlace(hit)) placeCooldown = 0.22;
      else placeCooldown = 0.1;
    }
    if (I.pickPressed() && hit) QY.Inventory.pick(hit.id);
    if (I.pressed("KeyQ")) dropSelected();
  }

  // ---- per-frame update -----------------------------------------------------------------------
  function update(dt, I, active) {
    P.hurtFlash = Math.max(0, P.hurtFlash - dt * 2.5);
    sinceHurt += dt;

    if (active && P.alive) {
      const look = I.consumeLook();
      const k = 0.0022 * P.sensitivity;
      const kt = 0.0058 * P.sensitivity;
      P.yaw -= look.mx * k + look.tx * kt;
      P.pitch -= (look.my * k + look.ty * kt) * (P.invertY ? -1 : 1);
      P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch));
    } else I.consumeLook();

    const move = active && P.alive ? I.move() : { x: 0, z: 0, sprint: false };
    const jumpHeld = active && P.alive && I.jumpHeld();
    // A tap shorter than one frame still counts as a jump.
    const jumpWish = jumpHeld || (active && P.alive && I.jumpPressed());
    if (active && P.alive && P.creative && I.consumeDoubleJump()) {
      P.flying = !P.flying;
      P.vel.y = 0;
      events.push({ type: "fly", on: P.flying });
    }

    const p = P.pos;
    P.inWater = waterAt(p.x, p.y + 0.1, p.z) || waterAt(p.x, p.y + 0.9, p.z);
    P.headInWater = waterAt(p.x, p.y + CFG.EYE, p.z);
    if (P.inWater && !wasInWater && P.vel.y < -4) QY.Audio.splash();
    wasInWater = P.inWater;

    // Desired horizontal velocity from yaw and stick/keys.
    let mx = move.x;
    let mz = move.z;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const sin = Math.sin(P.yaw);
    const cos = Math.cos(P.yaw);
    const fx = -sin * mz + cos * mx;
    const fz = -cos * mz - sin * mx;
    // While flying, Shift sinks instead of sprinting; double-tap W still sprints.
    const sprintWish = P.flying ? I.sprintKey() || (move.sprint && !I.shiftDown()) : move.sprint;
    P.sprinting = sprintWish && mz > 0.3 && !P.inWater;
    let speed = CFG.WALK;
    if (P.flying) speed = P.sprinting ? 16 : 9;
    else if (P.inWater) speed = CFG.SWIM;
    else if (P.sprinting) speed = CFG.SPRINT;
    const control = P.flying ? 8 : P.onGround ? 14 : P.inWater ? 6 : 4.5;
    const blend = 1 - Math.exp(-control * dt);
    P.vel.x += (fx * speed - P.vel.x) * blend;
    P.vel.z += (fz * speed - P.vel.z) * blend;

    if (P.flying) {
      const vy = ((jumpHeld ? 1 : 0) - (active && I.descendHeld() ? 1 : 0)) * 7.5;
      P.vel.y += (vy - P.vel.y) * (1 - Math.exp(-10 * dt));
    } else if (P.inWater) {
      P.vel.y -= 10 * dt;
      if (jumpHeld) P.vel.y += 24 * dt;
      P.vel.y *= Math.pow(0.25, dt);
      P.vel.y = Math.max(-3.5, Math.min(3.2, P.vel.y));
    } else {
      P.vel.y = Math.max(-60, P.vel.y - CFG.GRAVITY * dt);
      if (jumpWish && P.onGround) P.vel.y = CFG.JUMP_SPEED;
    }

    const prevX = p.x;
    const prevZ = p.z;
    const hitX = moveAxis("x", P.vel.x * dt);
    if (hitX) P.vel.x = 0;
    const hitZ = moveAxis("z", P.vel.z * dt);
    if (hitZ) P.vel.z = 0;
    const falling = P.vel.y < 0;
    const hitY = moveAxis("y", P.vel.y * dt);
    const wasOnGround = P.onGround;
    P.onGround = (hitY && falling) || (P.vel.y <= 0 && overlaps(p.x, p.y - 0.03, p.z));
    if (hitY) P.vel.y = 0;

    // Climb out of water onto a ledge, and optional auto-jump onto one-block steps.
    const blocked = (hitX || hitZ) && len > 0.2;
    if (blocked && P.inWater && jumpHeld) P.vel.y = 5.2;
    else if (blocked && P.autoJump && P.onGround && !P.flying) {
      const fl = Math.hypot(fx, fz) || 1;
      const sx = (fx / fl) * 0.4;
      const sz = (fz / fl) * 0.4;
      if (!overlaps(p.x, p.y + 1.05, p.z) && !overlaps(p.x + sx, p.y + 1.05, p.z + sz)) P.vel.y = CFG.JUMP_SPEED;
    }

    if (P.flying && P.onGround && !jumpHeld) P.flying = false;
    if (P.flying) p.y = Math.min(p.y, CFG.HEIGHT + 24);

    // Fall damage counts from the highest point of a fall; water and flight reset it.
    if (P.onGround || P.inWater || P.flying) {
      if (P.onGround && !wasOnGround && fallTop !== null && !P.inWater) {
        const fall = fallTop - p.y;
        if (fall > 3.4) damage(Math.floor(fall - 3), "fell from a high place");
        if (fall > 1.2) QY.Audio.land(W.get(Math.floor(p.x), Math.floor(p.y - 0.5), Math.floor(p.z)));
      }
      fallTop = P.onGround || P.flying ? p.y : null;
    } else {
      fallTop = fallTop === null ? p.y : Math.max(fallTop, p.y);
    }

    if (p.y < CFG.VOID_Y) {
      if (P.creative) {
        respawn();
        events.push({ type: "void" });
      } else if (P.alive) damage(1000, "fell out of the world");
    }

    // Air and drowning.
    if (P.headInWater && !P.creative) {
      P.air = Math.max(0, P.air - dt);
      if (P.air <= 0) {
        drownTimer -= dt;
        if (drownTimer <= 0) {
          damage(2, "drowned");
          drownTimer = 1;
        }
      }
    } else {
      P.air = Math.min(MAX_AIR, P.air + dt * 4);
      drownTimer = 0;
    }

    // Slow natural healing after a few calm seconds.
    if (P.alive && !P.creative && P.health < 20 && sinceHurt > 4) {
      regenTimer += dt;
      if (regenTimer > 2.5) {
        regenTimer = 0;
        P.health = Math.min(20, P.health + 1);
      }
    } else regenTimer = 0;

    const moved = Math.hypot(p.x - prevX, p.z - prevZ);
    P.speed = dt > 0 ? moved / dt : 0;
    if (P.onGround && !P.inWater) {
      stepDist += moved;
      if (stepDist > (P.sprinting ? 2.1 : 1.7)) {
        stepDist = 0;
        QY.Audio.step(W.get(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z)));
      }
    }

    const targetFov = P.fov * (P.sprinting && P.speed > 4.5 ? 1.12 : 1);
    P.currentFov = P.currentFov ? P.currentFov + (targetFov - P.currentFov) * (1 - Math.exp(-10 * dt)) : targetFov;

    if (active && P.alive) interact(dt, I);
    else {
      P.mining = null;
      P.target = active ? P.target : null;
    }
  }

  // Positions the world camera at the eyes, with a little view bob while walking.
  let bobPhase = 0;
  function applyCamera(camera, dt) {
    const p = P.pos;
    let bob = 0;
    let roll = 0;
    if (P.bobbing && P.onGround && P.speed > 0.5 && !P.flying) {
      bobPhase += dt * P.speed * 2.1;
      const k = Math.min(1, P.speed / CFG.WALK);
      bob = Math.abs(Math.sin(bobPhase)) * 0.06 * k;
      roll = Math.sin(bobPhase) * 0.006 * k;
    }
    camera.position.set(p.x, p.y + CFG.EYE + bob, p.z);
    camera.rotation.set(P.pitch, P.yaw, roll, "YXZ");
    if (Math.abs(camera.fov - P.currentFov) > 0.05) {
      camera.fov = P.currentFov;
      camera.updateProjectionMatrix();
    }
  }

  P.overlaps = overlaps;
  P.update = update;
  P.applyCamera = applyCamera;
  P.respawn = respawn;
  P.placeAt = placeAt;
  P.damage = damage;
  P.eye = eye;
  P.events = events;
  P.MAX_AIR = MAX_AIR;
  P.resetState = function () {
    P.flying = false;
    P.mining = null;
    P.target = null;
    P.alive = true;
    P.health = 20;
    P.air = MAX_AIR;
    fallTop = null;
    sinceHurt = 10;
    events.length = 0;
  };

  QY.Player = P;
})(window.QY = window.QY || {});
