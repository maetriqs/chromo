// Quarry: boot, renderer, screens and states, saving, and the main loop. By The_headphones
(function (QY) {
  const $ = (id) => document.getElementById(id);
  const CFG = QY.CFG;
  const UI = QY.UI;
  const I = QY.Input;
  const P = QY.Player;
  const Inv = QY.Inventory;
  const SAVE_KEY = "quarry-world-v1";

  let renderer = null;
  let scene = null;
  let camera = null;
  let state = "title";
  let settingsReturn = "title";
  let worldReady = false;
  let gen = null;
  let loadPhase = null;
  let loadSave = null;
  let meshTotal = 1;
  let world = { seed: 0, creative: false };
  let dayTime = 0.06;
  let simTime = 0;
  let debugOn = false;
  let saveTimer = 0;
  let pausedAt = 0;
  let lockExpected = false;
  let last = performance.now();
  let fps = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  const underwaterColor = new THREE.Color(0.07, 0.24, 0.52);
  const tmpColor = new THREE.Color();

  const Game = { timeScale: 1 };

  // ---- saving -------------------------------------------------------------------------------
  function readSave() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!data || data.v !== 1 || !Number.isFinite(data.seed)) return null;
      return data;
    } catch {
      return null;
    }
  }

  function saveNow() {
    if (!worldReady) return;
    const p = P.pos;
    const data = {
      v: 1,
      seed: world.seed,
      creative: world.creative,
      time: dayTime,
      savedAt: Date.now(),
      player: { x: p.x, y: p.y, z: p.z, yaw: P.yaw, pitch: P.pitch, health: P.alive ? P.health : 20, flying: P.flying, alive: P.alive },
      inv: Inv.serialize(),
      selected: Inv.selected,
      edits: QY.World.serializeEdits(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      UI.toast("Could not save: browser storage is full or blocked");
    }
  }

  function refreshSaveInfo() {
    const s = readSave();
    if (!s) {
      UI.setHasSave(null);
      return;
    }
    const mins = Math.max(0, Math.round((Date.now() - (s.savedAt || Date.now())) / 60000));
    const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
    UI.setHasSave(`${s.creative ? "Creative" : "Survival"} · seed ${s.seed} · saved ${ago}`);
  }

  // ---- settings -----------------------------------------------------------------------------
  function applySettings() {
    const s = UI.settings;
    QY.Chunks.setRadius(s.renderDistance);
    P.fov = s.fov;
    P.sensitivity = s.sensitivity;
    P.invertY = s.invertY;
    P.bobbing = s.bobbing;
    P.autoJump = s.autoJump;
    QY.Audio.setVolume(s.volume);
    QY.Audio.setMusic(s.music);
    QY.Sky.setCloudsVisible(s.clouds);
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * s.resolution);
      resize();
    }
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    QY.Hand.resize(w / h);
  }

  // ---- states -------------------------------------------------------------------------------
  function unloadWorld() {
    worldReady = false;
    QY.Chunks.reset();
    QY.Drops.clear();
    QY.Effects.clear();
    I.setPlaying(false);
    QY.Audio.setMusicActive(false);
  }

  function startLoading(seed, creative, save) {
    unloadWorld();
    world = { seed, creative };
    loadSave = save;
    gen = QY.World.generator(seed, save);
    loadPhase = "gen";
    state = "loading";
    UI.setLoading("Shaping the land", 0);
    UI.show("loading");
  }

  function setupPlayer() {
    const save = loadSave;
    P.resetState();
    P.creative = world.creative;
    if (save && Array.isArray(save.inv)) Inv.load(save.inv, world.creative);
    else Inv.reset(world.creative);
    if (save && Number.isInteger(save.selected)) Inv.select(save.selected);
    const p = save && save.player;
    if (p && [p.x, p.y, p.z].every(Number.isFinite) && p.alive !== false && p.y > CFG.VOID_Y + 5) {
      P.placeAt(p.x, p.y, p.z, Number(p.yaw) || 0, Number(p.pitch) || 0);
      P.health = Math.max(1, Math.min(20, Number(p.health) || 20));
      P.flying = !!(world.creative && p.flying);
    } else {
      P.respawn();
    }
    dayTime = save && Number.isFinite(save.time) ? save.time % 1 : 0.06;
    QY.Chunks.setRadius(UI.settings.renderDistance);
    QY.Chunks.update(P.pos.x, P.pos.z, 0);
    meshTotal = Math.max(1, QY.Chunks.pendingNear(P.pos.x, P.pos.z, 2));
  }

  function stepLoading() {
    if (loadPhase === "gen") {
      const r = gen.step(16);
      UI.setLoading(r.label, r.progress * 0.85);
      if (r.done) {
        setupPlayer();
        loadPhase = "mesh";
        UI.setLoading("Building the view", 0.85);
      }
    } else if (loadPhase === "mesh") {
      QY.Chunks.update(P.pos.x, P.pos.z, 16);
      const left = QY.Chunks.pendingNear(P.pos.x, P.pos.z, 2);
      UI.setLoading("Building the view", 0.85 + 0.15 * (1 - left / meshTotal));
      if (left === 0) {
        loadPhase = null;
        worldReady = true;
        saveTimer = 0;
        state = "controls";
        UI.buildControls(I.isTouch());
        $("btn-start").textContent = "Start playing";
        UI.show("controls");
        UI.refreshHotbar();
      }
    }
  }

  function enterPlay() {
    // A menu button keeping focus would turn the next Space press into a click.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state = "playing";
    UI.show(null, true);
    I.setPlaying(true);
    QY.Audio.unlock();
    QY.Audio.setMusicActive(true);
    if (!I.isTouch() && !I.usingFallback()) I.requestLock();
  }

  function pauseGame() {
    if (state === "inventory") Inv.returnCursor(dropSpot());
    state = "paused";
    pausedAt = performance.now();
    I.setPlaying(false);
    if (I.isLocked()) {
      lockExpected = true;
      I.exitLock();
    }
    UI.show("pause", true);
    saveNow();
  }

  function openInventory() {
    state = "inventory";
    I.setPlaying(false);
    if (I.isLocked()) {
      lockExpected = true;
      I.exitLock();
    }
    UI.refreshInventory();
    UI.show("inventory", true);
  }

  function closeInventory() {
    Inv.returnCursor(dropSpot());
    enterPlay();
  }

  function die(reason) {
    Inv.returnCursor(dropSpot());
    state = "dead";
    I.setPlaying(false);
    if (I.isLocked()) {
      lockExpected = true;
      I.exitLock();
    }
    UI.setDeath(reason);
    UI.show("death", true);
  }

  function dropSpot() {
    return { x: P.pos.x, y: P.pos.y + 1.2, z: P.pos.z };
  }

  // reason "error" means a lock request was refused: stay in the game and show the click hint.
  function onLock(locked, reason) {
    if (locked || reason === "error") return;
    if (lockExpected) {
      lockExpected = false;
      return;
    }
    // Esc released the mouse while playing: open the pause menu, like the original.
    if (state === "playing" && !I.usingFallback()) pauseGame();
  }

  const handlers = {
    continueWorld() {
      const save = readSave();
      if (save) startLoading(save.seed | 0, !!save.creative, save);
    },
    openNew() {
      state = "new";
      UI.show("new");
    },
    backToTitle() {
      state = "title";
      refreshSaveInfo();
      UI.show("title");
    },
    createWorld(seedText, creative) {
      const text = String(seedText || "").trim();
      const seed = text ? QY.Noise.seedFrom(text) : Math.floor(Math.random() * 2147483647);
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        /* ignore */
      }
      startLoading(seed, creative, null);
    },
    startPlaying: enterPlay,
    resume: enterPlay,
    showControls() {
      state = "controls";
      UI.buildControls(I.isTouch());
      $("btn-start").textContent = "Back to game";
      UI.show("controls");
    },
    openSettings(from) {
      settingsReturn = from;
      state = "settings";
      UI.show("settings");
    },
    closeSettings() {
      if (settingsReturn === "pause") {
        state = "paused";
        UI.show("pause", true);
      } else {
        state = "title";
        UI.show("title");
      }
    },
    saveAndQuit() {
      saveNow();
      unloadWorld();
      state = "title";
      refreshSaveInfo();
      UI.show("title");
    },
    closeInventory,
    toggleInventory() {
      if (state === "playing") openInventory();
      else if (state === "inventory") closeInventory();
    },
    pause() {
      if (state === "playing" || state === "inventory") pauseGame();
    },
    respawn() {
      P.respawn();
      enterPlay();
    },
    craft(recipe) {
      if (QY.Crafting.craft(recipe, dropSpot())) QY.Audio.pop();
    },
    settingsChanged() {
      applySettings();
    },
  };

  // ---- per-frame ------------------------------------------------------------------------------
  function handleKeys() {
    if (state === "playing") {
      for (let i = 1; i <= 9; i++) if (I.pressed(`Digit${i}`)) Inv.select(i - 1);
      const w = I.consumeWheel();
      if (w) Inv.select(Inv.selected + w);
      if (I.pressed("KeyE")) openInventory();
      else if (I.pressed("Escape") && !I.isLocked()) pauseGame();
    } else if (state === "inventory") {
      I.consumeWheel();
      if (I.pressed("KeyE") || I.pressed("Escape")) closeInventory();
    } else if (state === "paused") {
      if (I.pressed("Escape") && performance.now() - pausedAt > 350) enterPlay();
    }
    if (I.pressed("F3") && worldReady) debugOn = !debugOn;
  }

  function handleEvents() {
    while (P.events.length) {
      const e = P.events.shift();
      if (e.type === "death" && state !== "dead") die(e.reason);
      else if (e.type === "void") UI.toast("You fell out of the world. Back to spawn.");
      else if (e.type === "fly") UI.toast(e.on ? "Flying: hold jump to rise, Shift to sink" : "Flying off");
    }
  }

  const FACING = ["north (−Z)", "west (−X)", "south (+Z)", "east (+X)"];
  function debugLines() {
    const p = P.pos;
    const bx = Math.floor(p.x);
    const by = Math.floor(p.y);
    const bz = Math.floor(p.z);
    const st = QY.Chunks.stats();
    const yaw = ((P.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = FACING[Math.round(yaw / (Math.PI / 2)) % 4];
    const minutes = Math.floor(((dayTime + 0.25) % 1) * 24 * 60);
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const t = P.target;
    return [
      `Quarry · ${fps} fps`,
      `XYZ ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Block ${bx} ${by} ${bz} · chunk ${Math.floor(bx / 16)} ${Math.floor(bz / 16)}`,
      `Facing ${facing}`,
      `Light sky ${QY.World.skyAt(bx, by + 1, bz).toFixed(2)} · lamp ${QY.World.lightAt(bx, by + 1, bz)}`,
      `Target ${t ? `${QY.BLOCKS[t.id].name} at ${t.x} ${t.y} ${t.z}` : "none"}`,
      `Chunks ${st.built}/${st.loaded} built · ${st.pending} queued · ${Math.round(st.faces / 1000)}k faces`,
      `Draw calls ${renderer.info.render.calls} · items ${QY.Drops.count()}`,
      `Time ${clock} · seed ${world.seed} · ${world.creative ? "Creative" : "Survival"}`,
    ];
  }

  function tick(dt) {
    const simulate = state === "playing" || state === "inventory" || state === "dead";
    const active = state === "playing" && (I.isTouch() || I.isLocked() || I.usingFallback());
    handleKeys();
    if (simulate) {
      simTime += dt;
      dayTime = (dayTime + dt / CFG.DAY_SECONDS) % 1;
      P.update(dt, I, active);
      QY.Drops.update(dt, P);
    } else {
      I.consumeLook();
    }
    handleEvents();

    P.applyCamera(camera, simulate ? dt : 0);
    QY.Sky.update(simulate ? dt : 0, camera, dayTime);
    QY.Effects.update(simulate ? dt : 0);
    const target = active ? P.target : null;
    QY.Effects.setTarget(target, target && QY.T_KIND[target.id] === QY.KIND.PLANT);
    QY.Effects.setCrack(P.mining, P.mining ? P.mining.progress : 0);

    const u = QY.Chunks.uniforms;
    const sky = QY.Sky.state;
    u.daylight.value = sky.daylight;
    u.skyColor.value.copy(sky.skyLight);
    u.time.value += dt;
    const far = QY.Chunks.getRadius() * 16 - 6;
    if (P.headInWater) {
      tmpColor.copy(underwaterColor).multiplyScalar(0.3 + 0.7 * sky.daylight);
      u.fogColor.value.copy(tmpColor);
      u.fogNear.value = 0;
      u.fogFar.value = Math.min(far, 15);
      u.tint.value.setRGB(0.42, 0.62, 1);
      QY.Sky.setOverride(tmpColor);
    } else {
      u.tint.value.setRGB(1, 1, 1);
      u.fogColor.value.copy(sky.horizon);
      u.fogNear.value = far * 0.55;
      u.fogFar.value = far;
      QY.Sky.setOverride(null);
    }

    QY.Chunks.update(P.pos.x, P.pos.z, state === "playing" ? 5 : 10);

    const e = P.eye();
    const ex = Math.floor(e.x);
    const ey = Math.floor(e.y);
    const ez = Math.floor(e.z);
    QY.Hand.setItem(Inv.selectedId());
    QY.Hand.update(simulate ? dt : 0, P.speed, P.onGround, QY.World.skyAt(ex, ey, ez), QY.World.lightAt(ex, ey, ez), P.bobbing);

    renderer.info.reset();
    renderer.render(scene, camera);
    if (P.alive) QY.Hand.render(renderer);

    UI.updateHUD(dt, P);
    UI.setDebug(debugOn ? debugLines() : null, dt);
    UI.setHidden("lock-hint", !(state === "playing" && !I.isTouch() && !I.isLocked() && !I.usingFallback() && !I.lockPending()));
    QY.Audio.update(sky.night);

    if (simulate) {
      saveTimer += dt;
      if (saveTimer > 45) {
        saveTimer = 0;
        saveNow();
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const raw = Math.max(0, (now - last) / 1000);
    last = now;
    fpsFrames++;
    fpsTime += raw;
    if (fpsTime >= 0.5) {
      fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
    }
    const dt = Math.min(0.05, raw) * Game.timeScale;
    if (state === "loading") stepLoading();
    else if (worldReady) tick(dt);
    I.endFrame();
  }

  // ---- boot ---------------------------------------------------------------------------------
  function webglError(detail) {
    state = "error";
    UI.show("error");
    if (detail) $("error-detail").textContent = detail;
  }

  function boot() {
    UI.init(handlers);
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    } catch (err) {
      webglError("This browser could not start WebGL, which Quarry needs to draw the world.");
      return;
    }
    if (!renderer.getContext()) {
      webglError();
      return;
    }
    renderer.info.autoReset = false;
    renderer.setClearColor(0x000000);
    $("stage").appendChild(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1000);
    QY.Chunks.init(scene);
    QY.Sky.init(scene);
    QY.Effects.init(scene);
    QY.Drops.init(scene);
    QY.Hand.init(window.innerWidth / window.innerHeight);
    I.init(renderer.domElement, {
      moveZone: $("move-zone"),
      stick: $("stick"),
      knob: $("stick-knob"),
      lookZone: $("look-zone"),
      jump: $("t-jump"),
      breakButton: $("t-break"),
      place: $("t-place"),
      descend: $("t-down"),
    });
    I.onLockChange(onLock);
    I.onTouchMode(() => {
      UI.buildControls(true);
      UI.refreshInventory();
    });
    applySettings();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      if (state === "playing" || state === "inventory") pauseGame();
      else saveNow();
    });
    window.addEventListener("pagehide", saveNow);
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      saveNow();
      webglError("The graphics context was lost. Your world was saved; reload the page to keep playing.");
    });
    refreshSaveInfo();
    UI.show("title");
    requestAnimationFrame(frame);
  }

  // Hooks for automated tests and the curious.
  Game.state = () => state;
  Game.simTime = () => simTime;
  Game.dayTime = () => dayTime;
  Game.setDayTime = (t) => {
    dayTime = ((t % 1) + 1) % 1;
  };
  Game.save = saveNow;
  Game.world = () => world;
  QY.Game = Game;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.QY = window.QY || {});
