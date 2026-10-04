// Squall: menus, settings, key binding, inventory screen and results. By The_headphones
(function (SQ) {
  const $ = (id) => document.getElementById(id);
  const screens = ["loading", "menu", "settings", "controls", "credits", "pause", "inventory", "result"];
  const STATS_KEY = "squall-stats-v1";
  let current = "loading";
  let returnTo = "menu";
  let picked = -1;
  let invRefresh = 0;
  let intentionalUnlock = false;

  function show(name) {
    screens.forEach((s) => {
      $(`screen-${s}`).hidden = s !== name;
    });
    current = name;
  }

  function hideAll() {
    screens.forEach((s) => {
      $(`screen-${s}`).hidden = true;
    });
    current = null;
  }

  function stats() {
    return SQ.U.storageGet(STATS_KEY, { games: 0, wins: 0, best: null });
  }

  function refreshMeta() {
    const s = SQ.Settings.values;
    $("meta-players").textContent = String(s.bots + 1);
    $("meta-skill").textContent = SQ.SKILL_MIX[s.botSkill].label;
    const st = stats();
    $("meta-best").textContent = st.wins ? `${st.wins} ${st.wins === 1 ? "win" : "wins"}` : st.best ? `#${st.best}` : "—";
  }

  function recordResult(place) {
    const st = stats();
    st.games += 1;
    if (place === 1) st.wins += 1;
    if (!st.best || place < st.best) st.best = place;
    SQ.U.storageSet(STATS_KEY, st);
  }

  // ---- Settings ----
  const RANGE_FORMAT = {
    sensitivity: (v) => v.toFixed(2),
    adsSensitivity: (v) => v.toFixed(2),
    fov: (v) => `${v}°`,
    volume: (v) => `${Math.round(v * 100)}%`,
    bots: (v) => String(v),
  };

  function initSettings() {
    Object.keys(RANGE_FORMAT).forEach((key) => {
      const input = $(`set-${key}`);
      const out = $(`out-${key}`);
      input.value = SQ.Settings.get(key);
      out.textContent = RANGE_FORMAT[key](Number(input.value));
      input.addEventListener("input", () => {
        const v = Number(input.value);
        out.textContent = RANGE_FORMAT[key](v);
        SQ.Settings.set(key, v);
      });
    });
    ["invertY", "showFps"].forEach((key) => {
      const input = $(`set-${key}`);
      input.checked = SQ.Settings.get(key);
      input.addEventListener("change", () => SQ.Settings.set(key, input.checked));
    });
    ["quality", "botSkill"].forEach((key) => {
      const input = $(`set-${key}`);
      input.value = SQ.Settings.get(key);
      input.addEventListener("change", () => SQ.Settings.set(key, input.value));
    });
    $("reset-binds").addEventListener("click", () => {
      SQ.Settings.resetBinds();
      renderBinds();
      SQ.Audio.ui();
    });
    renderBinds();
  }

  function renderBinds() {
    const list = $("bind-list");
    list.innerHTML = "";
    Object.entries(SQ.ACTION_LABELS).forEach(([action, label]) => {
      const span = document.createElement("span");
      span.className = "bind-label";
      span.textContent = label;
      const btn = document.createElement("button");
      btn.className = "bind-key";
      btn.type = "button";
      btn.textContent = SQ.Input.keyName(SQ.Settings.values.binds[action]);
      btn.addEventListener("click", () => {
        btn.classList.add("is-capturing");
        btn.textContent = "Press a key";
        SQ.Input.captureKey((code) => {
          if (code) SQ.Settings.setBind(action, code);
          renderBinds();
          renderControls();
        });
      });
      list.append(span, btn);
    });
  }

  function renderControls() {
    const list = $("controls-list");
    const rows = Object.entries(SQ.ACTION_LABELS).map(([action, label]) => [label, SQ.Input.keyName(SQ.Settings.values.binds[action])]);
    rows.push(["Fire / build / use", "Left click"], ["Aim down sights", "Right click"], ["Cycle slots", "Wheel"], ["Pause", "Esc"]);
    list.innerHTML = "";
    rows.forEach(([label, key]) => {
      const row = document.createElement("div");
      const span = document.createElement("span");
      span.textContent = label;
      const kbd = document.createElement("kbd");
      kbd.textContent = key;
      row.append(span, kbd);
      list.appendChild(row);
    });
  }

  // ---- Inventory ----
  function renderInventory() {
    const ch = SQ.Player.state.ch;
    const inv = ch.inventory;
    const list = $("inv-slots");
    list.innerHTML = "";
    inv.slots.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = `inv-slot${i === picked ? " is-picked" : ""}${i === inv.selected ? " is-current" : ""}`;
      li.style.setProperty("--rarity", item ? SQ.Items.color(item) : "rgba(255,255,255,0.1)");
      let meta = "Empty. Your hatchet harvests timber.";
      if (item && item.kind === "weapon") {
        const st = SQ.Weapons.stats(item);
        meta = `${Math.round(st.damage)}${st.pellets > 1 ? `×${st.pellets}` : ""} dmg · ${(1 / st.interval).toFixed(1)}/s · mag ${item.mag}/${st.mag} · ${st.reload.toFixed(1)}s reload`;
      } else if (item) {
        const def = SQ.CONSUMABLES[item.type];
        meta = `${def.kind === "heal" ? "+" + def.amount + " health" : "+" + def.amount + " shield"} up to ${def.cap} · ${def.time}s · ×${item.count}`;
      }
      li.innerHTML = `<span class="inv-key">${i + 1}</span><svg viewBox="0 0 60 24">${item ? SQ.HUD.iconFor(item) : ""}</svg>
        <div><div class="inv-name"></div><div class="inv-rarity"></div><div class="inv-meta"></div></div>`;
      li.querySelector(".inv-name").textContent = item ? SQ.Items.name(item) : "Empty slot";
      li.querySelector(".inv-rarity").textContent = item ? SQ.RARITY[item.rarity].name : "";
      li.querySelector(".inv-meta").textContent = meta;
      if (item) {
        const drop = document.createElement("button");
        drop.className = "inv-drop";
        drop.type = "button";
        drop.textContent = "Drop";
        drop.addEventListener("click", (event) => {
          event.stopPropagation();
          const dropped = inv.removeSlot(i);
          SQ.Loot.spawn(dropped, ch.pos.x, ch.pos.y, ch.pos.z, true);
          ch.refreshHeld();
          SQ.Audio.ui();
          renderInventory();
        });
        li.appendChild(drop);
      }
      li.addEventListener("click", () => {
        if (picked < 0) picked = i;
        else {
          [inv.slots[picked], inv.slots[i]] = [inv.slots[i], inv.slots[picked]];
          picked = -1;
          ch.refreshHeld();
        }
        SQ.Audio.ui();
        renderInventory();
      });
      list.appendChild(li);
    });
    const ammo = $("inv-ammo");
    ammo.innerHTML = "";
    const entries = Object.entries(SQ.AMMO).map(([k, def]) => [def.name, inv.ammo[k]]);
    entries.push(["Timber", inv.mats]);
    entries.forEach(([label, value]) => {
      const div = document.createElement("div");
      div.innerHTML = "<dt></dt><dd></dd>";
      div.querySelector("dt").textContent = label;
      div.querySelector("dd").textContent = String(value);
      ammo.appendChild(div);
    });
    SQ.HUD.drawMap($("bigmap"), true);
  }

  function openInventory() {
    picked = -1;
    intentionalUnlock = true;
    SQ.Input.exitLock();
    show("inventory");
    renderInventory();
  }

  function closeOverlay() {
    hideAll();
    SQ.Input.requestLock();
  }

  function toggleInventory() {
    if (current === "inventory") closeOverlay();
    else if (!current) openInventory();
  }

  function update(dt) {
    if (current === "inventory") {
      invRefresh -= dt;
      if (invRefresh <= 0) {
        invRefresh = 0.5;
        SQ.HUD.drawMap($("bigmap"), true);
      }
    }
  }

  // ---- Results ----
  function showResult({ victory, place, line, elims, damage, time, built }) {
    intentionalUnlock = true;
    SQ.Input.exitLock();
    recordResult(place);
    $("screen-result").classList.toggle("is-defeat", !victory);
    $("result-kicker").textContent = victory ? "Victory" : "Eliminated";
    $("result-place").textContent = `#${place}`;
    $("result-line").textContent = line;
    $("res-elims").textContent = String(elims);
    $("res-damage").textContent = String(Math.round(damage));
    $("res-time").textContent = SQ.U.formatTime(time);
    $("res-built").textContent = String(built);
    show("result");
  }

  function wire() {
    document.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("mouseenter", () => SQ.Audio.ui(true));
      el.addEventListener("click", () => {
        SQ.Audio.init();
        SQ.Audio.ui();
        const action = el.dataset.action;
        if (action === "play" || action === "again") SQ.Game.startMatch();
        else if (action === "settings" || action === "controls" || action === "credits") {
          returnTo = current === "pause" ? "pause" : "menu";
          if (action === "controls") renderControls();
          show(action);
        } else if (action === "resume") closeOverlay();
        else if (action === "quit" || action === "menu") SQ.Game.quitToMenu();
        else if (action === "close-inventory") closeOverlay();
      });
    });
    document.querySelectorAll("[data-back]").forEach((el) => {
      el.addEventListener("click", () => {
        SQ.Audio.ui();
        refreshMeta();
        show(returnTo);
      });
    });

    SQ.Input.onLockChange((locked) => {
      if (locked) {
        intentionalUnlock = false;
        if (current === "pause") hideAll();
        return;
      }
      if (intentionalUnlock || !SQ.Game.inMatch()) return;
      if (!current) {
        show("pause");
        returnTo = "pause";
      }
    });

    window.addEventListener("keydown", (event) => {
      if (!SQ.Game.inMatch()) return;
      if (event.code === SQ.Settings.values.binds.inventory) {
        event.preventDefault();
        if (current === "inventory" || !current) toggleInventory();
      } else if (event.code === "Escape") {
        if (current === "inventory") closeOverlay();
        else if (!current) {
          intentionalUnlock = true;
          SQ.Input.exitLock();
          show("pause");
          returnTo = "pause";
        } else if (current === "pause") closeOverlay();
      }
    });

    $("stage").addEventListener("mousedown", () => {
      if (SQ.Game.inMatch() && !current && !SQ.Input.isLocked()) SQ.Input.requestLock();
    });
  }

  function init() {
    initSettings();
    renderControls();
    wire();
    refreshMeta();
  }

  SQ.Menus = {
    init, show, hideAll, update, toggleInventory, showResult, refreshMeta,
    isOpen: () => current !== null,
    current: () => current,
    setLoading(progress, text) {
      $("loading-fill").style.width = `${Math.round(progress * 100)}%`;
      if (text) $("loading-step").textContent = text;
    },
    openMain() {
      intentionalUnlock = true;
      SQ.Input.exitLock();
      refreshMeta();
      show("menu");
    },
    closeAll() {
      hideAll();
    },
  };
})(window.SQ = window.SQ || {});
