// Squall: floor pickups, chests and loot spawning. All rendered with instancing. By The_headphones
(function (SQ) {
  const CAP = 320;
  const PICK_RANGE = 2.4;
  const AUTO_RANGE = 1.5;
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  let scene;
  const meshes = {};
  const free = {};
  let pickups = [];
  let chests = [];
  let sparkleT = 0;

  function category(item) {
    if (item.kind === "weapon") return "weapon";
    if (item.kind === "ammo") return "ammo";
    if (item.kind === "mats") return "mats";
    return SQ.CONSUMABLES[item.type].kind === "shield" ? "shield" : "heal";
  }

  function makeInstanced(name, geo, material, cap, castShadow = false) {
    const m = new THREE.InstancedMesh(geo, material, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = castShadow;
    m.frustumCulled = false;
    for (let i = 0; i < cap; i++) {
      m.setMatrixAt(i, hidden);
      m.setColorAt(i, tint.set("#ffffff"));
    }
    scene.add(m);
    meshes[name] = m;
    free[name] = Array.from({ length: cap }, (_, i) => cap - 1 - i);
  }

  function init(sceneRef) {
    scene = sceneRef;
    const lambert = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    makeInstanced("weapon", new THREE.BoxGeometry(0.85, 0.2, 0.26), lambert(), CAP);
    makeInstanced("ammo", new THREE.BoxGeometry(0.34, 0.24, 0.24), lambert(), CAP);
    makeInstanced("heal", new THREE.BoxGeometry(0.34, 0.34, 0.34), lambert(), CAP);
    makeInstanced("shield", new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10), lambert(), CAP);
    makeInstanced("mats", new THREE.BoxGeometry(0.75, 0.14, 0.32), lambert(), CAP);
    makeInstanced(
      "beam",
      new THREE.CylinderGeometry(0.05, 0.12, 2.6, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
      CAP,
    );
    const chestCap = Math.max(1, SQ.World.chestSpots.length);
    makeInstanced("chest", new THREE.BoxGeometry(1.0, 0.55, 0.62), lambert(), chestCap, true);
    makeInstanced("lid", new THREE.BoxGeometry(1.06, 0.16, 0.66), lambert(), chestCap, true);
  }

  function spawn(item, x, y, z, toss = true) {
    const cat = category(item);
    const idx = free[cat].pop();
    if (idx === undefined) return null;
    const beamIdx = cat === "weapon" || cat === "heal" || cat === "shield" ? free.beam.pop() : undefined;
    const p = {
      item, cat, idx, beamIdx, x, y: y + 0.4, z, t: Math.random() * 10,
      vx: toss ? (Math.random() - 0.5) * 5 : 0,
      vy: toss ? 4 + Math.random() * 2 : 0,
      vz: toss ? (Math.random() - 0.5) * 5 : 0,
      resting: !toss, groundY: y,
    };
    meshes[cat].setColorAt(idx, tint.set(SQ.Items.color(item)));
    meshes[cat].instanceColor.needsUpdate = true;
    if (beamIdx !== undefined) {
      meshes.beam.setColorAt(beamIdx, tint.set(SQ.Items.color(item)));
      meshes.beam.instanceColor.needsUpdate = true;
    }
    pickups.push(p);
    return p;
  }

  function remove(p) {
    const i = pickups.indexOf(p);
    if (i < 0) return;
    pickups.splice(i, 1);
    meshes[p.cat].setMatrixAt(p.idx, hidden);
    free[p.cat].push(p.idx);
    if (p.beamIdx !== undefined) {
      meshes.beam.setMatrixAt(p.beamIdx, hidden);
      free.beam.push(p.beamIdx);
    }
  }

  function dropAll(items, x, y, z) {
    items.forEach((item) => spawn(item, x, y, z, true));
  }

  function setChest(i) {
    const c = chests[i];
    dummy.position.set(c.x, c.y + 0.275, c.z);
    dummy.rotation.set(0, c.rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    meshes.chest.setMatrixAt(i, dummy.matrix);
    meshes.chest.setColorAt(i, tint.set(c.opened ? "#6f5a3e" : "#b5832f"));
    dummy.position.set(c.x, c.y + 0.63, c.z);
    dummy.rotation.set(c.opened ? -1.1 : 0, c.rotY, 0, "YXZ");
    if (c.opened) dummy.position.y += 0.18;
    dummy.updateMatrix();
    meshes.lid.setMatrixAt(i, dummy.matrix);
    meshes.lid.setColorAt(i, tint.set(c.opened ? "#5a4a34" : "#e2b546"));
    meshes.chest.instanceMatrix.needsUpdate = true;
    meshes.lid.instanceMatrix.needsUpdate = true;
    meshes.chest.instanceColor.needsUpdate = true;
    meshes.lid.instanceColor.needsUpdate = true;
  }

  function openChest(chest, opener) {
    if (chest.opened) return;
    chest.opened = true;
    setChest(chests.indexOf(chest));
    const [weapon, ammo] = SQ.Items.weaponDrop(1);
    spawn(weapon, chest.x, chest.y + 0.6, chest.z);
    spawn(ammo, chest.x, chest.y + 0.6, chest.z);
    spawn(Math.random() < 0.6 ? SQ.Items.randomConsumable() : SQ.Items.mats(30), chest.x, chest.y + 0.6, chest.z);
    if (Math.random() < 0.4) spawn(SQ.Items.ammo(SQ.U.pick(Object.keys(SQ.AMMO)), 30), chest.x, chest.y + 0.6, chest.z);
    SQ.Audio.chest(chest);
    SQ.Effects.emit("spark", chest.x, chest.y + 0.8, chest.z, 24, { color: "#ffd56a", speed: 4, life: 0.6, spread: 1, lift: 2, gravity: 3 });
    if (opener && opener.isPlayer) SQ.HUD.toast("Chest opened", "loot");
  }

  function reset() {
    pickups.slice().forEach(remove);
    chests = SQ.World.chestSpots.map((s) => ({ ...s, opened: false }));
    chests.forEach((_, i) => setChest(i));
    SQ.World.lootSpots.forEach((spot) => {
      const roll = Math.random();
      if (roll < 0.12) return;
      if (roll < 0.62) {
        const [weapon, ammo] = SQ.Items.weaponDrop(0);
        spawn(weapon, spot.x, spot.y, spot.z, false);
        spawn(ammo, spot.x + 0.6, spot.y, spot.z + 0.3, false);
      } else if (roll < 0.84) {
        spawn(SQ.Items.randomConsumable(), spot.x, spot.y, spot.z, false);
      } else {
        spawn(SQ.Items.mats(40), spot.x, spot.y, spot.z, false);
      }
    });
  }

  function update(dt, focus) {
    for (const p of pickups) {
      p.t += dt;
      if (!p.resting) {
        p.vy -= 20 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 0.98;
        p.vz *= 0.98;
        const ground = SQ.Physics.groundHeight(p.x, p.z, p.y, 0.2);
        if (p.y <= ground) {
          p.y = ground;
          p.groundY = ground;
          p.resting = true;
        }
      }
      const bob = p.resting ? 0.35 + Math.sin(p.t * 2.2) * 0.07 : 0;
      dummy.position.set(p.x, p.y + bob, p.z);
      dummy.rotation.set(0, p.t * 1.3, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshes[p.cat].setMatrixAt(p.idx, dummy.matrix);
      if (p.beamIdx !== undefined) {
        dummy.position.set(p.x, p.y + 1.4, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, p.resting ? 1 : 0.001, 1);
        dummy.updateMatrix();
        meshes.beam.setMatrixAt(p.beamIdx, dummy.matrix);
      }
    }
    ["weapon", "ammo", "heal", "shield", "mats", "beam"].forEach((k) => {
      meshes[k].instanceMatrix.needsUpdate = true;
    });

    sparkleT -= dt;
    if (sparkleT <= 0 && focus) {
      sparkleT = 0.35;
      for (const c of chests) {
        if (c.opened) continue;
        if (Math.abs(c.x - focus.x) > 35 || Math.abs(c.z - focus.z) > 35) continue;
        SQ.Effects.emit("spark", c.x + (Math.random() - 0.5) * 0.8, c.y + 0.8, c.z + (Math.random() - 0.5) * 0.5, 2, { color: "#ffdf7a", speed: 0.6, life: 0.9, gravity: -0.6, spread: 1 });
      }
    }
  }

  // Nearest chest or slot item within reach, preferring what the camera looks at.
  function nearestInteractable(pos, forward) {
    let best = null;
    let bestScore = Infinity;
    const consider = (target, x, y, z, type) => {
      const dx = x - pos.x;
      const dz = z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > PICK_RANGE || Math.abs(y - pos.y) > 2.2) return;
      const facing = dist > 0.01 ? (dx * forward.x + dz * forward.z) / dist : 1;
      const score = dist - facing * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = { type, target };
      }
    };
    chests.forEach((c) => {
      if (!c.opened) consider(c, c.x, c.y, c.z, "chest");
    });
    pickups.forEach((p) => {
      if (p.resting && (p.cat === "weapon" || p.cat === "heal" || p.cat === "shield")) consider(p, p.x, p.y, p.z, "pickup");
    });
    return best;
  }

  // Ammo and materials are picked up just by walking over them.
  function autoCollect(ch) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (!p.resting || (p.cat !== "ammo" && p.cat !== "mats")) continue;
      if (Math.abs(p.x - ch.pos.x) > AUTO_RANGE || Math.abs(p.z - ch.pos.z) > AUTO_RANGE || Math.abs(p.y - ch.pos.y) > 1.8) continue;
      const amount = p.item.amount;
      const result = ch.inventory.add(p.item);
      if (result.added) remove(p);
      if (ch.isPlayer && (result.added || result.partial)) {
        SQ.Audio.pickup(0);
        SQ.HUD.toast(`+${amount - p.item.amount || amount} ${SQ.Items.name(p.item).toLowerCase()}`, p.cat);
      }
    }
  }

  // Picks up a slot item; whatever it displaced is dropped where the pickup was.
  function take(ch, p) {
    const result = ch.inventory.add(p.item, true);
    if (!result.added) return false;
    const { x, z } = p;
    remove(p);
    if (result.dropped) spawn(result.dropped, x, p.groundY, z, false);
    if (ch.isPlayer) SQ.Audio.pickup(p.item.rarity);
    ch.refreshHeld();
    return true;
  }

  SQ.Loot = {
    init, spawn, remove, dropAll, reset, update, openChest, nearestInteractable, autoCollect, take,
    get pickups() {
      return pickups;
    },
    get chests() {
      return chests;
    },
  };
})(window.SQ = window.SQ || {});
