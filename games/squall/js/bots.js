// Squall: bot AI. Perception, looting, storm rotation, combat with skill-based aim. By The_headphones
(function (SQ) {
  const { U } = SQ;
  const DEG = Math.PI / 180;
  const RANGE_PREF = { shotgun: 6, smg: 14, pistol: 18, ar: 28, sniper: 60, hatchet: 1.5 };
  const TYPE_VALUE = { ar: 30, shotgun: 28, smg: 26, sniper: 22, pistol: 14 };
  const eye = new THREE.Vector3();
  const aimDir = new THREE.Vector3();

  const bots = [];

  function spawn(count, skillMix) {
    bots.length = 0;
    const names = SQ.BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const spots = [];
    for (let i = 0; i < count; i++) {
      let p;
      for (let tries = 0; tries < 20; tries++) {
        p = SQ.World.randomLandPoint(0, 0, 150);
        if (spots.every((s) => Math.hypot(s.x - p.x, s.z - p.z) > 22)) break;
      }
      spots.push(p);
      const skillId = U.weightedPick(SQ.SKILL_MIX[skillMix].weights);
      const bot = new SQ.Character({ name: names[i % names.length] });
      bot.skillId = skillId;
      bot.skill = SQ.BOT_SKILLS[skillId];
      bot.fireIntervalMul = 1 / bot.skill.fireMul;
      bot.pos.set(p.x, SQ.Terrain.height(p.x, p.z) + 0.1, p.z);
      bot.yaw = Math.random() * Math.PI * 2;
      bot.state = "ground";
      if (Math.random() < 0.4) {
        bot.inventory.add(SQ.Items.weapon("pistol", 0));
        bot.inventory.ammo.light = 30;
      }
      bot.inventory.mats = bot.skill.builds ? U.randInt(20, 60) : U.randInt(0, 20);
      bot.brain = {
        mode: "roam", target: null, lastSeen: -99, lastKnown: null, reaction: 0,
        goal: null, goalPickup: null, goalChest: null, think: Math.random() * 0.3,
        strafe: Math.random() < 0.5 ? -1 : 1, strafeT: 1, stuckT: 0, avoidT: 0, avoidAngle: 0,
        aimYaw: bot.yaw, aimPitch: 0, errYaw: 0, errPitch: 0, errT: 0,
        heard: null, burst: 0, burstPause: 0, buildT: 0, healCooldown: 0,
        // Personality makes bots of the same skill behave differently.
        caution: Math.random(), roamBias: SQ.U.pick(SQ.POIS),
      };
      bot.refreshHeld();
      bots.push(bot);
    }
    return bots;
  }

  function weaponScore(item) {
    return item.rarity * 10 + TYPE_VALUE[item.type];
  }

  function chooseWeapon(bot, dist) {
    const order = dist < 10 ? ["shotgun", "smg", "ar", "pistol", "sniper"]
      : dist < 32 ? ["smg", "ar", "shotgun", "pistol", "sniper"]
      : dist < 80 ? ["ar", "sniper", "smg", "pistol", "shotgun"]
      : ["sniper", "ar", "pistol", "smg", "shotgun"];
    const inv = bot.inventory;
    let bestSlot = -1;
    let bestRank = Infinity;
    inv.slots.forEach((item, i) => {
      if (!item || item.kind !== "weapon") return;
      const st = SQ.Weapons.stats(item);
      if (item.mag <= 0 && inv.ammo[st.ammo] <= 0) return;
      const rank = order.indexOf(item.type) * 10 - item.rarity;
      if (rank < bestRank) {
        bestRank = rank;
        bestSlot = i;
      }
    });
    if (bestSlot >= 0 && bestSlot !== inv.selected) {
      inv.selected = bestSlot;
      bot.refreshHeld();
    } else if (bestSlot < 0 && inv.current() && inv.current().kind === "weapon") {
      const empty = inv.firstEmpty();
      if (empty >= 0) {
        inv.selected = empty;
        bot.refreshHeld();
      }
    }
    return bestSlot >= 0;
  }

  function isArmed(bot) {
    return bot.inventory.weapons().some(({ item }) => item.mag > 0 || bot.inventory.ammo[SQ.Weapons.stats(item).ammo] > 0);
  }

  function wantsLoot(bot) {
    const weapons = bot.inventory.weapons();
    if (!isArmed(bot)) return true;
    if (weapons.length < 2) return true;
    return bot.inventory.findConsumable("shield") < 0 && Math.random() < 0.5;
  }

  function isUpgrade(bot, item) {
    const inv = bot.inventory;
    if (item.kind === "consumable") return inv.slots.filter(Boolean).length < 5;
    if (item.kind !== "weapon") return true;
    const weapons = inv.weapons();
    if (weapons.some(({ item: w }) => w.type === item.type && w.rarity >= item.rarity)) return false;
    if (inv.firstEmpty() >= 0 && weapons.length < 3) return true;
    const worst = weapons.reduce((a, b) => (weaponScore(a.item) < weaponScore(b.item) ? a : b), weapons[0]);
    return worst && weaponScore(item) > weaponScore(worst.item) + 4;
  }

  function safeGoal() {
    const s = SQ.Storm.state;
    const zone = s.mode === "wait" ? s.next : { x: s.next.x, z: s.next.z, r: Math.min(s.current.r, s.next.r + 10) };
    return zone;
  }

  function pickRoamGoal(bot) {
    const zone = safeGoal();
    const b = bot.brain;
    let cx = zone.x;
    let cz = zone.z;
    if (Math.random() < 0.5 && Math.hypot(b.roamBias.x - zone.x, b.roamBias.z - zone.z) < zone.r * 0.8) {
      cx = b.roamBias.x;
      cz = b.roamBias.z;
    }
    const p = SQ.World.randomLandPoint(cx, cz, Math.max(10, Math.min(60, zone.r * 0.7)));
    b.goal = { x: p.x, z: p.z };
  }

  function perceive(bot, now) {
    const b = bot.brain;
    const skill = bot.skill;
    bot.chestEye(eye);
    let best = null;
    let bestD = Infinity;
    const candidates = [];
    for (const other of SQ.Game.characters) {
      if (other === bot || !other.alive || other.state !== "ground") continue;
      let range = skill.detect;
      if (other.crouching) range *= 0.7;
      const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
      if (d > range) continue;
      // Rough field of view, unless they're very close.
      const ang = Math.abs(U.wrapAngle(Math.atan2(-(other.pos.x - bot.pos.x), -(other.pos.z - bot.pos.z)) - bot.yaw));
      if (ang > 120 * DEG && d > 12) continue;
      candidates.push({ other, d });
    }
    candidates.sort((a, c) => a.d - c.d);
    for (const { other, d } of candidates.slice(0, 3)) {
      if (!SQ.Physics.lineBlocked(eye.x, eye.y, eye.z, other.pos.x, other.chestY(), other.pos.z)) {
        best = other;
        bestD = d;
        break;
      }
    }
    // Being shot reveals the attacker's position even without line of sight.
    if (!best && bot.lastAttacker && bot.lastAttacker.alive && now - bot.lastHurtAt < 2.5) {
      b.lastKnown = { x: bot.lastAttacker.pos.x, z: bot.lastAttacker.pos.z };
      b.lastSeen = now;
      if (!b.target) b.target = bot.lastAttacker;
    }
    if (best) {
      if (b.target !== best) b.reaction = skill.reaction * U.rand(0.8, 1.3);
      b.target = best;
      b.targetDist = bestD;
      b.lastSeen = now;
      b.visible = true;
      b.lastKnown = { x: best.pos.x, z: best.pos.z };
    } else {
      b.visible = false;
      if (b.target && (!b.target.alive || now - b.lastSeen > 7)) b.target = null;
    }
  }

  function think(bot, now) {
    const b = bot.brain;
    perceive(bot, now);
    const zone = safeGoal();
    const distToZone = Math.hypot(bot.pos.x - zone.x, bot.pos.z - zone.z);
    const s = SQ.Storm.state;
    const urgent = !SQ.Storm.isInside(bot.pos.x, bot.pos.z) || (distToZone > zone.r - 4 && (s.mode === "shrink" || s.timer < distToZone / 6 + 12));

    if (urgent && !(b.visible && b.targetDist < 20)) {
      b.mode = "storm";
      if (!b.goal || Math.hypot(b.goal.x - zone.x, b.goal.z - zone.z) > zone.r * 0.7) {
        const p = SQ.World.randomLandPoint(zone.x, zone.z, Math.max(4, zone.r * 0.5));
        b.goal = { x: p.x, z: p.z };
      }
      return;
    }

    const armed = isArmed(bot);
    if (b.target && b.visible && (armed || b.targetDist < 6)) {
      b.mode = "combat";
      chooseWeapon(bot, b.targetDist);
      return;
    }
    if (b.target && armed && now - b.lastSeen < 6 && bot.skill.aggression > b.caution * 0.6) {
      b.mode = "chase";
      b.goal = b.lastKnown;
      return;
    }
    if (b.heard && now - b.heard.t < 4 && armed && Math.random() < bot.skill.aggression) {
      b.mode = "chase";
      b.goal = { x: b.heard.x, z: b.heard.z };
      b.heard = null;
      return;
    }

    const needsHeal = (bot.health < 70 && bot.inventory.findConsumable("heal") >= 0) || (bot.shield < 50 && bot.inventory.findConsumable("shield") >= 0);
    if (needsHeal && !b.target && b.healCooldown <= 0) {
      b.mode = "heal";
      return;
    }

    if (wantsLoot(bot) || b.mode === "loot") {
      if (findLoot(bot)) {
        b.mode = "loot";
        return;
      }
    }

    if (b.mode !== "roam" || !b.goal || Math.hypot(b.goal.x - bot.pos.x, b.goal.z - bot.pos.z) < 3) {
      b.mode = "roam";
      pickRoamGoal(bot);
    }
  }

  function findLoot(bot) {
    const b = bot.brain;
    if (b.goalPickup && SQ.Loot.pickups.includes(b.goalPickup)) return true;
    if (b.goalChest && !b.goalChest.opened) return true;
    b.goalPickup = null;
    b.goalChest = null;
    let best = null;
    let bestD = 45;
    for (const p of SQ.Loot.pickups) {
      if (!p.resting) continue;
      const d = Math.hypot(p.x - bot.pos.x, p.z - bot.pos.z);
      if (d < bestD && isUpgrade(bot, p.item)) {
        bestD = d;
        best = { p };
      }
    }
    for (const c of SQ.Loot.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - bot.pos.x, c.z - bot.pos.z);
      if (d < bestD * 0.9) {
        bestD = d;
        best = { c };
      }
    }
    if (!best) return false;
    if (best.p) {
      b.goalPickup = best.p;
      b.goal = { x: best.p.x, z: best.p.z };
    } else {
      b.goalChest = best.c;
      b.goal = { x: best.c.x, z: best.c.z };
    }
    return true;
  }

  function tryLootNow(bot) {
    const b = bot.brain;
    if (b.goalPickup && Math.hypot(b.goalPickup.x - bot.pos.x, b.goalPickup.z - bot.pos.z) < 1.8) {
      const p = b.goalPickup;
      b.goalPickup = null;
      if (SQ.Loot.pickups.includes(p) && isUpgrade(bot, p.item)) {
        const inv = bot.inventory;
        if (p.item.kind === "weapon" && inv.firstEmpty() < 0) {
          const weapons = inv.weapons();
          inv.selected = weapons.reduce((a, c) => (weaponScore(a.item) < weaponScore(c.item) ? a : c)).i;
        }
        SQ.Loot.take(bot, p);
      }
      b.goal = null;
    }
    if (b.goalChest && Math.hypot(b.goalChest.x - bot.pos.x, b.goalChest.z - bot.pos.z) < 1.8) {
      SQ.Loot.openChest(b.goalChest, bot);
      b.goalChest = null;
      b.goal = null;
    }
  }

  function steerToward(bot, gx, gz, speed, dt) {
    const b = bot.brain;
    let dx = gx - bot.pos.x;
    let dz = gz - bot.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) {
      bot.vel.x = U.damp(bot.vel.x, 0, 10, dt);
      bot.vel.z = U.damp(bot.vel.z, 0, 10, dt);
      return;
    }
    dx /= len;
    dz /= len;
    if (b.avoidT > 0) {
      const c = Math.cos(b.avoidAngle);
      const s = Math.sin(b.avoidAngle);
      const rx = dx * c - dz * s;
      dz = dx * s + dz * c;
      dx = rx;
    }
    bot.vel.x = U.damp(bot.vel.x, dx * speed, 8, dt);
    bot.vel.z = U.damp(bot.vel.z, dz * speed, 8, dt);
  }

  function handleStuck(bot, dt) {
    const b = bot.brain;
    b.avoidT = Math.max(0, b.avoidT - dt);
    const moving = Math.hypot(bot.vel.x, bot.vel.z);
    if (bot.blocked && moving < 1.2) b.stuckT += dt;
    else b.stuckT = Math.max(0, b.stuckT - dt * 2);
    if (b.stuckT > 0.35 && b.avoidT <= 0) {
      if (bot.onGround) bot.vel.y = SQ.CFG.PLAYER.jump;
      b.avoidAngle = (Math.random() < 0.5 ? -1 : 1) * U.rand(60, 110) * DEG;
      b.avoidT = U.rand(0.6, 1.2);
    }
    if (b.stuckT > 3) {
      b.stuckT = 0;
      b.goal = null;
      b.goalPickup = null;
      b.goalChest = null;
    }
  }

  function aimAndShoot(bot, dt, now) {
    const b = bot.brain;
    const t = b.target;
    const skill = bot.skill;
    const tx = t.pos.x + t.vel.x * 0.12;
    const tz = t.pos.z + t.vel.z * 0.12;
    const ty = t.chestY() + (skill.aimError < 2 && Math.random() < 0.002 ? 0.3 : 0);
    bot.chestEye(eye);
    const dx = tx - eye.x;
    const dy = ty - eye.y;
    const dz = tz - eye.z;
    const flat = Math.hypot(dx, dz);
    b.errT -= dt;
    if (b.errT <= 0) {
      const moveFactor = 1 + Math.min(1.5, Math.hypot(t.vel.x, t.vel.z) / 5);
      b.errYaw = (Math.random() * 2 - 1) * skill.aimError * DEG * moveFactor;
      b.errPitch = (Math.random() * 2 - 1) * skill.aimError * 0.6 * DEG * moveFactor;
      b.errT = U.rand(0.3, 0.6);
    }
    const wantYaw = Math.atan2(-dx, -dz) + b.errYaw;
    const wantPitch = Math.atan2(dy, flat) + b.errPitch;
    const turn = (skill.aimError > 5 ? 4 : skill.aimError > 3 ? 6 : 9) * dt;
    b.aimYaw += U.clamp(U.wrapAngle(wantYaw - b.aimYaw), -turn, turn);
    b.aimPitch += U.clamp(wantPitch - b.aimPitch, -turn, turn);
    bot.yaw = b.aimYaw;
    bot.aimPitch = b.aimPitch;

    b.reaction -= dt;
    if (b.reaction > 0 || !b.visible || bot.using) return;
    const item = bot.held();
    if (!item || item.kind !== "weapon") {
      if (b.targetDist < 2.6) {
        aimDir.set(-Math.sin(b.aimYaw) * Math.cos(b.aimPitch), Math.sin(b.aimPitch), -Math.cos(b.aimYaw) * Math.cos(b.aimPitch));
        SQ.Weapons.swing(bot, eye, aimDir);
      }
      return;
    }
    const st = SQ.Weapons.stats(item);
    if (b.targetDist > st.range * 0.92) return;
    if (Math.abs(U.wrapAngle(wantYaw - b.aimYaw)) > 8 * DEG) return;
    if (b.burstPause > 0) {
      b.burstPause -= dt;
      return;
    }
    aimDir.set(-Math.sin(b.aimYaw) * Math.cos(b.aimPitch), Math.sin(b.aimPitch), -Math.cos(b.aimYaw) * Math.cos(b.aimPitch));
    const ctx = { ads: b.targetDist > 22, moving: Math.hypot(bot.vel.x, bot.vel.z) > 1, sprinting: false, airborne: !bot.onGround, crouching: bot.crouching };
    if (SQ.Weapons.fire(bot, eye, aimDir, ctx)) {
      b.burst += 1;
      const burstLen = st.auto ? U.randInt(3, 8) : 1;
      if (b.burst >= burstLen) {
        b.burst = 0;
        b.burstPause = st.auto ? U.rand(0.25, 0.7) : U.rand(0.05, 0.35) / skill.fireMul;
      }
    }
  }

  function combatMove(bot, dt, now) {
    const b = bot.brain;
    const t = b.target;
    const item = bot.held();
    const pref = RANGE_PREF[item && item.kind === "weapon" ? item.type : "hatchet"] * (0.8 + b.caution * 0.5);
    const dx = t.pos.x - bot.pos.x;
    const dz = t.pos.z - bot.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let fx = dx / d;
    let fz = dz / d;
    let forward = 0;
    if (d > pref + 4) forward = 1;
    else if (d < pref - 4) forward = -0.8;
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafe = Math.random() < 0.5 ? -1 : 1;
      b.strafeT = U.rand(0.7, 1.6);
    }
    const strafe = Math.random() < bot.skill.strafe ? b.strafe : 0;
    const mx = fx * forward + -fz * strafe * 0.8;
    const mz = fz * forward + fx * strafe * 0.8;
    const speed = 4.8;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      bot.vel.x = U.damp(bot.vel.x, (mx / len) * speed, 8, dt);
      bot.vel.z = U.damp(bot.vel.z, (mz / len) * speed, 8, dt);
    } else {
      bot.vel.x = U.damp(bot.vel.x, 0, 8, dt);
      bot.vel.z = U.damp(bot.vel.z, 0, 8, dt);
    }
    bot.crouching = bot.skill.strafe < 0.5 && d > 25 && b.caution > 0.5;
    if (bot.onGround && Math.random() < bot.skill.jump * dt) bot.vel.y = SQ.CFG.PLAYER.jump;

    // Veterans and aces throw up a wall when they're being hit.
    b.buildT -= dt;
    if (bot.skill.builds && now - bot.lastHurtAt < 0.4 && b.buildT <= 0 && bot.inventory.mats >= SQ.CFG.BUILD.cost && d > 6) {
      if (SQ.Building.tryBuild(bot, "wall", Math.atan2(-dx, -dz))) b.buildT = U.rand(2, 4);
    }
  }

  function heal(bot, dt) {
    const b = bot.brain;
    bot.vel.x = U.damp(bot.vel.x, 0, 10, dt);
    bot.vel.z = U.damp(bot.vel.z, 0, 10, dt);
    if (bot.using) return;
    let slot = -1;
    if (bot.shield < 50) slot = bot.inventory.findConsumable("shield");
    if (slot < 0 && bot.health < 70) slot = bot.inventory.findConsumable("heal");
    if (slot < 0) {
      b.mode = "roam";
      return;
    }
    bot.inventory.selected = slot;
    bot.refreshHeld();
    SQ.Game.startUse(bot);
    b.healCooldown = 1;
  }

  function updateBot(bot, dt, now) {
    if (!bot.alive) {
      bot.animate(dt);
      return;
    }
    const b = bot.brain;
    b.think -= dt;
    b.healCooldown = Math.max(0, b.healCooldown - dt);
    if (b.think <= 0) {
      b.think = U.rand(0.18, 0.3);
      think(bot, now);
    }

    if (b.mode === "combat" && b.target && b.target.alive) {
      combatMove(bot, dt, now);
      aimAndShoot(bot, dt, now);
    } else {
      if (b.mode === "heal") heal(bot, dt);
      else if (b.goal) {
        const far = Math.hypot(b.goal.x - bot.pos.x, b.goal.z - bot.pos.z) > 18;
        const speed = b.mode === "storm" || far ? 7.4 : 4.6;
        steerToward(bot, b.goal.x, b.goal.z, bot.using ? 1.5 : speed, dt);
        if (Math.hypot(bot.vel.x, bot.vel.z) > 0.5) {
          b.aimYaw = U.damp(b.aimYaw, b.aimYaw + U.wrapAngle(Math.atan2(-bot.vel.x, -bot.vel.z) - b.aimYaw), 8, dt);
          bot.yaw = b.aimYaw;
          b.aimPitch = U.damp(b.aimPitch, 0, 5, dt);
          bot.aimPitch = b.aimPitch;
        }
        if (b.mode === "loot") tryLootNow(bot);
      } else {
        bot.vel.x = U.damp(bot.vel.x, 0, 8, dt);
        bot.vel.z = U.damp(bot.vel.z, 0, 8, dt);
      }
      bot.crouching = false;
      const item = bot.held();
      if (item && item.kind === "weapon" && item.mag < SQ.Weapons.stats(item).mag * 0.5) SQ.Weapons.startReload(bot);
      if (b.mode !== "combat" && b.mode !== "heal" && item && item.kind === "weapon" && item.mag === 0) chooseWeapon(bot, 30);
    }
    handleStuck(bot, dt);
    SQ.Loot.autoCollect(bot);
  }

  function hear(x, z, radius, source) {
    for (const bot of bots) {
      if (!bot.alive || bot === source) continue;
      if (Math.hypot(bot.pos.x - x, bot.pos.z - z) < radius) bot.brain.heard = { x, z, t: SQ.Game.time };
    }
  }

  SQ.Bots = { spawn, updateBot, hear, list: bots };
})(window.SQ = window.SQ || {});
