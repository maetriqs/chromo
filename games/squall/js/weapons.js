// Squall: firing, spread, damage falloff, reloads and the hatchet. Shared by player and bots. By The_headphones
(function (SQ) {
  const { U } = SQ;
  const DEG = Math.PI / 180;
  const muzzle = new THREE.Vector3();
  const basisRight = new THREE.Vector3();
  const basisUp = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const shotDir = new THREE.Vector3();
  const statCache = new Map();

  function stats(item) {
    const key = `${item.type}:${item.rarity}`;
    if (statCache.has(key)) return statCache.get(key);
    const def = SQ.WEAPONS[item.type];
    const r = SQ.RARITY[item.rarity];
    const s = {
      ...def,
      damage: def.damage * r.damage,
      reload: def.reload * r.reload,
      spreadHip: def.spreadHip * r.spread,
      spreadAds: def.spreadAds * r.spread,
    };
    statCache.set(key, s);
    return s;
  }

  // ctx: { ads, moving, sprinting, airborne, crouching }
  function spreadFor(ch, item, ctx) {
    const st = stats(item);
    if (st.scoped && ctx.ads && !ctx.moving && !ctx.airborne) return 0;
    let deg = ctx.ads ? st.spreadAds : st.spreadHip;
    if (ctx.moving) deg += ctx.ads ? 0.5 : 1.3;
    if (ctx.sprinting) deg += 2.5;
    if (ctx.airborne) deg += 3;
    if (ctx.crouching) deg *= 0.7;
    deg += ch.weapon.bloom * (ctx.ads ? 0.5 : 1);
    return deg;
  }

  function applySpread(dir, deg, out) {
    if (deg <= 0) return out.copy(dir);
    const up = Math.abs(dir.y) > 0.98 ? basisUp.set(1, 0, 0) : WORLD_UP;
    basisRight.crossVectors(dir, up).normalize();
    basisUp.crossVectors(basisRight, dir).normalize();
    const r = Math.tan(deg * DEG) * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    return out.copy(dir).addScaledVector(basisRight, Math.cos(a) * r).addScaledVector(basisUp, Math.sin(a) * r).normalize();
  }

  function falloff(st, dist) {
    if (dist <= st.falloffStart) return 1;
    return U.lerp(1, st.falloffMin, U.clamp((dist - st.falloffStart) / (st.range - st.falloffStart), 0, 1));
  }

  function applyHit(shooter, st, hit, damageScale, weaponType) {
    if (hit.kind === "character") {
      const dmg = st.damage * damageScale * falloff(st, hit.dist) * (hit.headshot ? st.headMul : 1);
      SQ.Game.damage(hit.character, dmg, shooter, { headshot: hit.headshot, weapon: weaponType, x: hit.x, y: hit.y, z: hit.z });
      return;
    }
    const c = hit.collider;
    if (c && c.piece) SQ.Building.damage(c.piece, st.damage * st.structure * damageScale * falloff(st, hit.dist), shooter, hit);
    else if (c && c.barrel) SQ.Game.explodeBarrel(c.barrel, shooter);
    SQ.Effects.impact(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, c ? c.surface : "terrain");
  }

  function startReload(ch) {
    const item = ch.held();
    if (!item || item.kind !== "weapon") return false;
    const st = stats(item);
    const w = ch.weapon;
    if (w.reloadT > 0 || item.mag >= st.mag || ch.inventory.ammo[st.ammo] <= 0) return false;
    w.reloadT = st.reload;
    w.reloadTotal = st.reload;
    w.reloadUid = item.uid;
    ch.using = null;
    if (ch.isPlayer) SQ.Audio.reload("start");
    return true;
  }

  function update(ch, dt) {
    const w = ch.weapon;
    w.cooldown = Math.max(0, w.cooldown - dt);
    w.swingT = Math.max(0, w.swingT - dt);
    w.bloom = Math.max(0, w.bloom - dt * 5);
    if (w.reloadT > 0) {
      const item = ch.held();
      if (!item || item.uid !== w.reloadUid) {
        w.reloadT = 0;
        return;
      }
      w.reloadT -= dt;
      if (w.reloadT <= 0) {
        const st = stats(item);
        const take = Math.min(st.mag - item.mag, ch.inventory.ammo[st.ammo]);
        item.mag += take;
        ch.inventory.ammo[st.ammo] -= take;
        w.reloadT = 0;
        if (ch.isPlayer) SQ.Audio.reload("end");
      }
    }
  }

  // Fires the held weapon from origin along dir. Returns true when a shot left the barrel.
  function fire(ch, origin, dir, ctx, damageScale = 1) {
    const item = ch.held();
    if (!item || item.kind !== "weapon") return false;
    const w = ch.weapon;
    if (w.cooldown > 0 || w.reloadT > 0) return false;
    const st = stats(item);
    if (item.mag <= 0) {
      if (!startReload(ch)) {
        if (ch.isPlayer) SQ.Audio.empty();
        w.cooldown = 0.3;
      }
      return false;
    }
    item.mag -= 1;
    w.cooldown = st.interval * (ch.fireIntervalMul || 1);
    ch.using = null;

    ch.muzzleWorld(muzzle);
    const spread = spreadFor(ch, item, ctx);
    for (let i = 0; i < st.pellets; i++) {
      applySpread(dir, spread, shotDir);
      const hit = SQ.Physics.raycast(origin.x, origin.y, origin.z, shotDir.x, shotDir.y, shotDir.z, st.range, { characters: true, ignore: ch });
      const dist = hit ? hit.dist : st.range;
      const ex = origin.x + shotDir.x * dist;
      const ey = origin.y + shotDir.y * dist;
      const ez = origin.z + shotDir.z * dist;
      if (i % 2 === 0) SQ.Effects.tracer(muzzle.x, muzzle.y, muzzle.z, ex, ey, ez, item.type === "sniper" ? "#ffffff" : "#ffe2a0", item.type === "sniper" ? 0.18 : 0.07);
      if (hit) applyHit(ch, st, hit, damageScale, item.type);
    }
    w.bloom = Math.min(st.bloomMax, w.bloom + st.bloomPerShot);
    ch.recoilAnim = 1;
    SQ.Effects.flash(muzzle.x, muzzle.y, muzzle.z, item.type === "shotgun" || item.type === "sniper" ? 0.9 : 0.55, ch.isPlayer || Math.random() < 0.5);
    SQ.Audio.shot(item.type, muzzle, ch.isPlayer);
    SQ.Game.reportNoise(ch, muzzle.x, muzzle.z, item.type === "sniper" ? 140 : 80);
    return true;
  }

  function swing(ch, origin, dir) {
    const w = ch.weapon;
    if (w.swingT > 0) return false;
    const H = SQ.CFG.HATCHET;
    w.swingT = H.interval;
    ch.swingAnim = 1;
    if (ch.isPlayer) SQ.Audio.swing();
    const hit = SQ.Physics.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, H.range, { characters: true, ignore: ch });
    if (!hit) return true;
    if (hit.kind === "character") {
      SQ.Game.damage(hit.character, H.damage, ch, { headshot: false, weapon: "hatchet", x: hit.x, y: hit.y, z: hit.z });
      return true;
    }
    const c = hit.collider;
    const surface = c ? c.surface : "terrain";
    if (c && c.piece) {
      SQ.Building.damage(c.piece, H.structureDamage, ch, hit);
    } else if (c && c.barrel) {
      SQ.Game.explodeBarrel(c.barrel, ch);
    } else if (c && c.harvest) {
      const mats = SQ.World.harvest(c, 40);
      const before = ch.inventory.mats;
      ch.inventory.add(SQ.Items.mats(mats));
      if (ch.isPlayer && ch.inventory.mats > before) SQ.HUD.toast(`+${ch.inventory.mats - before} materials`, "mats");
    }
    SQ.Audio.harvest(c && c.harvest ? c.harvest.surface : surface, hit);
    SQ.Effects.impact(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, surface);
    return true;
  }

  SQ.Weapons = { stats, spreadFor, startReload, update, fire, swing, falloff };
})(window.SQ = window.SQ || {});
