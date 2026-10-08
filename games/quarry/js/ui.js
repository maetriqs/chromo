// Quarry: HUD, hotbar, inventory and crafting screen, settings and menu screens. By The_headphones
(function (QY) {
  const $ = (id) => document.getElementById(id);
  const Inv = QY.Inventory;
  const T = QY.Textures;

  // ---- settings ---------------------------------------------------------------------------
  const SETTINGS_KEY = "quarry-settings-v1";
  const coarse = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const ROWS = [
    { key: "renderDistance", label: "Render distance", min: 2, max: 8, step: 1, fmt: (v) => `${v} chunks` },
    { key: "fov", label: "Field of view", min: 50, max: 100, step: 5, fmt: (v) => `${v}°` },
    { key: "sensitivity", label: "Look speed", min: 0.2, max: 3, step: 0.1, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: "resolution", label: "Resolution", min: 0.5, max: 1, step: 0.125, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: "volume", label: "Volume", min: 0, max: 1, step: 0.1, fmt: (v) => (v > 0 ? `${Math.round(v * 100)}%` : "Off") },
    { key: "music", label: "Music", toggle: true },
    { key: "clouds", label: "Clouds", toggle: true },
    { key: "bobbing", label: "View bobbing", toggle: true },
    { key: "autoJump", label: "Auto-jump", toggle: true },
    { key: "invertY", label: "Invert look", toggle: true },
  ];
  const DEFAULTS = {
    renderDistance: coarse ? 3 : 4,
    fov: 70,
    sensitivity: 1,
    resolution: 1,
    volume: 0.7,
    music: true,
    clouds: true,
    bobbing: true,
    autoJump: coarse,
    invertY: false,
  };
  const settings = Object.assign({}, DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    ROWS.forEach((row) => {
      const v = saved[row.key];
      if (row.toggle && typeof v === "boolean") settings[row.key] = v;
      else if (!row.toggle && typeof v === "number" && v >= row.min && v <= row.max) settings[row.key] = v;
    });
  } catch {
    /* storage unavailable: defaults */
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }

  // ---- screens ------------------------------------------------------------------------------
  const SCREENS = ["title", "new", "loading", "controls", "pause", "settings", "inventory", "death", "error"];
  let handlers = {};
  let current = "title";

  // name: a screen id, or null while playing. hud: keep the game HUD visible underneath.
  function show(name, hud = false) {
    current = name;
    SCREENS.forEach((s) => {
      const el = $(`screen-${s}`);
      if (el) el.hidden = s !== name;
    });
    $("hud").hidden = !hud;
    $("crosshair").hidden = !hud;
    document.body.dataset.screen = name || "play";
    hideTooltip();
    const focusable = name && $(`screen-${name}`) && $(`screen-${name}`).querySelector("[data-autofocus]");
    if (focusable && !document.body.classList.contains("touch")) focusable.focus({ preventScroll: true });
  }

  // ---- HUD ----------------------------------------------------------------------------------
  const slotEls = [];
  const heartEls = [];
  const bubbleEls = [];
  let lastSelected = -1;
  let lastSelectedId = -1;
  let nameTimer = 0;

  function slotButton(className) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    const count = document.createElement("span");
    count.className = "count";
    b.append(img, count);
    return b;
  }

  function paintSlot(el, stack, creative) {
    const img = el.firstChild;
    const count = el.lastChild;
    if (stack) {
      const src = T.blockIcon(stack.id);
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      img.hidden = false;
      count.textContent = !creative && stack.count > 1 ? stack.count : "";
      el.dataset.name = QY.BLOCKS[stack.id].name;
      el.setAttribute("aria-label", `${QY.BLOCKS[stack.id].name}${!creative && stack.count > 1 ? `, ${stack.count}` : ""}`);
    } else {
      img.hidden = true;
      img.removeAttribute("src");
      count.textContent = "";
      el.dataset.name = "";
      el.setAttribute("aria-label", "Empty slot");
    }
  }

  function buildHUD() {
    const bar = $("hotbar");
    for (let i = 0; i < 9; i++) {
      const b = slotButton("slot");
      b.setAttribute("role", "option");
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        Inv.select(i);
      });
      bar.appendChild(b);
      slotEls.push(b);
    }
    for (let i = 0; i < 10; i++) {
      const h = document.createElement("i");
      $("hearts").appendChild(h);
      heartEls.push(h);
      const o = document.createElement("i");
      $("bubbles").appendChild(o);
      bubbleEls.push(o);
    }
  }

  function refreshHotbar() {
    for (let i = 0; i < 9; i++) {
      paintSlot(slotEls[i], Inv.slots[i], Inv.creative);
      slotEls[i].classList.toggle("selected", i === Inv.selected);
      slotEls[i].setAttribute("aria-selected", i === Inv.selected ? "true" : "false");
    }
    const id = Inv.selectedId();
    if (Inv.selected !== lastSelected || id !== lastSelectedId) {
      if (id && (lastSelected !== -1 || lastSelectedId !== -1)) {
        $("item-name").textContent = QY.BLOCKS[id].name;
        $("item-name").classList.add("on");
        nameTimer = 2;
      } else if (!id) $("item-name").classList.remove("on");
      lastSelected = Inv.selected;
      lastSelectedId = id;
    }
    const icon = id ? T.blockIcon(id) : "";
    const place = $("t-place-icon");
    if (place && place.getAttribute("src") !== icon) {
      if (icon) place.setAttribute("src", icon);
      else place.removeAttribute("src");
      place.hidden = !icon;
    }
  }

  let lastHealth = -1;
  let lastAir = -1;
  let lastHurt = "";
  const hud = {};
  // Only touch the DOM when a value actually changes; this runs every frame.
  function setHidden(id, value) {
    const el = hud[id] || (hud[id] = $(id));
    if (el.hidden !== value) el.hidden = value;
  }

  function updateHUD(dt, player) {
    if (nameTimer > 0) {
      nameTimer -= dt;
      if (nameTimer <= 0) $("item-name").classList.remove("on");
    }
    const survival = !player.creative;
    setHidden("status", !survival);
    if (survival) {
      const hp = Math.ceil(player.health);
      if (hp !== lastHealth) {
        heartEls.forEach((h, i) => {
          const v = hp - i * 2;
          h.className = v >= 2 ? "full" : v === 1 ? "half" : "empty";
        });
        $("hearts").classList.toggle("low", hp <= 6);
        lastHealth = hp;
      }
      const air = Math.ceil((player.air / player.MAX_AIR) * 10);
      const showAir = player.headInWater || player.air < player.MAX_AIR - 0.01;
      setHidden("bubbles", !showAir);
      if (showAir && air !== lastAir) {
        bubbleEls.forEach((b, i) => (b.className = i < air ? "on" : "off"));
        lastAir = air;
      }
    }
    const hurt = player.hurtFlash.toFixed(2);
    if (hurt !== lastHurt) {
      $("hurt").style.opacity = hurt;
      lastHurt = hurt;
    }
    setHidden("t-down", !player.flying);
  }

  function toast(text) {
    const box = $("toasts");
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.classList.add("out"), 2200);
    setTimeout(() => t.remove(), 2700);
  }

  let debugTimer = 0;
  function setDebug(lines, dt = 0) {
    setHidden("debug", !lines);
    if (!lines) return;
    // Refresh the text a few times a second; rewriting it every frame is wasted layout work.
    debugTimer -= dt;
    if (debugTimer > 0) return;
    debugTimer = 0.2;
    $("debug").textContent = lines.join("\n");
  }

  // ---- inventory screen ----------------------------------------------------------------------
  let invBuilt = false;
  const invMain = [];
  const invHot = [];
  const paletteEls = [];
  const craftEls = [];

  function slotPointer(el, index) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (Inv.creative) {
        if (index < 9) Inv.select(index);
        return;
      }
      Inv.clickSlot(index, e.button === 2 ? 2 : 0, e.shiftKey);
      QY.Audio.click();
      moveCursor(e.clientX, e.clientY);
    });
  }

  function buildInventory() {
    if (invBuilt) return;
    invBuilt = true;
    for (let i = 9; i < 36; i++) {
      const b = slotButton("slot inv-slot");
      slotPointer(b, i);
      $("inv-main").appendChild(b);
      invMain.push(b);
    }
    for (let i = 0; i < 9; i++) {
      const b = slotButton("slot inv-slot");
      slotPointer(b, i);
      $("inv-hot").appendChild(b);
      invHot.push(b);
    }
    QY.BLOCKS.forEach((b) => {
      if (!b || !b.palette) return;
      const el = slotButton("slot inv-slot");
      paintSlot(el, { id: b.id, count: 1 }, true);
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        Inv.assignCreative(b.id);
        QY.Audio.click();
      });
      $("palette").appendChild(el);
      paletteEls.push(el);
    });
    QY.Crafting.RECIPES.forEach((r) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "recipe";
      const out = document.createElement("span");
      out.className = "recipe-out";
      out.innerHTML = `<img alt="" src="${T.blockIcon(r.out)}"><b>${r.count > 1 ? `${r.count}× ` : ""}${QY.BLOCKS[r.out].name}</b>`;
      const need = document.createElement("span");
      need.className = "recipe-need";
      need.textContent = `from ${r.need.map(([id, n]) => `${n} ${QY.BLOCKS[id].name}`).join(" + ")}`;
      row.append(out, need);
      row.addEventListener("click", () => {
        if (handlers.craft) handlers.craft(r);
      });
      $("recipes").appendChild(row);
      craftEls.push({ row, r });
    });
    const screen = $("screen-inventory");
    screen.addEventListener("contextmenu", (e) => e.preventDefault());
    screen.addEventListener("pointermove", (e) => {
      moveCursor(e.clientX, e.clientY);
      const slot = e.target.closest && e.target.closest(".slot");
      if (slot && slot.dataset.name && e.pointerType === "mouse") showTooltip(slot.dataset.name, e.clientX, e.clientY);
      else hideTooltip();
    });
    screen.addEventListener("pointerleave", hideTooltip);
  }

  function moveCursor(x, y) {
    const c = $("cursor-stack");
    c.style.transform = `translate(${x - 22}px, ${y - 22}px)`;
  }

  function showTooltip(text, x, y) {
    const t = $("tooltip");
    t.textContent = text;
    t.hidden = false;
    t.style.transform = `translate(${x + 14}px, ${y - 30}px)`;
  }
  function hideTooltip() {
    const t = $("tooltip");
    if (t) t.hidden = true;
  }

  function refreshInventory() {
    if (!invBuilt) return;
    const creative = Inv.creative;
    $("inv-title").textContent = creative ? "Creative blocks" : "Inventory";
    $("inv-help").textContent = creative
      ? "Pick a hotbar slot below, then choose a block to put in it."
      : document.body.classList.contains("touch")
        ? "Tap a stack to pick it up, tap another slot to put it down."
        : "Click to move stacks. Right click splits a stack, shift-click moves it across.";
    $("palette-wrap").hidden = !creative;
    $("pack-wrap").hidden = creative;
    $("craft-wrap").hidden = creative;
    invMain.forEach((el, i) => paintSlot(el, Inv.slots[i + 9], false));
    invHot.forEach((el, i) => {
      paintSlot(el, Inv.slots[i], creative);
      el.classList.toggle("selected", i === Inv.selected);
    });
    const c = Inv.cursor;
    const cur = $("cursor-stack");
    cur.hidden = !c;
    if (c) {
      cur.firstChild.src = T.blockIcon(c.id);
      cur.lastChild.textContent = c.count > 1 ? c.count : "";
    }
    // Recipes you can make right now float to the top of the list.
    craftEls.forEach(({ row, r }) => {
      const ok = QY.Crafting.canCraft(r);
      row.disabled = !ok;
      row.classList.toggle("ready", ok);
      row.style.order = ok ? "0" : "1";
    });
  }

  // ---- settings screen ------------------------------------------------------------------------
  function buildSettings() {
    const list = $("settings-list");
    list.textContent = "";
    ROWS.forEach((row) => {
      const wrap = document.createElement("div");
      wrap.className = "setting";
      const label = document.createElement("span");
      label.className = "setting-label";
      label.textContent = row.label;
      wrap.appendChild(label);
      if (row.toggle) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mc-btn small toggle";
        const paint = () => {
          b.textContent = settings[row.key] ? "On" : "Off";
          b.setAttribute("aria-pressed", settings[row.key] ? "true" : "false");
        };
        paint();
        b.setAttribute("aria-label", row.label);
        b.addEventListener("click", () => {
          settings[row.key] = !settings[row.key];
          paint();
          changed(row.key);
        });
        wrap.appendChild(b);
      } else {
        const minus = document.createElement("button");
        const plus = document.createElement("button");
        const value = document.createElement("output");
        minus.type = plus.type = "button";
        minus.className = plus.className = "mc-btn small step";
        minus.textContent = "−";
        plus.textContent = "+";
        minus.setAttribute("aria-label", `Lower ${row.label.toLowerCase()}`);
        plus.setAttribute("aria-label", `Raise ${row.label.toLowerCase()}`);
        const paint = () => {
          value.textContent = row.fmt(settings[row.key]);
          minus.disabled = settings[row.key] <= row.min + 1e-9;
          plus.disabled = settings[row.key] >= row.max - 1e-9;
        };
        const nudge = (dir) => {
          const v = Math.round((settings[row.key] + dir * row.step) / row.step) * row.step;
          settings[row.key] = Math.min(row.max, Math.max(row.min, Number(v.toFixed(3))));
          paint();
          changed(row.key);
        };
        minus.addEventListener("click", () => nudge(-1));
        plus.addEventListener("click", () => nudge(1));
        paint();
        wrap.append(minus, value, plus);
      }
      list.appendChild(wrap);
    });
  }

  function changed(key) {
    saveSettings();
    QY.Audio.click();
    if (handlers.settingsChanged) handlers.settingsChanged(key);
  }

  function buildControls(touch) {
    const list = $("controls-list");
    list.textContent = "";
    QY.CONTROLS[touch ? "touch" : "desktop"].forEach(([action, key]) => {
      const dt = document.createElement("dt");
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.textContent = action;
      list.append(dt, dd);
    });
  }

  // ---- wiring --------------------------------------------------------------------------------
  function init(h) {
    handlers = h;
    document.documentElement.style.setProperty("--dirt", `url(${T.backgrounds.dirt})`);
    document.documentElement.style.setProperty("--stone", `url(${T.backgrounds.stone})`);
    document.documentElement.style.setProperty("--heart", `url(${T.icons.heart})`);
    document.documentElement.style.setProperty("--heart-half", `url(${T.icons.heartHalf})`);
    document.documentElement.style.setProperty("--heart-empty", `url(${T.icons.heartEmpty})`);
    document.documentElement.style.setProperty("--bubble", `url(${T.icons.bubble})`);
    $("splash").textContent = QY.SPLASHES[Math.floor(Math.random() * QY.SPLASHES.length)];
    buildHUD();
    buildInventory();
    buildSettings();
    buildControls(document.body.classList.contains("touch"));
    Inv.onChange(() => {
      refreshHotbar();
      refreshInventory();
    });

    const click = (id, fn) => {
      const el = $(id);
      if (el) {
        el.addEventListener("click", (e) => {
          QY.Audio.unlock();
          QY.Audio.click();
          fn(e);
        });
      }
    };
    click("btn-continue", () => handlers.continueWorld());
    click("btn-new", () => handlers.openNew());
    click("btn-settings", () => handlers.openSettings("title"));
    click("btn-new-back", () => handlers.backToTitle());
    click("btn-create", () => handlers.createWorld($("seed-input").value, $("mode-creative").getAttribute("aria-pressed") === "true"));
    click("btn-start", () => handlers.startPlaying());
    click("btn-resume", () => handlers.resume());
    click("btn-pause-controls", () => handlers.showControls());
    click("btn-pause-settings", () => handlers.openSettings("pause"));
    click("btn-save-quit", () => handlers.saveAndQuit());
    click("btn-settings-done", () => handlers.closeSettings());
    click("btn-inv-close", () => handlers.closeInventory());
    click("btn-respawn", () => handlers.respawn());
    click("btn-death-title", () => handlers.saveAndQuit());
    click("menu-btn", () => handlers.pause());
    click("t-bag", () => handlers.toggleInventory());
    ["mode-survival", "mode-creative"].forEach((id) => {
      click(id, () => {
        const creative = id === "mode-creative";
        $("mode-creative").setAttribute("aria-pressed", creative ? "true" : "false");
        $("mode-survival").setAttribute("aria-pressed", creative ? "false" : "true");
        $("mode-note").textContent = creative
          ? "Every block, unlimited. Break instantly. Double-tap jump to fly."
          : "Mine blocks to collect them and craft new ones. Watch your hearts.";
      });
    });
    $("seed-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("btn-create").click();
    });
  }

  function setLoading(label, progress) {
    $("loading-label").textContent = label;
    $("loading-bar").style.transform = `scaleX(${Math.max(0.02, Math.min(1, progress)).toFixed(3)})`;
  }

  function setHasSave(info) {
    $("btn-continue").hidden = !info;
    $("save-note").textContent = info ? info : "";
    $("overwrite-warn").hidden = !info;
  }

  QY.UI = {
    init,
    show,
    current: () => current,
    settings,
    saveSettings,
    refreshHotbar,
    refreshInventory,
    updateHUD,
    toast,
    setDebug,
    setHidden,
    setLoading,
    setHasSave,
    buildControls,
    setDeath(reason) {
      $("death-reason").textContent = `You ${reason}.`;
    },
  };
})(window.QY = window.QY || {});
