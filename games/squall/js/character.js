// Squall: character data, blocky models, weapon models and procedural animation. By The_headphones
(function (SQ) {
  const { CFG, U } = SQ;
  const P = CFG.PLAYER;

  const OUTFITS = {
    shirts: ["#c0533a", "#3f7cae", "#d4a43a", "#5c8a4a", "#8b5aa8", "#d8d2c4", "#c46f8f", "#3b8f8a", "#7a6a58"],
    pants: ["#2f3a4f", "#4b3f33", "#3b4a3a", "#5a5a64", "#1f2a33", "#6b4f3a"],
    skins: ["#f1c9a5", "#d9a37a", "#b07a52", "#8a5a3c", "#5f3d2a"],
    hair: ["#2b1f18", "#6b4a2b", "#c9a15a", "#8a3a22", "#d8d2c4", "#3a3a3a"],
  };

  // ---- Weapon models: barrel along -z, grip at the origin ----
  const weaponGeoCache = {};
  function weaponGeometry(type) {
    if (weaponGeoCache[type]) return weaponGeoCache[type];
    const parts = [];
    const add = (x, y, z, w, h, d, hex) => {
      parts.push({ geometry: new THREE.BoxGeometry(w, h, d), matrix: new THREE.Matrix4().makeTranslation(x, y, z), color: new THREE.Color(hex), shade: 0 });
    };
    const dark = "#2a2f36";
    const mid = "#4a525c";
    const wood = "#8a5a36";
    if (type === "ar") {
      add(0, 0.05, -0.15, 0.08, 0.12, 0.62, mid);
      add(0, 0.07, -0.62, 0.04, 0.04, 0.36, dark);
      add(0, 0.03, 0.28, 0.07, 0.12, 0.26, dark);
      add(0, -0.08, -0.12, 0.06, 0.18, 0.1, dark);
      add(0, 0.14, -0.2, 0.04, 0.05, 0.14, dark);
      add(0, -0.04, 0.04, 0.05, 0.12, 0.07, dark);
    } else if (type === "smg") {
      add(0, 0.05, -0.12, 0.08, 0.12, 0.44, mid);
      add(0, 0.06, -0.42, 0.035, 0.035, 0.16, dark);
      add(0, -0.12, -0.16, 0.05, 0.26, 0.07, dark);
      add(0, 0.03, 0.17, 0.05, 0.06, 0.14, dark);
      add(0, -0.04, 0.02, 0.05, 0.12, 0.07, dark);
    } else if (type === "pistol") {
      add(0, 0.06, -0.08, 0.06, 0.1, 0.26, mid);
      add(0, -0.05, 0.01, 0.05, 0.15, 0.08, dark);
    } else if (type === "shotgun") {
      add(0, 0.05, -0.12, 0.08, 0.1, 0.5, mid);
      add(0, 0.07, -0.58, 0.06, 0.06, 0.5, dark);
      add(0, 0.0, -0.52, 0.08, 0.07, 0.2, wood);
      add(0, 0.02, 0.28, 0.07, 0.13, 0.3, wood);
      add(0, -0.05, 0.04, 0.05, 0.12, 0.07, dark);
    } else if (type === "sniper") {
      add(0, 0.05, -0.15, 0.08, 0.11, 0.62, "#3f4a3a");
      add(0, 0.06, -0.78, 0.035, 0.035, 0.6, dark);
      add(0, 0.16, -0.18, 0.07, 0.07, 0.32, dark);
      add(0, 0.02, 0.32, 0.07, 0.14, 0.36, "#3f4a3a");
      add(0, -0.05, 0.02, 0.05, 0.12, 0.07, dark);
    } else {
      add(0, 0, -0.25, 0.04, 0.04, 0.55, wood);
      add(0, 0.06, -0.5, 0.04, 0.18, 0.12, "#9aa3ab");
    }
    weaponGeoCache[type] = SQ.U.mergeGeometries(parts);
    return weaponGeoCache[type];
  }

  const MUZZLE_Z = { ar: -0.8, smg: -0.5, pistol: -0.22, shotgun: -0.84, sniper: -1.08, hatchet: -0.5 };

  let nextId = 1;

  class Character {
    constructor({ isPlayer = false, name = "Player", outfit = null }) {
      this.id = nextId++;
      this.isPlayer = isPlayer;
      this.name = name;
      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.radius = P.radius;
      this.yaw = 0;
      this.aimPitch = 0;
      this.crouching = false;
      this.onGround = false;
      this.inWater = false;
      this.surface = "grass";
      this.health = P.maxHealth;
      this.shield = 0;
      this.alive = true;
      this.state = "ground";
      this.inventory = new SQ.Inventory();
      this.kills = 0;
      this.damageDealt = 0;
      this.lastAttacker = null;
      this.lastHurtAt = -99;
      this.weapon = { cooldown: 0, bloom: 0, reloadT: 0, reloadTotal: 0, reloadUid: 0, swingT: 0 };
      this.using = null;
      this.walkPhase = 0;
      this.stepDist = 0;
      this.hitFlash = 0;
      this.deathT = 0;
      this.swingAnim = 0;
      this.recoilAnim = 0;
      this.buildCooldown = 0;
      this.heldType = null;
      this.buildModel(outfit || Character.randomOutfit());
    }

    static randomOutfit() {
      return {
        shirt: U.pick(OUTFITS.shirts), pants: U.pick(OUTFITS.pants),
        skin: U.pick(OUTFITS.skins), hair: U.pick(OUTFITS.hair), pack: U.pick(OUTFITS.shirts),
      };
    }

    currentHeight() {
      return this.crouching ? P.crouchHeight : P.height;
    }

    eyeHeight() {
      return this.crouching ? 1.15 : 1.6;
    }

    chestY() {
      return this.pos.y + (this.crouching ? 0.95 : 1.32);
    }

    chestEye(out) {
      return out.set(this.pos.x, this.chestY() + 0.15, this.pos.z);
    }

    held() {
      return this.inventory.current();
    }

    buildModel(o) {
      this.materials = [];
      const mat = (hex) => {
        const m = new THREE.MeshLambertMaterial({ color: hex });
        this.materials.push(m);
        return m;
      };
      const box = (w, h, d, material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.castShadow = true;
        return mesh;
      };
      const shirt = mat(o.shirt);
      const pants = mat(o.pants);
      const skin = mat(o.skin);
      const hair = mat(o.hair);
      const pack = mat(o.pack);
      const visor = mat("#1b2129");

      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const hips = new THREE.Group();
      hips.position.y = 0.9;
      body.add(hips);
      const torso = box(0.62, 0.7, 0.36, shirt);
      torso.position.y = 0.36;
      hips.add(torso);
      const belt = box(0.64, 0.1, 0.38, pants);
      belt.position.y = 0.04;
      hips.add(belt);
      const backpack = box(0.46, 0.5, 0.2, pack);
      backpack.position.set(0, 0.4, 0.27);
      hips.add(backpack);

      const head = new THREE.Group();
      head.position.y = 0.92;
      hips.add(head);
      const skull = box(0.4, 0.4, 0.4, skin);
      skull.position.y = 0.2;
      head.add(skull);
      const cap = box(0.44, 0.14, 0.44, hair);
      cap.position.y = 0.42;
      head.add(cap);
      const eyes = box(0.3, 0.07, 0.03, visor);
      eyes.position.set(0, 0.24, -0.205);
      head.add(eyes);

      const armR = new THREE.Group();
      armR.position.set(0.41, 0.66, 0);
      hips.add(armR);
      const armL = new THREE.Group();
      armL.position.set(-0.41, 0.66, 0);
      hips.add(armL);
      [armR, armL].forEach((arm) => {
        const sleeve = box(0.19, 0.34, 0.19, shirt);
        sleeve.position.y = -0.15;
        arm.add(sleeve);
        const hand = box(0.16, 0.3, 0.16, skin);
        hand.position.y = -0.45;
        arm.add(hand);
      });

      const legR = new THREE.Group();
      legR.position.set(0.16, 0.9, 0);
      body.add(legR);
      const legL = new THREE.Group();
      legL.position.set(-0.16, 0.9, 0);
      body.add(legL);
      [legR, legL].forEach((leg) => {
        const l = box(0.24, 0.86, 0.26, pants);
        l.position.y = -0.43;
        leg.add(l);
        const boot = box(0.26, 0.14, 0.34, visor);
        boot.position.set(0, -0.84, -0.04);
        leg.add(boot);
      });

      const weaponHolder = new THREE.Group();
      weaponHolder.position.set(0, -0.56, -0.02);
      weaponHolder.rotation.x = -Math.PI / 2;
      armR.add(weaponHolder);
      const weaponMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
      weaponMesh.castShadow = true;
      weaponHolder.add(weaponMesh);
      const accent = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      accent.position.set(0, 0.115, -0.05);
      weaponHolder.add(accent);
      const muzzle = new THREE.Object3D();
      weaponHolder.add(muzzle);

      const glider = new THREE.Group();
      const sail = new THREE.Mesh(
        new THREE.ConeGeometry(1.7, 0.5, 3, 1, true),
        new THREE.MeshLambertMaterial({ color: o.pack, side: THREE.DoubleSide }),
      );
      sail.rotation.y = Math.PI;
      sail.scale.set(1, 1, 0.7);
      sail.position.y = 2.6;
      glider.add(sail);
      const strut = box(0.05, 1.0, 0.05, visor);
      strut.position.y = 2.1;
      glider.add(strut);
      glider.visible = false;
      root.add(glider);

      this.model = root;
      this.parts = { body, hips, torso, head, armR, armL, legR, legL, weaponHolder, weaponMesh, accent, muzzle, glider };
    }

    // Swaps the held weapon model when the selected item changes.
    refreshHeld() {
      const item = this.held();
      const type = item && item.kind === "weapon" ? item.type : item ? "consumable" : "hatchet";
      const key = `${type}:${item ? item.rarity : 0}`;
      if (key === this.heldType) return;
      this.heldType = key;
      const { weaponMesh, accent, muzzle } = this.parts;
      if (type === "consumable") {
        weaponMesh.visible = false;
        accent.visible = true;
        accent.material.color.set(SQ.Items.color(item));
        accent.scale.set(1.6, 4, 0.8);
        return;
      }
      weaponMesh.visible = true;
      weaponMesh.geometry = weaponGeometry(type);
      accent.visible = type !== "hatchet";
      accent.scale.set(1, 1, 1);
      if (item) accent.material.color.set(SQ.RARITY[item.rarity].color);
      muzzle.position.set(0, 0.07, MUZZLE_Z[type]);
    }

    muzzleWorld(out) {
      this.parts.muzzle.getWorldPosition(out);
      return out;
    }

    flash() {
      this.hitFlash = 0.1;
    }

    // Procedural animation driven by movement and state.
    animate(dt) {
      const p = this.parts;
      this.model.position.copy(this.pos);
      this.model.rotation.y = this.yaw;

      if (!this.alive) {
        this.deathT += dt;
        const t = Math.min(1, this.deathT / 0.5);
        p.body.rotation.x = U.lerp(0, Math.PI / 2, t * t);
        p.body.position.y = -t * 0.3;
        p.glider.visible = false;
        if (this.deathT > 2.5) this.model.visible = false;
        return;
      }
      p.body.rotation.x = 0;
      p.body.position.y = 0;

      const speed = Math.hypot(this.vel.x, this.vel.z);
      this.walkPhase += speed * dt * 1.7;
      const swing = Math.sin(this.walkPhase) * Math.min(1, speed / 6) * 0.75;
      const item = this.held();
      const armed = item && item.kind === "weapon";
      const aimX = Math.PI / 2 + this.aimPitch;

      p.glider.visible = this.state === "glide";
      if (this.state === "skydive") {
        p.body.rotation.x = -1.25;
        p.armR.rotation.set(0, 0, 1.3);
        p.armL.rotation.set(0, 0, -1.3);
        p.legR.rotation.set(0.25, 0, 0.15);
        p.legL.rotation.set(0.25, 0, -0.15);
        p.hips.position.y = 0.9;
        return;
      }
      if (this.state === "glide") {
        p.armR.rotation.set(Math.PI - 0.1, 0, 0.15);
        p.armL.rotation.set(Math.PI - 0.1, 0, -0.15);
        p.legR.rotation.set(0.2, 0, 0);
        p.legL.rotation.set(-0.1, 0, 0);
        p.hips.position.y = 0.9;
        return;
      }

      const crouch = this.crouching ? 1 : 0;
      p.hips.position.y = U.damp(p.hips.position.y, 0.9 - crouch * 0.32, 14, dt);
      const air = !this.onGround && !this.inWater;
      const legBase = crouch * 0.8;
      p.legR.rotation.set(air ? -0.5 : -swing - legBase, 0, 0);
      p.legL.rotation.set(air ? 0.35 : swing - legBase, 0, 0);
      p.torso.rotation.x = crouch * 0.18;

      this.recoilAnim = Math.max(0, this.recoilAnim - dt * 8);
      this.swingAnim = Math.max(0, this.swingAnim - dt * 3.5);
      if (armed) {
        const kick = this.recoilAnim * 0.25;
        p.armR.rotation.set(aimX + kick, 0, 0);
        p.armL.rotation.set(aimX + kick, 0.55, 0);
      } else if (item) {
        p.armR.rotation.set(aimX * 0.7, 0, 0);
        p.armL.rotation.set(aimX * 0.7, 0.5, 0);
      } else {
        const chop = this.swingAnim > 0 ? Math.sin((1 - this.swingAnim) * Math.PI) * 1.6 : 0;
        p.armR.rotation.set(aimX * 0.75 + 0.9 - chop * 1.2, 0, 0);
        p.armL.rotation.set(swing * 0.8, 0, 0);
      }
      p.head.rotation.x = -this.aimPitch * 0.5;

      if (this.hitFlash > 0) {
        this.hitFlash -= dt;
        const on = this.hitFlash > 0;
        this.materials.forEach((m) => m.emissive.setRGB(on ? 0.6 : 0, on ? 0.6 : 0, on ? 0.6 : 0));
      }
    }

    resetForMatch() {
      this.health = P.maxHealth;
      this.shield = 0;
      this.alive = true;
      this.kills = 0;
      this.damageDealt = 0;
      this.lastAttacker = null;
      this.inventory = new SQ.Inventory();
      this.weapon = { cooldown: 0, bloom: 0, reloadT: 0, reloadTotal: 0, reloadUid: 0, swingT: 0 };
      this.using = null;
      this.crouching = false;
      this.deathT = 0;
      this.vel.set(0, 0, 0);
      this.model.visible = true;
      this.heldType = null;
      this.materials.forEach((m) => m.emissive.setRGB(0, 0, 0));
      this.refreshHeld();
    }
  }

  SQ.Character = Character;
  SQ.weaponGeometry = weaponGeometry;
})(window.SQ = window.SQ || {});
