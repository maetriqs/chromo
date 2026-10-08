// Quarry: world constants, the block registry and fast lookup tables. By The_headphones
(function (QY) {
  const CFG = {
    CHUNK: 16,
    HEIGHT: 72,
    WORLD_CHUNKS: 20,
    SEA: 24,
    SNOW_LINE: 50,
    GRAVITY: 28,
    JUMP_SPEED: 8.6,
    WALK: 4.3,
    SPRINT: 5.8,
    SWIM: 2.4,
    PLAYER_WIDTH: 0.6,
    PLAYER_HEIGHT: 1.8,
    EYE: 1.62,
    REACH: 5,
    REACH_CREATIVE: 7,
    DAY_SECONDS: 1200,
    VOID_Y: -30,
    STACK: 64,
    SPAWN_RADIUS: 4,
  };
  CFG.SIZE = CFG.CHUNK * CFG.WORLD_CHUNKS;
  QY.CFG = CFG;

  // Order matters: tiles are painted into the atlas in this order (8 per row).
  QY.TILES = [
    "grass_top", "grass_side", "dirt", "stone", "cobble", "log_side", "log_top", "planks",
    "leaves", "sand", "glass", "brick", "gravel", "snow", "snow_side", "bedrock",
    "coal_ore", "iron_ore", "lamp", "stone_bricks", "bookshelf", "tall_grass", "red_flower", "yellow_flower",
    "wool_white", "wool_red", "wool_blue", "wool_yellow", "wool_green", "sandstone_top", "sandstone_side", "water",
  ];

  // kind: solid (opaque cube), glass (see-through cube), water, plant (crossed sprites)
  const block = (id, key, name, tiles, opts = {}) => ({
    id, key, name,
    top: tiles[0], side: tiles[1] || tiles[0], bottom: tiles[2] || tiles[0],
    kind: opts.kind || "solid",
    hardness: opts.hardness ?? 0.6,
    sound: opts.sound || "stone",
    drop: opts.drop === undefined ? id : opts.drop,
    emit: !!opts.emit,
    palette: opts.palette !== false,
  });

  QY.BLOCKS = [
    null,
    block(1, "grass", "Grass Block", ["grass_top", "grass_side", "dirt"], { hardness: 0.5, sound: "grass", drop: 2 }),
    block(2, "dirt", "Dirt", ["dirt"], { hardness: 0.45, sound: "dirt" }),
    block(3, "stone", "Stone", ["stone"], { hardness: 1.3, drop: 4 }),
    block(4, "cobble", "Cobblestone", ["cobble"], { hardness: 1.5 }),
    block(5, "log", "Oak Log", ["log_top", "log_side", "log_top"], { hardness: 0.9, sound: "wood" }),
    block(6, "planks", "Oak Planks", ["planks"], { hardness: 0.8, sound: "wood" }),
    block(7, "leaves", "Leaves", ["leaves"], { hardness: 0.2, sound: "leaves" }),
    block(8, "sand", "Sand", ["sand"], { hardness: 0.45, sound: "sand" }),
    block(9, "glass", "Glass", ["glass"], { kind: "glass", hardness: 0.3, sound: "glass" }),
    block(10, "brick", "Bricks", ["brick"], { hardness: 1.5 }),
    block(11, "gravel", "Gravel", ["gravel"], { hardness: 0.5, sound: "gravel" }),
    block(12, "snow", "Snowy Grass", ["snow", "snow_side", "dirt"], { hardness: 0.5, sound: "snow", drop: 2 }),
    block(13, "bedrock", "Bedrock", ["bedrock"], { hardness: Infinity, drop: null, palette: false }),
    block(14, "water", "Water", ["water"], { kind: "water", hardness: Infinity, drop: null, palette: false }),
    block(15, "coal", "Coal Ore", ["coal_ore"], { hardness: 1.7 }),
    block(16, "iron", "Iron Ore", ["iron_ore"], { hardness: 1.9 }),
    block(17, "lamp", "Lamp", ["lamp"], { hardness: 0.5, sound: "glass", emit: true }),
    block(18, "stonebrick", "Stone Bricks", ["stone_bricks"], { hardness: 1.5 }),
    block(19, "bookshelf", "Bookshelf", ["planks", "bookshelf", "planks"], { hardness: 0.8, sound: "wood" }),
    block(20, "tallgrass", "Tall Grass", ["tall_grass"], { kind: "plant", hardness: 0, sound: "grass", drop: null }),
    block(21, "rose", "Red Flower", ["red_flower"], { kind: "plant", hardness: 0, sound: "grass" }),
    block(22, "dandelion", "Yellow Flower", ["yellow_flower"], { kind: "plant", hardness: 0, sound: "grass" }),
    block(23, "wool", "White Wool", ["wool_white"], { hardness: 0.4, sound: "cloth" }),
    block(24, "redwool", "Red Wool", ["wool_red"], { hardness: 0.4, sound: "cloth" }),
    block(25, "bluewool", "Blue Wool", ["wool_blue"], { hardness: 0.4, sound: "cloth" }),
    block(26, "yellowwool", "Yellow Wool", ["wool_yellow"], { hardness: 0.4, sound: "cloth" }),
    block(27, "greenwool", "Green Wool", ["wool_green"], { hardness: 0.4, sound: "cloth" }),
    block(28, "sandstone", "Sandstone", ["sandstone_top", "sandstone_side", "sandstone_top"], { hardness: 1.0 }),
  ];

  QY.ID = {};
  QY.BLOCKS.forEach((b) => {
    if (b) QY.ID[b.key] = b.id;
  });

  // Face order used everywhere: +X, -X, +Y, -Y, +Z, -Z.
  const KIND_CODE = { solid: 1, glass: 2, water: 3, plant: 4 };
  QY.KIND = { AIR: 0, SOLID: 1, GLASS: 2, WATER: 3, PLANT: 4 };
  QY.T_KIND = new Uint8Array(256);
  QY.T_OPAQUE = new Uint8Array(256);
  QY.T_SOLID = new Uint8Array(256);
  QY.T_SKY = new Uint8Array(256);
  QY.T_EMIT = new Uint8Array(256);
  QY.T_TARGET = new Uint8Array(256);
  QY.T_FACE = new Uint8Array(256 * 6);

  QY.BLOCKS.forEach((b) => {
    if (!b) return;
    const k = KIND_CODE[b.kind];
    QY.T_KIND[b.id] = k;
    QY.T_OPAQUE[b.id] = k === 1 ? 1 : 0;
    QY.T_SOLID[b.id] = k === 1 || k === 2 ? 1 : 0;
    QY.T_SKY[b.id] = k === 1 ? 1 : 0;
    QY.T_EMIT[b.id] = b.emit ? 1 : 0;
    QY.T_TARGET[b.id] = k === 3 ? 0 : 1;
    const t = (name) => QY.TILES.indexOf(name);
    const faces = [t(b.side), t(b.side), t(b.top), t(b.bottom), t(b.side), t(b.side)];
    faces.forEach((tile, f) => {
      QY.T_FACE[b.id * 6 + f] = tile;
    });
  });

  QY.CREATIVE_HOTBAR = ["grass", "dirt", "stone", "cobble", "planks", "log", "glass", "brick", "lamp"];

  QY.SPLASHES = [
    "Now with lamps!", "Dig sideways, not down.", "100% hand-painted pixels!", "Mind the void.",
    "Also try sand castles!", "Bring a torch. Or a lamp.", "Grass grows on you.", "Every block counts!",
  ];

  QY.CONTROLS = {
    desktop: [
      ["Move", "W A S D"], ["Look", "Mouse"], ["Jump / swim up", "Space"], ["Sprint", "Shift or double-tap W"],
      ["Break block", "Hold left click"], ["Place block", "Right click"], ["Pick block", "Middle click"],
      ["Select block", "1–9 or wheel"], ["Inventory", "E"], ["Drop item", "Q"], ["Debug info", "F3"], ["Pause", "Esc"],
    ],
    touch: [
      ["Move", "Left stick"], ["Look", "Drag on the right"], ["Jump / swim up", "Jump button"],
      ["Break block", "Hold the pick button"], ["Place block", "Tap the block button"],
      ["Select block", "Tap the hotbar"], ["Inventory", "Bag button"], ["Pause", "Top-right button"],
    ],
  };
})(window.QY = window.QY || {});
