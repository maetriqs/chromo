// Squall: heads-up display, minimap, kill feed and feedback. By The_headphones
(function (SQ) {
  const { U } = SQ;
  const $ = (id) => document.getElementById(id);
  const MAP_EXTENT = 185;

  const ICONS = {
    ar: '<path d="M2 9h34V6h6v3h16v4H42v2h-6l-2 7h-5l1-7H14l-4 6H4l3-6H2z"/>',
    smg: '<path d="M6 8h30V6h4v2h12v4H40v3h-6v8h-5v-8H18v3h-6v-3H6z"/>',
    pistol: '<path d="M14 6h32v6H30l-2 3h-4l-2 9h-7l2-9h-3z"/>',
    shotgun: '<path d="M2 10h56v4H34v2H24l-3 5h-6l2-5H8l-3 4H1l2-4z"/>',
    sniper: '<path d="M1 11h58v3H38l-3 3H14l-4 5H4l3-5H1zM22 5h14v4H22z"/>',
    hatchet: '<path d="M8 13h34v3H8zM40 5h10v14h-6v-6h-4z"/>',
    heal: '<path d="M26 2h8v7h8v7h-8v6h-8v-6h-8V9h8z"/>',
    shield: '<path d="M30 1l10 4v8c0 5-5 9-10 10-5-1-10-5-10-10V5z"/>',
  };
  const PIECE_ICONS = {
    wall: '<rect x="8" y="6" width="24" height="28"/>',
    floor: '<path d="M4 26l12-12h20L24 26z"/>',
    ramp: '<path d="M5 33L33 7M5 33h28V7"/>',
    roof: '<path d="M4 30L20 10l16 20z"/>',
  };
  const PIECE_KEYS = { wall: "buildWall", floor: "buildFloor", ramp: "buildRamp", roof: "buildRoof" };

  function iconFor(item) {
    if (!item) return ICONS.hatchet;
    if (item.kind === "weapon") return ICONS[item.type];
    return SQ.CONSUMABLES[item.type].kind === "shield" ? ICONS.shield : ICONS.heal;
  }

  const els = {};
  const last = {};
  let mapBase = null;
  let mapT = 0;
  let pings = [];
  let hitT = 0;
  let damageT = 0;
  let structT = 0;
  let announceT = 0;
  let kick = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;

  function init() {
    [
      "hud", "crosshair", "hitmarker", "prompt", "prompt-key", "prompt-verb", "prompt-label", "prompt-rarity",
      "progress", "progress-label", "announce", "toast-stack", "killfeed", "minimap", "storm-timer", "storm-label",
      "alive-count", "elim-count", "shield-bar", "health-bar", "shield-num", "health-num", "mats-count",
      "weapon-name", "ammo-mag", "ammo-reserve", "hotbar", "buildbar", "storm-vignette", "damage-vignette",
      "scope", "dmg-indicators", "structure-bar", "fps", "spectate", "lock-hint", "ammo",
    ].forEach((id) => {
      els[id] = $(id);
    });
    els.progressFill = els.progress.querySelector(".fill");
    els.shieldFill = els["shield-bar"].querySelector("span");
    els.healthFill = els["health-bar"].querySelector("span");
    els.structFill = els["structure-bar"].querySelector("span");
    buildMapBase();
  }

  function setText(key, el, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function toMap(x, z, size) {
    return [((x + MAP_EXTENT) / (MAP_EXTENT * 2)) * size, ((z + MAP_EXTENT) / (MAP_EXTENT * 2)) * size];
  }

  function buildMapBase() {
    const size = 360;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const img = g.createImageData(size, size);
    const col = new THREE.Color();
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = (px / size) * MAP_EXTENT * 2 - MAP_EXTENT;
        const z = (py / size) * MAP_EXTENT * 2 - MAP_EXTENT;
        SQ.Terrain.mapColor(x, z, col);
        const i = (py * size + px) * 4;
        img.data[i] = col.r * 255;
        img.data[i + 1] = col.g * 255;
        img.data[i + 2] = col.b * 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    SQ.World.footprints.forEach((f) => {
      const [x0, y0] = toMap(f.x - f.hw, f.z - f.hd, size);
      const [x1, y1] = toMap(f.x + f.hw, f.z + f.hd, size);
      g.fillStyle = "rgba(20, 24, 28, 0.55)";
      g.fillRect(x0 + 1, y0 + 1, x1 - x0, y1 - y0);
      g.fillStyle = f.color;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    });
    mapBase = c;
  }

  function drawMap(canvas, labels) {
    const g = canvas.getContext("2d");
    const size = canvas.width;
    g.clearRect(0, 0, size, size);
    g.drawImage(mapBase, 0, 0, size, size);
    const s = SQ.Storm.state;
    const k = size / (MAP_EXTENT * 2);

    // Storm: shade everything outside the current circle.
    const [cx, cy] = toMap(s.current.x, s.current.z, size);
    g.save();
    g.beginPath();
    g.rect(0, 0, size, size);
    g.arc(cx, cy, Math.max(0, s.current.r * k), 0, Math.PI * 2, true);
    g.fillStyle = "rgba(24, 110, 96, 0.5)";
    g.fill("evenodd");
    g.restore();
    g.lineWidth = 2;
    g.strokeStyle = "#5fe0c0";
    g.beginPath();
    g.arc(cx, cy, Math.max(0, s.current.r * k), 0, Math.PI * 2);
    g.stroke();
    if (s.next.r > 0) {
      const [nx, ny] = toMap(s.next.x, s.next.z, size);
      g.strokeStyle = "#ffffff";
      g.setLineDash([5, 4]);
      g.beginPath();
      g.arc(nx, ny, s.next.r * k, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }

    if (labels) {
      g.font = `800 ${Math.round(size / 28)}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
      g.textAlign = "center";
      SQ.POIS.forEach((p) => {
        const [px, py] = toMap(p.x, p.z, size);
        g.fillStyle = "rgba(8, 14, 17, 0.75)";
        const w = g.measureText(p.name.toUpperCase()).width + 12;
        g.fillRect(px - w / 2, py - size / 40 - 4, w, size / 26);
        g.fillStyle = "#eef4f0";
        g.fillText(p.name.toUpperCase(), px, py);
      });
    }

    const now = SQ.Game.time;
    pings = pings.filter((p) => now - p.t < 2.5);
    pings.forEach((p) => {
      const [px, py] = toMap(p.x, p.z, size);
      g.fillStyle = `rgba(255, 90, 74, ${1 - (now - p.t) / 2.5})`;
      g.beginPath();
      g.arc(px, py, 3, 0, Math.PI * 2);
      g.fill();
    });

    const ch = SQ.Player.state.ch;
    const [px, py] = toMap(ch.pos.x, ch.pos.z, size);
    g.save();
    g.translate(px, py);
    g.rotate(-SQ.CameraRig.yaw);
    g.fillStyle = "#ffe066";
    g.strokeStyle = "#0b1316";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(6, 6);
    g.lineTo(0, 3);
    g.lineTo(-6, 6);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }

  function slotSignature(inv, building) {
    return `${building}|${inv.selected}|${inv.slots.map((s) => (s ? `${s.uid}:${s.mag ?? ""}:${s.count ?? ""}` : "-")).join(",")}`;
  }

  function renderHotbar(inv) {
    els.hotbar.innerHTML = inv.slots
      .map((item, i) => {
        const selected = i === inv.selected && !SQ.Player.state.buildMode;
        const rarity = item ? SQ.Items.color(item) : "transparent";
        const count = !item ? "" : item.kind === "weapon" ? item.mag : `×${item.count}`;
        return `<div class="slot${selected ? " is-selected" : ""}${item ? "" : " is-empty"}" style="--rarity:${rarity}">
          <span class="slot-key">${i + 1}</span>
          <svg viewBox="0 0 60 24">${item ? iconFor(item) : ""}</svg>
          <span class="slot-count">${count}</span><span class="slot-rarity"></span></div>`;
      })
      .join("");
  }

  function renderBuildbar(piece) {
    els.buildbar.innerHTML = ["wall", "floor", "ramp", "roof"]
      .map((p) => `<div class="build-tile${p === piece ? " is-selected" : ""}"><kbd>${SQ.Input.keyName(SQ.Input.code(PIECE_KEYS[p]))}</kbd><svg viewBox="0 0 40 40">${PIECE_ICONS[p]}</svg></div>`)
      .join("");
  }

  function update(dt) {
    const ps = SQ.Player.state;
    const ch = ps.ch;
    const inv = ch.inventory;

    setText("shieldNum", els["shield-num"], String(Math.ceil(ch.shield)));
    setText("healthNum", els["health-num"], String(Math.ceil(ch.health)));
    if (last.shield !== ch.shield) {
      last.shield = ch.shield;
      els.shieldFill.style.transform = `scaleX(${ch.shield / 100})`;
    }
    if (last.health !== ch.health) {
      last.health = ch.health;
      els.healthFill.style.transform = `scaleX(${ch.health / 100})`;
    }
    setText("mats", els["mats-count"], String(inv.mats));

    const sig = slotSignature(inv, ps.buildMode);
    if (last.sig !== sig) {
      last.sig = sig;
      renderHotbar(inv);
    }
    const buildSig = ps.buildMode ? ps.piece : "";
    if (last.build !== buildSig) {
      last.build = buildSig;
      els.buildbar.hidden = !ps.buildMode;
      els.hotbar.hidden = ps.buildMode;
      if (ps.buildMode) renderBuildbar(ps.piece);
      els.crosshair.classList.toggle("is-build", ps.buildMode);
    }

    const item = ch.held();
    let name = "Hatchet";
    let mag = "";
    let reserve = "";
    let color = "#98aba4";
    let magClass = "";
    if (ps.buildMode) {
      name = `${ps.piece} · 10 timber`;
      mag = String(inv.mats);
    } else if (item && item.kind === "weapon") {
      const st = SQ.Weapons.stats(item);
      name = `${st.name} · ${SQ.RARITY[item.rarity].name}`;
      mag = String(item.mag);
      reserve = `/ ${inv.ammo[st.ammo]}`;
      color = SQ.RARITY[item.rarity].color;
      magClass = item.mag === 0 ? "is-empty" : item.mag <= st.mag * 0.25 ? "is-low" : "";
    } else if (item) {
      name = `${SQ.CONSUMABLES[item.type].name} · ${SQ.RARITY[item.rarity].name}`;
      mag = `×${item.count}`;
      color = SQ.RARITY[item.rarity].color;
    }
    setText("wname", els["weapon-name"], name);
    setText("mag", els["ammo-mag"], mag);
    setText("reserve", els["ammo-reserve"], reserve);
    if (last.wcolor !== color) {
      last.wcolor = color;
      els.ammo.style.setProperty("--weapon-color", color);
    }
    if (last.magClass !== magClass) {
      last.magClass = magClass;
      els["ammo-mag"].className = magClass;
    }

    // Crosshair spread follows the real weapon spread.
    kick = Math.max(0, kick - dt * 30);
    let spread = 1.5;
    if (item && item.kind === "weapon") {
      spread = SQ.Weapons.spreadFor(ch, item, {
        ads: ps.ads, moving: Math.hypot(ch.vel.x, ch.vel.z) > 1, sprinting: ps.sprinting, airborne: !ch.onGround, crouching: ch.crouching,
      });
    }
    const pxPerDeg = window.innerHeight / SQ.Game.camera.fov;
    const gap = Math.min(80, 4 + spread * pxPerDeg + kick);
    if (Math.abs((last.gap || 0) - gap) > 0.3) {
      last.gap = gap;
      els.crosshair.style.setProperty("--gap", `${gap.toFixed(1)}px`);
    }
    const scoped = ps.ads && item && item.kind === "weapon" && SQ.WEAPONS[item.type].scoped && SQ.CameraRig.ads > 0.85;
    if (last.scoped !== scoped) {
      last.scoped = scoped;
      els.scope.hidden = !scoped;
      els.crosshair.hidden = scoped;
    }

    hitT = Math.max(0, hitT - dt);
    els.hitmarker.style.opacity = hitT > 0 ? Math.min(1, hitT * 6).toFixed(2) : "0";
    structT = Math.max(0, structT - dt);
    els["structure-bar"].hidden = structT <= 0;

    const prompt = ps.prompt;
    const promptSig = prompt ? `${prompt.verb}|${prompt.label}|${prompt.rarity}` : "";
    if (last.prompt !== promptSig) {
      last.prompt = promptSig;
      els.prompt.hidden = !prompt;
      if (prompt) {
        els["prompt-key"].textContent = SQ.Input.keyName(SQ.Input.code("interact"));
        els["prompt-verb"].textContent = prompt.verb;
        els["prompt-label"].textContent = prompt.label;
        els["prompt-rarity"].textContent = prompt.rarity || "";
        els.prompt.style.setProperty("--prompt-color", prompt.color);
      }
    }

    let progress = 0;
    let label = "";
    if (ch.weapon.reloadT > 0) {
      progress = 1 - ch.weapon.reloadT / ch.weapon.reloadTotal;
      label = "Reloading";
    } else if (ch.using) {
      progress = ch.using.t / ch.using.total;
      label = ch.using.label;
    }
    els.progress.hidden = progress <= 0;
    if (progress > 0) {
      els.progressFill.style.strokeDashoffset = (113.1 * (1 - progress)).toFixed(1);
      setText("plabel", els["progress-label"], label);
    }

    const s = SQ.Storm.state;
    const inside = SQ.Storm.isInside(ch.pos.x, ch.pos.z);
    let stormText;
    let stormClass = "";
    if (s.finished) stormText = "Final squall";
    else if (s.mode === "wait") stormText = `Storm closes in ${U.formatTime(s.timer)}`;
    else {
      stormText = "Storm shrinking";
      stormClass = "is-shrinking";
    }
    if (!inside && ch.alive) {
      stormText = `In the storm · −${s.dps} HP/s`;
      stormClass = "is-outside";
    }
    setText("stimer", els["storm-timer"], s.finished ? "—" : U.formatTime(s.timer));
    setText("slabel", els["storm-label"], stormText);
    if (last.sclass !== stormClass) {
      last.sclass = stormClass;
      els["storm-label"].className = stormClass;
    }
    els["storm-vignette"].style.opacity = !inside && ch.alive ? "1" : "0";

    setText("alive", els["alive-count"], String(SQ.Game.aliveCount()));
    setText("elims", els["elim-count"], String(ch.kills));

    damageT = Math.max(0, damageT - dt);
    const lowHealth = ch.alive && ch.health < 30 ? 0.35 + Math.sin(SQ.Game.time * 5) * 0.15 : 0;
    els["damage-vignette"].style.opacity = Math.max(lowHealth, Math.min(1, damageT * 2)).toFixed(2);

    els["dmg-indicators"].querySelectorAll(".dmg-indicator").forEach((el) => {
      const age = SQ.Game.time - Number(el.dataset.t);
      if (age > 1.2) el.remove();
      else {
        const rel = U.wrapAngle(Number(el.dataset.angle) - SQ.CameraRig.yaw);
        el.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
        el.style.opacity = String(1 - age / 1.2);
      }
    });

    mapT -= dt;
    if (mapT <= 0) {
      mapT = 1 / 12;
      drawMap(els.minimap, false);
    }

    announceT -= dt;
    if (announceT <= 0 && !els.announce.hidden) els.announce.hidden = true;

    if (SQ.Settings.values.showFps) {
      fpsAcc += dt;
      fpsFrames += 1;
      if (fpsAcc > 0.5) {
        els.fps.hidden = false;
        els.fps.textContent = `${Math.round(fpsFrames / fpsAcc)} fps`;
        fpsAcc = 0;
        fpsFrames = 0;
      }
    } else if (!els.fps.hidden) els.fps.hidden = true;

    els["lock-hint"].hidden = SQ.Input.isLocked() || SQ.Input.usingFallback() || !SQ.Game.inMatch() || SQ.Menus.isOpen() || !ch.alive;
  }

  function toast(text, kind = "") {
    const el = document.createElement("div");
    el.className = `toast${kind ? ` is-${kind}` : ""}`;
    el.textContent = text;
    els["toast-stack"].prepend(el);
    while (els["toast-stack"].children.length > 4) els["toast-stack"].lastChild.remove();
    setTimeout(() => el.remove(), 2200);
  }

  function announce(text, kind = "") {
    els.announce.textContent = text;
    els.announce.className = kind ? `is-${kind}` : "";
    els.announce.hidden = false;
    els.announce.style.animation = "none";
    void els.announce.offsetWidth;
    els.announce.style.animation = "";
    announceT = 2.6;
  }

  function killfeed(killer, victim, weapon) {
    const li = document.createElement("li");
    const you = (killer && killer.isPlayer) || victim.isPlayer;
    if (you) li.className = "is-you";
    const weaponName = weapon === "storm" ? "the storm" : weapon === "fall" ? "a long fall" : weapon === "explosion" ? "an explosion" : weapon === "hatchet" ? "Hatchet" : SQ.WEAPONS[weapon] ? SQ.WEAPONS[weapon].name : "";
    if (killer && killer !== victim) {
      li.innerHTML = `<strong></strong><span class="kf-weapon"></span><strong></strong>`;
      li.children[0].textContent = killer.name;
      li.children[1].textContent = weaponName;
      li.children[2].textContent = victim.name;
    } else {
      li.innerHTML = `<strong></strong><span class="kf-weapon"></span>`;
      li.children[0].textContent = victim.name;
      li.children[1].textContent = `lost to ${weaponName}`;
    }
    els.killfeed.prepend(li);
    while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    setTimeout(() => li.remove(), 6000);
  }

  function hitmarker(headshot, kill) {
    hitT = 0.22;
    els.hitmarker.className = kill ? "is-kill" : headshot ? "is-head" : "";
  }

  function damageFrom(x, z) {
    const ch = SQ.Player.state.ch;
    damageT = 0.5;
    if (x === undefined) return;
    const angle = Math.atan2(-(x - ch.pos.x), -(z - ch.pos.z));
    const el = document.createElement("div");
    el.className = "dmg-indicator";
    el.dataset.t = String(SQ.Game.time);
    el.dataset.angle = String(angle);
    els["dmg-indicators"].appendChild(el);
  }

  function structureHit(hp, max) {
    structT = 1;
    els.structFill.style.width = `${Math.round((hp / max) * 100)}%`;
  }

  function fired() {
    kick = 10;
  }

  function ping(x, z) {
    pings.push({ x, z, t: SQ.Game.time });
    if (pings.length > 30) pings.shift();
  }

  function reset() {
    Object.keys(last).forEach((k) => delete last[k]);
    els.killfeed.innerHTML = "";
    els["toast-stack"].innerHTML = "";
    els["dmg-indicators"].innerHTML = "";
    els.announce.hidden = true;
    els.spectate.hidden = true;
    pings = [];
  }

  function setVisible(v) {
    els.hud.hidden = !v;
  }

  function spectate(text) {
    els.spectate.hidden = !text;
    els.spectate.textContent = text || "";
  }

  SQ.HUD = {
    init, update, toast, announce, killfeed, hitmarker, damageFrom, structureHit, fired, ping, reset, setVisible, spectate,
    drawMap, iconFor,
  };
})(window.SQ = window.SQ || {});
