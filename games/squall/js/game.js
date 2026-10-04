// Squall: match lifecycle, main loop, damage and eliminations. By The_headphones
(function (SQ) {
  const { CFG, U } = SQ;
  const SKY = new THREE.Color("#a7d0de");
  const STORM_FOG = new THREE.Color("#3f8f80");

  const G = {
    scene: null,
    camera: null,
    renderer: null,
    sun: null,
    characters: [],
    bots: [],
    player: null,
    time: 0,
    state: "loading",
    matchTime: 0,
    timeScale: 1,
    builtCount: 0,
    stormTick: new Map(),
    pending: [],
  };

  function inMatch() {
    return G.state === "match";
  }

  function aliveCount() {
    let n = 0;
    for (const ch of G.characters) if (ch.alive) n++;
    return n;
  }

  function makeSky(scene) {
    const geo = new THREE.SphereGeometry(900, 24, 12);
    const colors = [];
    const top = new THREE.Color("#5f9fc4");
    const horizon = new THREE.Color("#cfe6ea");
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = U.clamp(pos.getY(i) / 900, 0, 1);
      const c = horizon.clone().lerp(top, Math.pow(t, 0.6));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    scene.add(sky);
    G.sky = sky;
  }

  function createRenderer(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    G.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = SKY.clone();
    scene.fog = new THREE.Fog(SKY.clone(), 70, 330);
    G.scene = scene;
    makeSky(scene);

    G.camera = new THREE.PerspectiveCamera(SQ.Settings.values.fov, 1, 0.1, 1200);
    scene.add(new THREE.HemisphereLight(0xdff0f4, 0x6b7a5a, 0.68));
    const sun = new THREE.DirectionalLight(0xfff1d8, 0.85);
    sun.position.set(60, 120, 40);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 320 });
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(sun.target);
    G.sun = sun;
    applyQuality();

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      G.camera.aspect = w / h;
      G.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    resize();
  }

  function applyQuality() {
    const q = SQ.Settings.values.quality;
    const r = G.renderer;
    const dpr = window.devicePixelRatio || 1;
    r.setPixelRatio(q === "high" ? Math.min(dpr, 1.5) : q === "medium" ? 1 : 0.75);
    const shadows = q !== "low";
    const size = q === "high" ? 2048 : 1024;
    if (G.sun.shadow.mapSize.x !== size) {
      G.sun.shadow.mapSize.set(size, size);
      if (G.sun.shadow.map) {
        G.sun.shadow.map.dispose();
        G.sun.shadow.map = null;
      }
    }
    if (r.shadowMap.enabled !== shadows) {
      r.shadowMap.enabled = shadows;
      G.scene.traverse((o) => {
        if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; });
      });
    }
  }

  // ---- Damage and eliminations ----
  function damage(target, amount, source, info = {}) {
    if (!target.alive || G.state === "menu" || amount <= 0) return;
    if (target.state !== "ground" && !info.storm) return;
    const hadShield = target.shield > 0;
    let toHealth = amount;
    let toShield = 0;
    if (!info.storm && !info.fall) {
      toShield = Math.min(target.shield, amount);
      target.shield -= toShield;
      toHealth = amount - toShield;
    }
    const dealt = toShield + Math.min(target.health, toHealth);
    target.health = Math.max(0, target.health - toHealth);
    target.lastHurtAt = G.time;
    target.flash();
    if (source && source !== target) {
      target.lastAttacker = source;
      source.damageDealt += dealt;
    }

    if (info.x !== undefined) SQ.Effects.hitCharacter(info.x, info.y, info.z, toShield > 0);
    if (source && source.isPlayer && target !== source) {
      const kill = target.health <= 0;
      SQ.HUD.hitmarker(info.headshot, kill);
      SQ.Audio.hitmarker(info.headshot);
      const y = info.y !== undefined ? info.y : target.chestY();
      SQ.Effects.damageNumber(info.x ?? target.pos.x, y + 0.4, info.z ?? target.pos.z, dealt, info.headshot ? "head" : toShield > 0 ? "shield" : "health");
    }
    if (target.isPlayer) {
      if (info.storm) SQ.Audio.stormHurt();
      else SQ.Audio.hurt(toShield > 0);
      if (hadShield && target.shield <= 0) SQ.Audio.shieldBreak();
      SQ.HUD.damageFrom(source ? source.pos.x : undefined, source ? source.pos.z : undefined);
      SQ.CameraRig.shake(info.storm ? 0.1 : 0.28);
    }
    if (target.health <= 0) eliminate(target, source, info.storm ? "storm" : info.fall ? "fall" : info.weapon || "hatchet");
  }

  function eliminate(victim, killer, weapon) {
    victim.alive = false;
    victim.health = 0;
    victim.using = null;
    victim.vel.set(0, 0, 0);
    victim.deathT = 0;
    victim.place = aliveCount() + 1;
    const items = victim.inventory.dumpAll();
    SQ.Loot.dropAll(items, victim.pos.x, victim.pos.y, victim.pos.z);
    SQ.Effects.burst(victim.pos.x, victim.pos.y + 1, victim.pos.z, "#eef4f0", 18);
    if (killer && killer !== victim) killer.kills += 1;
    SQ.HUD.killfeed(killer, victim, weapon);
    if (killer && killer.isPlayer && victim !== killer) {
      SQ.Audio.elimination();
      SQ.HUD.announce(`Eliminated ${victim.name}`, "elim");
    }
    if (victim.isPlayer) playerDown(killer, weapon);
    checkEnd();
  }

  function playerDown(killer, weapon) {
    G.state = "ended";
    SQ.Audio.defeat();
    const by = killer && killer !== G.player ? killer.name : weapon === "storm" ? "the storm" : weapon === "fall" ? "a long fall" : "an explosion";
    SQ.HUD.spectate(`Eliminated by ${by} · #${G.player.place}`);
    schedule(2.4, () => {
      SQ.Menus.showResult({
        victory: false,
        place: G.player.place,
        line: `Eliminated by ${by} after ${U.formatTime(G.matchTime)} on Kestrel Isle.`,
        elims: G.player.kills,
        damage: G.player.damageDealt,
        time: G.matchTime,
        built: G.builtCount,
      });
      SQ.HUD.setVisible(false);
    });
  }

  function checkEnd() {
    if (G.state !== "match" || !G.player.alive || aliveCount() > 1) return;
    G.state = "ended";
    G.player.place = 1;
    SQ.Audio.victory();
    SQ.HUD.announce("Last one standing", "zone");
    schedule(2.2, () => {
      SQ.Menus.showResult({
        victory: true,
        place: 1,
        line: `You outlasted ${G.bots.length} bots and the squall in ${U.formatTime(G.matchTime)}.`,
        elims: G.player.kills,
        damage: G.player.damageDealt,
        time: G.matchTime,
        built: G.builtCount,
      });
      SQ.HUD.setVisible(false);
    });
  }

  function schedule(delay, fn) {
    G.pending.push({ at: G.time + delay, fn });
  }

  // ---- Consumables ----
  function startUse(ch) {
    const item = ch.held();
    if (!item || item.kind !== "consumable" || ch.using) return false;
    const def = SQ.CONSUMABLES[item.type];
    const full = def.kind === "heal" ? ch.health >= def.cap : ch.shield >= def.cap;
    if (full) {
      if (ch.isPlayer) SQ.HUD.toast(def.kind === "heal" ? "Health is already full for this item" : "Shield is already full for this item", "warn");
      return false;
    }
    ch.using = { uid: item.uid, slot: ch.inventory.selected, t: 0, total: def.time, label: def.name, kind: def.kind };
    ch.weapon.reloadT = 0;
    if (ch.isPlayer) SQ.Audio.useStart();
    return true;
  }

  function tickUse(ch, dt) {
    const u = ch.using;
    if (!u) return;
    const item = ch.held();
    if (!item || item.uid !== u.uid) {
      ch.using = null;
      return;
    }
    u.t += dt;
    if (u.t < u.total) return;
    const def = SQ.CONSUMABLES[item.type];
    if (def.kind === "heal") ch.health = Math.min(def.cap, Math.max(ch.health, ch.health + def.amount));
    else ch.shield = Math.min(def.cap, Math.max(ch.shield, ch.shield + def.amount));
    ch.inventory.consumeOne(u.slot);
    ch.using = null;
    ch.refreshHeld();
    if (ch.isPlayer) SQ.Audio.useDone(def.kind);
  }

  // ---- World events ----
  function explodeBarrel(barrel, source) {
    if (!barrel.alive) return;
    SQ.World.destroyBarrel(barrel);
    const x = barrel.x;
    const y = barrel.y + 0.6;
    const z = barrel.z;
    SQ.Effects.explosion(x, y, z);
    SQ.Audio.explosion({ x, y, z });
    for (const ch of G.characters) {
      if (!ch.alive) continue;
      const d = Math.hypot(ch.pos.x - x, ch.pos.y + 1 - y, ch.pos.z - z);
      if (d < 6.5) damage(ch, 75 * (1 - d / 6.5) + 10, source, { weapon: "explosion" });
    }
    const pd = Math.hypot(G.player.pos.x - x, G.player.pos.z - z);
    if (pd < 40) SQ.CameraRig.shake(U.clamp(1 - pd / 40, 0, 1) * 0.8);
    SQ.World.barrels.forEach((other) => {
      if (other.alive && Math.hypot(other.x - x, other.z - z) < 4.5) schedule(0.18, () => explodeBarrel(other, source));
    });
    SQ.Physics.query(x - 5, z - 5, x + 5, z + 5, []).forEach((c) => {
      if (c.piece) SQ.Building.damage(c.piece, 90, source);
    });
  }

  function reportNoise(source, x, z, radius) {
    SQ.Bots.hear(x, z, radius, source);
    if (source !== G.player && G.player && Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 110) SQ.HUD.ping(x, z);
  }

  function separate() {
    const list = G.characters;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.state !== "ground") continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || b.state !== "ground") continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / 2;
        a.pos.x -= (dx / d) * push;
        a.pos.z -= (dz / d) * push;
        b.pos.x += (dx / d) * push;
        b.pos.z += (dz / d) * push;
      }
    }
  }

  function stormDamage(dt) {
    const s = SQ.Storm.state;
    for (const ch of G.characters) {
      if (!ch.alive || SQ.Storm.isInside(ch.pos.x, ch.pos.z)) {
        G.stormTick.delete(ch);
        continue;
      }
      const t = (G.stormTick.get(ch) || 0) + dt;
      if (t >= 1) {
        G.stormTick.set(ch, t - 1);
        damage(ch, s.dps, null, { storm: true });
      } else G.stormTick.set(ch, t);
    }
  }

  function botFootsteps(bot, dt) {
    const speed = Math.hypot(bot.vel.x, bot.vel.z);
    if (!bot.onGround || speed < 1 || bot.crouching) return;
    bot.stepDist += speed * dt;
    if (bot.stepDist < 2.3) return;
    bot.stepDist = 0;
    const p = G.player.pos;
    if (Math.abs(bot.pos.x - p.x) < 28 && Math.abs(bot.pos.z - p.z) < 28) SQ.Audio.footstep(bot.surface, bot.pos, false);
  }

  // ---- Match lifecycle ----
  function clearCharacters() {
    G.bots.forEach((b) => G.scene.remove(b.model));
    G.bots = [];
  }

  function startMatch() {
    SQ.Audio.init();
    SQ.Menus.closeAll();
    SQ.HUD.reset();
    SQ.HUD.setVisible(true);
    SQ.Effects.clear();
    SQ.Building.clear();
    SQ.World.resetDynamic();
    SQ.Loot.reset();
    SQ.Storm.reset();
    clearCharacters();

    const p = G.player;
    p.resetForMatch();
    p.inventory.mats = CFG.BUILD.startMats;
    SQ.Player.beginDrop();
    if (!p.model.parent) G.scene.add(p.model);

    G.bots = SQ.Bots.spawn(SQ.Settings.values.bots, SQ.Settings.values.botSkill);
    G.bots.forEach((b) => G.scene.add(b.model));
    G.characters = [p, ...G.bots];
    G.stormTick.clear();
    G.pending = [];
    G.matchTime = 0;
    G.builtCount = 0;
    G.state = "match";
    SQ.Input.reset();
    SQ.Input.requestLock();
    SQ.HUD.announce("Steer the drop with WASD · Space opens the glider", "zone");
  }

  function quitToMenu() {
    G.state = "menu";
    G.pending = [];
    clearCharacters();
    G.characters = [G.player];
    G.scene.remove(G.player.model);
    SQ.Building.clear();
    SQ.HUD.setVisible(false);
    SQ.Audio.setStorm(0);
    SQ.Audio.setWind(0);
    SQ.Menus.openMain();
  }

  // ---- Main loop ----
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dt = raw * G.timeScale;
    G.time += dt;

    if (G.state === "loading") {
      G.renderer.render(G.scene, G.camera);
      return;
    }
    if (G.state === "menu") {
      SQ.CameraRig.orbit(dt, G.time);
      SQ.Storm.update(0, null);
      SQ.Effects.update(dt);
      G.renderer.render(G.scene, G.camera);
      SQ.Input.endFrame();
      return;
    }

    for (let i = G.pending.length - 1; i >= 0; i--) {
      if (G.time >= G.pending[i].at) {
        const job = G.pending[i];
        G.pending.splice(i, 1);
        job.fn();
      }
    }

    if (G.state === "match") G.matchTime += dt;
    const p = G.player;
    const piecesBefore = SQ.Building.count;
    SQ.Player.update(dt);
    if (SQ.Building.count > piecesBefore) G.builtCount += SQ.Building.count - piecesBefore;

    for (const bot of G.bots) {
      SQ.Bots.updateBot(bot, dt, G.time);
      if (!bot.alive) continue;
      bot.buildCooldown = Math.max(0, bot.buildCooldown - dt);
      const landed = SQ.Physics.moveCharacter(bot, dt);
      if (landed > 17) damage(bot, (landed - 17) * 6, null, { fall: true });
      bot.refreshHeld();
      bot.animate(dt);
      botFootsteps(bot, dt);
    }
    separate();
    for (const ch of G.characters) {
      if (!ch.alive) continue;
      SQ.Weapons.update(ch, dt);
      tickUse(ch, dt);
    }
    if (G.state === "match") stormDamage(dt);

    SQ.Building.update(dt);
    SQ.Loot.update(dt, p.pos);
    SQ.Storm.update(dt, SQ.CameraRig.position);
    SQ.Effects.update(dt);

    const ps = SQ.Player.state;
    const item = p.held();
    const scopedWeapon = item && item.kind === "weapon" && SQ.WEAPONS[item.type].scoped;
    SQ.CameraRig.update(dt, p, {
      ads: ps.ads,
      zoom: item && item.kind === "weapon" ? SQ.WEAPONS[item.type].zoom : 1,
      scoped: scopedWeapon,
      mode: !p.alive ? "dead" : p.state === "ground" ? "ground" : p.state,
    });

    const inside = SQ.Storm.isInside(SQ.CameraRig.position.x, SQ.CameraRig.position.z);
    const targetFog = inside ? SKY : STORM_FOG;
    G.scene.fog.color.lerp(targetFog, 1 - Math.exp(-3 * dt));
    G.scene.background.copy(G.scene.fog.color);
    G.scene.fog.far = U.damp(G.scene.fog.far, inside ? 330 : 90, 3, dt);
    G.sky.visible = inside;

    G.sun.position.set(p.pos.x + 60, p.pos.y + 120, p.pos.z + 40);
    G.sun.target.position.set(p.pos.x, p.pos.y, p.pos.z);

    SQ.HUD.update(dt);
    SQ.Menus.update(dt);
    G.renderer.render(G.scene, G.camera);
    SQ.Input.endFrame();
  }

  function start() {
    requestAnimationFrame(frame);
  }

  SQ.Settings.onChange((key, value) => {
    if (key === "volume") SQ.Audio.setVolume(value);
    if (key === "quality" && G.renderer) applyQuality();
    if (key === "fov" && G.camera) G.camera.updateProjectionMatrix();
  });

  Object.assign(G, {
    inMatch, aliveCount, createRenderer, damage, eliminate, startUse, tickUse, explodeBarrel, reportNoise,
    startMatch, quitToMenu, start, applyQuality, schedule,
  });
  SQ.Game = G;
})(window.SQ = window.SQ || {});
