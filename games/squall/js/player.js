// Squall: the local player. Input to movement, combat, building, interaction and the drop. By The_headphones
(function (SQ) {
  const { CFG, U } = SQ;
  const P = CFG.PLAYER;
  const I = SQ.Input;
  const aimDir = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const shotDir = new THREE.Vector3();
  const forward2 = { x: 0, z: -1 };

  const state = {
    ch: null,
    buildMode: false,
    piece: "wall",
    buildTarget: null,
    buildError: null,
    ads: false,
    sprinting: false,
    prompt: null,
    interact: null,
    landedAt: 0,
  };

  function create() {
    state.ch = new SQ.Character({
      isPlayer: true,
      name: "You",
      outfit: { shirt: "#2f8f83", pants: "#253244", skin: "#e8bf98", hair: "#3a2a20", pack: "#e0a83a" },
    });
    return state.ch;
  }

  function beginDrop() {
    const ch = state.ch;
    const a = Math.random() * Math.PI * 2;
    ch.pos.set(Math.cos(a) * 30, CFG.DROP_HEIGHT, Math.sin(a) * 30);
    ch.vel.set(0, 0, 0);
    ch.state = "skydive";
    ch.onGround = false;
    state.buildMode = false;
    state.ads = false;
    SQ.Building.showGhost(null);
    SQ.CameraRig.reset(Math.atan2(ch.pos.x, ch.pos.z));
  }

  function selectSlot(index) {
    const ch = state.ch;
    if (ch.inventory.selected === index && !state.buildMode) return;
    ch.inventory.selected = index;
    ch.using = null;
    state.buildMode = false;
    SQ.Building.showGhost(null);
    ch.refreshHeld();
    SQ.Audio.ui(true);
  }

  function setPiece(piece) {
    state.piece = piece;
    state.buildMode = true;
    state.ads = false;
    state.ch.using = null;
    SQ.Audio.ui(true);
  }

  function handleSlots() {
    for (let i = 0; i < 5; i++) {
      if (I.wasPressed(`slot${i + 1}`)) selectSlot(i);
    }
    const wheel = I.consumeWheel();
    if (wheel !== 0 && !state.buildMode) selectSlot((state.ch.inventory.selected + wheel + 5) % 5);
    if (I.wasPressed("build")) {
      if (state.buildMode) {
        state.buildMode = false;
        SQ.Building.showGhost(null);
      } else setPiece(state.piece);
    }
    if (I.wasPressed("buildWall")) setPiece("wall");
    if (I.wasPressed("buildFloor")) setPiece("floor");
    if (I.wasPressed("buildRoof")) setPiece("roof");
    if (state.buildMode && I.wasPressed("buildRamp")) setPiece("ramp");
  }

  function moveOnGround(dt) {
    const ch = state.ch;
    const yaw = SQ.CameraRig.yaw;
    const f = (I.isDown("forward") ? 1 : 0) - (I.isDown("back") ? 1 : 0);
    const s = (I.isDown("right") ? 1 : 0) - (I.isDown("left") ? 1 : 0);
    const crouchKey = !state.buildMode && I.isDown("crouch");
    ch.crouching = crouchKey && ch.onGround;
    state.sprinting = I.isDown("sprint") && f > 0 && !state.ads && !ch.crouching && !ch.using;
    let speed = ch.crouching ? P.crouch : state.sprinting ? P.sprint : P.walk;
    if (state.ads) speed *= 0.65;
    if (ch.using) speed *= 0.5;
    if (ch.inWater) speed *= 0.6;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let mx = fx * f + rx * s;
    let mz = fz * f + rz * s;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx = (mx / len) * speed;
      mz = (mz / len) * speed;
    }
    const accel = ch.onGround ? 14 : 2.5;
    ch.vel.x = U.damp(ch.vel.x, mx, accel, dt);
    ch.vel.z = U.damp(ch.vel.z, mz, accel, dt);
    if (I.wasPressed("jump") && ch.onGround) {
      ch.vel.y = P.jump;
      ch.onGround = false;
      ch.crouching = false;
    }
    ch.yaw = yaw;
    ch.aimPitch = SQ.CameraRig.aimPitch();
  }

  function moveInAir(dt) {
    const ch = state.ch;
    const yaw = SQ.CameraRig.yaw;
    const f = (I.isDown("forward") ? 1 : 0) - (I.isDown("back") ? 1 : 0);
    const s = (I.isDown("right") ? 1 : 0) - (I.isDown("left") ? 1 : 0);
    const gliding = ch.state === "glide";
    const speed = gliding ? 12 : 20;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    ch.vel.x = U.damp(ch.vel.x, (fx * Math.max(0, f) + Math.cos(yaw) * s) * speed + fx * (gliding ? 3 : 0), 2.5, dt);
    ch.vel.z = U.damp(ch.vel.z, (fz * Math.max(0, f) - Math.sin(yaw) * s) * speed + fz * (gliding ? 3 : 0), 2.5, dt);
    const fall = gliding ? -5.5 : I.isDown("forward") ? -32 : -24;
    ch.vel.y = U.damp(ch.vel.y, fall, 3, dt);
    ch.yaw = yaw;
    const ground = SQ.Physics.groundHeight(ch.pos.x, ch.pos.z, ch.pos.y, ch.radius);
    const above = ch.pos.y - ground;
    if (ch.state === "skydive" && (above < 35 || (I.wasPressed("jump") && above < 90))) {
      ch.state = "glide";
      SQ.Audio.build(null, true);
      SQ.HUD.announce("Glider open", "zone");
    }
    SQ.Audio.setWind(gliding ? 0.5 : 1);
  }

  function shoot(dt) {
    const ch = state.ch;
    const item = ch.held();
    SQ.CameraRig.aimDirection(aimDir);
    const cam = SQ.CameraRig.position;
    // Start the aim ray level with the player so walls behind the shoulder never block it.
    const along = (ch.pos.x - cam.x) * aimDir.x + (ch.pos.y + 1.4 - cam.y) * aimDir.y + (ch.pos.z - cam.z) * aimDir.z;
    const sx = cam.x + aimDir.x * Math.max(0, along);
    const sy = cam.y + aimDir.y * Math.max(0, along);
    const sz = cam.z + aimDir.z * Math.max(0, along);
    const aimHit = SQ.Physics.raycast(sx, sy, sz, aimDir.x, aimDir.y, aimDir.z, 400, { characters: true, ignore: ch });
    const dist = aimHit ? aimHit.dist : 400;
    const tx = sx + aimDir.x * dist;
    const ty = sy + aimDir.y * dist;
    const tz = sz + aimDir.z * dist;
    origin.set(ch.pos.x, ch.chestY() + 0.2, ch.pos.z);
    shotDir.set(tx - origin.x, ty - origin.y, tz - origin.z).normalize();

    if (!item) {
      if (I.mouse(0) || I.mouseClicked(0)) SQ.Weapons.swing(ch, origin, shotDir);
      return;
    }
    if (item.kind === "consumable") {
      if (I.mouseClicked(0) && !ch.using) SQ.Game.startUse(ch);
      return;
    }
    const st = SQ.Weapons.stats(item);
    // A tap shorter than one frame still fires a single shot on automatic weapons.
    const trigger = st.auto ? I.mouse(0) || I.mouseClicked(0) : I.mouseClicked(0);
    if (!trigger) return;
    const ctx = {
      ads: state.ads, moving: Math.hypot(ch.vel.x, ch.vel.z) > 1, sprinting: state.sprinting,
      airborne: !ch.onGround, crouching: ch.crouching,
    };
    if (SQ.Weapons.fire(ch, origin, shotDir, ctx)) {
      state.sprinting = false;
      SQ.CameraRig.addRecoil(st.recoil * (state.ads ? 0.6 : 1), st.recoilYaw);
      SQ.CameraRig.shake(item.type === "sniper" ? 0.35 : item.type === "shotgun" ? 0.3 : 0.06);
      SQ.HUD.fired();
    }
  }

  function handleBuild() {
    const ch = state.ch;
    const t = SQ.Building.target(ch, state.piece, SQ.CameraRig.yaw, SQ.CameraRig.pitch);
    const error = SQ.Building.validate(ch, t);
    state.buildTarget = t;
    state.buildError = error;
    SQ.Building.showGhost(t, !error);
    if ((I.mouse(0) || I.mouseClicked(0)) && ch.buildCooldown <= 0) {
      if (!error) SQ.Building.place(ch, t);
      else if (I.mouseClicked(0)) {
        SQ.Audio.empty();
        SQ.HUD.toast(error, "warn");
      }
    }
  }

  function handleInteract() {
    const ch = state.ch;
    forward2.x = -Math.sin(SQ.CameraRig.yaw);
    forward2.z = -Math.cos(SQ.CameraRig.yaw);
    const target = SQ.Loot.nearestInteractable(ch.pos, forward2);
    state.interact = target;
    if (!target) {
      state.prompt = null;
      return;
    }
    if (target.type === "chest") {
      state.prompt = { verb: "Open", label: "Chest", color: "#e2b546" };
    } else {
      const item = target.target.item;
      const full = ch.inventory.firstEmpty() < 0 && !(item.kind === "consumable" && ch.inventory.slots.some((s) => s && s.type === item.type && s.count < SQ.CONSUMABLES[item.type].stack));
      state.prompt = {
        verb: full ? "Swap for" : "Pick up",
        label: `${SQ.Items.name(item)}${item.kind === "consumable" ? ` ×${item.count}` : ""}`,
        rarity: SQ.RARITY[item.rarity].name,
        color: SQ.Items.color(item),
      };
    }
    if (I.wasPressed("interact")) {
      if (target.type === "chest") SQ.Loot.openChest(target.target, ch);
      else if (SQ.Loot.take(ch, target.target)) SQ.HUD.toast(`${SQ.Items.name(target.target.item)}`, "loot");
    }
  }

  function footsteps(dt) {
    const ch = state.ch;
    const speed = Math.hypot(ch.vel.x, ch.vel.z);
    if (!ch.onGround || speed < 1) return;
    ch.stepDist += speed * dt;
    const stride = state.sprinting ? 2.7 : ch.crouching ? 1.6 : 2.1;
    if (ch.stepDist > stride) {
      ch.stepDist = 0;
      if (!ch.crouching) SQ.Audio.footstep(ch.surface, ch.pos, true);
    }
  }

  function update(dt) {
    const ch = state.ch;
    if (!ch.alive) {
      ch.animate(dt);
      return;
    }
    const mouse = I.consumeMouse();
    SQ.CameraRig.look(mouse.dx, mouse.dy, state.ads);
    ch.buildCooldown = Math.max(0, ch.buildCooldown - dt);

    if (ch.state === "skydive" || ch.state === "glide") {
      moveInAir(dt);
      SQ.Physics.moveCharacter(ch, dt, 0);
      if (ch.onGround) {
        ch.state = "ground";
        ch.vel.set(0, 0, 0);
        state.landedAt = SQ.Game.time;
        SQ.Audio.land(ch.pos, true);
        SQ.Audio.setWind(0);
        SQ.HUD.announce("Landed. Find a weapon", "zone");
      }
      ch.animate(dt);
      return;
    }

    handleSlots();
    if (I.wasPressed("reload") && !state.buildMode) SQ.Weapons.startReload(ch);
    const item = ch.held();
    state.ads = !state.buildMode && I.mouse(2) && item && item.kind === "weapon" && !ch.using;
    moveOnGround(dt);
    const landed = SQ.Physics.moveCharacter(ch, dt);
    if (landed > 17) SQ.Game.damage(ch, (landed - 17) * 6, null, { fall: true });
    if (landed > 6) SQ.Audio.land(ch.pos, true);

    if (state.buildMode) {
      handleBuild();
    } else {
      SQ.Building.showGhost(null);
      state.buildTarget = null;
      shoot(dt);
    }
    handleInteract();
    SQ.Loot.autoCollect(ch);
    footsteps(dt);
    ch.refreshHeld();
    ch.animate(dt);
  }

  SQ.Player = { create, beginDrop, update, selectSlot, state };
})(window.SQ = window.SQ || {});
