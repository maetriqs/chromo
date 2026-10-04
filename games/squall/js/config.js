// Squall: tuning tables for every system. By The_headphones
(function (SQ) {
  SQ.CFG = {
    WORLD_HALF: 230.4,
    TERRAIN_CELLS: 144,
    BOUNDARY: 195,
    GRAVITY: 24,
    STEP_HEIGHT: 0.55,
    PLAYER: {
      radius: 0.42,
      height: 1.8,
      crouchHeight: 1.25,
      walk: 5.4,
      sprint: 8.2,
      crouch: 2.8,
      jump: 8.4,
      maxHealth: 100,
      maxShield: 100,
    },
    DROP_HEIGHT: 150,
    BUILD: { cell: 4, level: 4, cost: 10, cooldown: 0.16, maxMats: 500, startMats: 30 },
    BOT_COUNT: 19,
    HATCHET: { damage: 20, structureDamage: 50, interval: 0.55, range: 2.6, harvest: 10 },
  };

  SQ.RARITY = [
    { id: "common", name: "Common", color: "#a7aeb6", damage: 1.0, reload: 1.0, spread: 1.0 },
    { id: "uncommon", name: "Uncommon", color: "#5fb85f", damage: 1.06, reload: 0.95, spread: 0.95 },
    { id: "rare", name: "Rare", color: "#3f93dc", damage: 1.12, reload: 0.9, spread: 0.9 },
    { id: "epic", name: "Epic", color: "#a45fd6", damage: 1.18, reload: 0.85, spread: 0.85 },
    { id: "legendary", name: "Legendary", color: "#ec9f35", damage: 1.25, reload: 0.8, spread: 0.8 },
  ];

  // Spread values are degrees. Intervals are seconds between shots.
  SQ.WEAPONS = {
    ar: {
      name: "Corsair AR", category: "Assault rifle", ammo: "medium",
      damage: 30, headMul: 1.6, interval: 0.18, mag: 30, reload: 2.3,
      range: 140, falloffStart: 50, falloffMin: 0.7,
      spreadHip: 2.4, spreadAds: 0.45, bloomPerShot: 0.35, bloomMax: 3.5,
      recoil: 0.9, recoilYaw: 0.35, auto: true, pellets: 1, zoom: 1.5,
      structure: 1.0, weight: 26, pickupAmmo: 60, minRarity: 0,
    },
    shotgun: {
      name: "Breaker 12", category: "Shotgun", ammo: "shells",
      damage: 11, headMul: 1.8, interval: 0.95, mag: 5, reload: 4.0,
      range: 40, falloffStart: 8, falloffMin: 0.35,
      spreadHip: 6.5, spreadAds: 5.0, bloomPerShot: 0, bloomMax: 0,
      recoil: 4, recoilYaw: 1, auto: false, pellets: 8, zoom: 1.15,
      structure: 1.3, weight: 20, pickupAmmo: 12, minRarity: 0,
    },
    smg: {
      name: "Wasp SMG", category: "SMG", ammo: "light",
      damage: 16, headMul: 1.5, interval: 0.075, mag: 32, reload: 2.1,
      range: 80, falloffStart: 22, falloffMin: 0.55,
      spreadHip: 3.4, spreadAds: 1.8, bloomPerShot: 0.18, bloomMax: 3,
      recoil: 0.4, recoilYaw: 0.3, auto: true, pellets: 1, zoom: 1.25,
      structure: 0.8, weight: 22, pickupAmmo: 90, minRarity: 0,
    },
    pistol: {
      name: "Marlin P9", category: "Pistol", ammo: "light",
      damage: 24, headMul: 1.75, interval: 0.16, mag: 15, reload: 1.4,
      range: 80, falloffStart: 30, falloffMin: 0.6,
      spreadHip: 1.9, spreadAds: 0.55, bloomPerShot: 0.5, bloomMax: 3,
      recoil: 1.3, recoilYaw: 0.3, auto: false, pellets: 1, zoom: 1.3,
      structure: 0.8, weight: 22, pickupAmmo: 45, minRarity: 0,
    },
    sniper: {
      name: "Longreach", category: "Sniper", ammo: "heavy",
      damage: 110, headMul: 2.4, interval: 1.5, mag: 4, reload: 3.0,
      range: 350, falloffStart: 350, falloffMin: 1,
      spreadHip: 7, spreadAds: 0, bloomPerShot: 0, bloomMax: 0,
      recoil: 6, recoilYaw: 1.2, auto: false, pellets: 1, zoom: 4.5, scoped: true,
      structure: 1.5, weight: 10, pickupAmmo: 12, minRarity: 2,
    },
  };

  SQ.CONSUMABLES = {
    patch: { name: "Patch Kit", kind: "heal", amount: 20, cap: 75, time: 2.6, stack: 10, rarity: 0, spawnCount: 5 },
    medkit: { name: "Field Kit", kind: "heal", amount: 100, cap: 100, time: 6, stack: 3, rarity: 1, spawnCount: 1 },
    cell: { name: "Shield Cell", kind: "shield", amount: 25, cap: 50, time: 2.2, stack: 6, rarity: 1, spawnCount: 3 },
    flask: { name: "Shield Flask", kind: "shield", amount: 50, cap: 100, time: 4.2, stack: 3, rarity: 2, spawnCount: 1 },
  };

  SQ.AMMO = {
    light: { name: "Light rounds", color: "#d8c7a0" },
    medium: { name: "Medium rounds", color: "#9fb7c9" },
    shells: { name: "Shells", color: "#d36b4f" },
    heavy: { name: "Heavy rounds", color: "#7a8f6a" },
  };

  // The storm starts wide enough to cover the island and closes in phases.
  SQ.STORM = {
    startRadius: 250,
    phases: [
      { wait: 50, shrink: 50, radius: 120, dps: 1 },
      { wait: 40, shrink: 40, radius: 72, dps: 2 },
      { wait: 35, shrink: 35, radius: 40, dps: 4 },
      { wait: 30, shrink: 30, radius: 20, dps: 6 },
      { wait: 25, shrink: 25, radius: 8, dps: 8 },
      { wait: 20, shrink: 40, radius: 0, dps: 10 },
    ],
  };

  SQ.BOT_SKILLS = {
    easy: { label: "Rookie", reaction: 0.9, aimError: 7, fireMul: 0.6, detect: 45, aggression: 0.35, strafe: 0.2, builds: false, jump: 0 },
    normal: { label: "Regular", reaction: 0.55, aimError: 4, fireMul: 0.85, detect: 60, aggression: 0.55, strafe: 0.6, builds: false, jump: 0.1 },
    hard: { label: "Veteran", reaction: 0.32, aimError: 2.2, fireMul: 1, detect: 75, aggression: 0.75, strafe: 1, builds: true, jump: 0.3 },
    elite: { label: "Ace", reaction: 0.2, aimError: 1.3, fireMul: 1, detect: 90, aggression: 0.9, strafe: 1, builds: true, jump: 0.5 },
  };

  SQ.SKILL_MIX = {
    casual: { label: "Casual", weights: { easy: 0.6, normal: 0.35, hard: 0.05, elite: 0 } },
    mixed: { label: "Mixed", weights: { easy: 0.25, normal: 0.4, hard: 0.25, elite: 0.1 } },
    sweaty: { label: "Sweaty", weights: { easy: 0, normal: 0.25, hard: 0.45, elite: 0.3 } },
  };

  SQ.BOT_NAMES = [
    "Thistle", "Gannet", "Rook", "Pike", "Juniper", "Marlow", "Cinder", "Bramble", "Wren", "Tamsin",
    "Fenwick", "Quill", "Sable", "Hollis", "Tarn", "Briar", "Corvid", "Ember", "Lark", "Moss",
    "Vesper", "Nettle", "Osprey", "Dune", "Fable", "Garnet", "Halyard", "Ives",
  ];

  // Points of interest. Coordinates are metres; north is -z.
  SQ.POIS = [
    { id: "millbrook", name: "Millbrook", kind: "town", x: -45, z: 25, radius: 40, flatten: true },
    { id: "rustworks", name: "Rustworks", kind: "industrial", x: 85, z: -40, radius: 40, flatten: true },
    { id: "pinewood", name: "Pinewood", kind: "forest", x: -85, z: -65, radius: 46, flatten: false },
    { id: "highridge", name: "Highridge", kind: "hills", x: 90, z: 60, radius: 45, flatten: false },
    { id: "barley", name: "Barley Flats", kind: "fields", x: -5, z: 105, radius: 46, flatten: true },
    { id: "hollowstead", name: "Hollowstead", kind: "ruins", x: 5, z: -112, radius: 30, flatten: true },
  ];

  SQ.ROADS = [
    [[-45, 25], [10, -5], [85, -40]],
    [[10, -5], [72, 38]],
    [[-45, 25], [-12, 98], [55, 92], [72, 38]],
    [[-45, 25], [-28, -55], [5, -112]],
  ];

  SQ.DEFAULT_BINDS = {
    forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD",
    sprint: "ShiftLeft", jump: "Space", crouch: "KeyC", reload: "KeyR",
    slot1: "Digit1", slot2: "Digit2", slot3: "Digit3", slot4: "Digit4", slot5: "Digit5",
    build: "KeyQ", buildWall: "KeyZ", buildFloor: "KeyX", buildRamp: "KeyC", buildRoof: "KeyV",
    interact: "KeyE", inventory: "Tab",
  };

  SQ.ACTION_LABELS = {
    forward: "Move forward", back: "Move back", left: "Strafe left", right: "Strafe right",
    sprint: "Sprint", jump: "Jump / open glider", crouch: "Crouch", reload: "Reload",
    slot1: "Slot 1", slot2: "Slot 2", slot3: "Slot 3", slot4: "Slot 4", slot5: "Slot 5",
    build: "Build mode", buildWall: "Wall", buildFloor: "Floor", buildRamp: "Ramp (build mode)", buildRoof: "Roof",
    interact: "Interact / pick up", inventory: "Inventory",
  };
})(window.SQ = window.SQ || {});
