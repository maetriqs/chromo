// Quarry: the 36-slot inventory, simple crafting and dropped items. By The_headphones
(function (QY) {
  const { STACK } = QY.CFG;
  const ID = QY.ID;
  const W = QY.World;
  const listeners = [];

  const Inventory = {
    slots: new Array(36).fill(null),
    selected: 0,
    creative: false,
    cursor: null,

    onChange(fn) {
      listeners.push(fn);
    },
    changed() {
      listeners.forEach((fn) => fn());
    },

    reset(creative) {
      this.creative = creative;
      this.slots.fill(null);
      this.cursor = null;
      this.selected = 0;
      if (creative) QY.CREATIVE_HOTBAR.forEach((key, i) => (this.slots[i] = { id: ID[key], count: 1 }));
      this.changed();
    },

    selectedStack() {
      return this.slots[this.selected];
    },
    selectedId() {
      const s = this.slots[this.selected];
      return s ? s.id : 0;
    },
    select(i) {
      this.selected = ((i % 9) + 9) % 9;
      this.changed();
    },

    // Adds items, filling matching stacks first (hotbar before backpack). Returns what did not fit.
    add(id, count = 1) {
      if (this.creative) return 0;
      let left = count;
      for (let i = 0; i < 36 && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < STACK) {
          const n = Math.min(STACK - s.count, left);
          s.count += n;
          left -= n;
        }
      }
      for (let i = 0; i < 36 && left > 0; i++) {
        if (!this.slots[i]) {
          const n = Math.min(STACK, left);
          this.slots[i] = { id, count: n };
          left -= n;
        }
      }
      if (left !== count) this.changed();
      return left;
    },

    count(id) {
      return this.slots.reduce((sum, s) => sum + (s && s.id === id ? s.count : 0), 0);
    },

    remove(id, n) {
      let left = n;
      for (let i = 35; i >= 0 && left > 0; i--) {
        const s = this.slots[i];
        if (!s || s.id !== id) continue;
        const take = Math.min(left, s.count);
        s.count -= take;
        left -= take;
        if (!s.count) this.slots[i] = null;
      }
      this.changed();
      return n - left;
    },

    // Uses one of the selected item; creative mode never runs out.
    consumeSelected() {
      if (this.creative) return true;
      const s = this.slots[this.selected];
      if (!s) return false;
      s.count -= 1;
      if (!s.count) this.slots[this.selected] = null;
      this.changed();
      return true;
    },

    // Middle click: select the block in the hotbar, or bring it there.
    pick(id) {
      const hot = this.slots.findIndex((s, i) => i < 9 && s && s.id === id);
      if (hot >= 0) {
        this.select(hot);
        return;
      }
      if (this.creative) {
        if (!QY.BLOCKS[id] || !QY.BLOCKS[id].palette) return;
        const empty = this.slots.findIndex((s, i) => i < 9 && !s);
        if (empty >= 0) this.selected = empty;
        this.slots[this.selected] = { id, count: 1 };
        this.changed();
        return;
      }
      const inPack = this.slots.findIndex((s, i) => i >= 9 && s && s.id === id);
      if (inPack >= 0) {
        const tmp = this.slots[this.selected];
        this.slots[this.selected] = this.slots[inPack];
        this.slots[inPack] = tmp;
        this.changed();
      }
    },

    // Inventory screen clicks with a held "cursor" stack. button 0 = whole stack, 2 = one / half.
    clickSlot(i, button, shift) {
      const s = this.slots[i];
      if (shift && s && !this.cursor) {
        const range = i < 9 ? [9, 36] : [0, 9];
        let left = s.count;
        for (let pass = 0; pass < 2 && left > 0; pass++) {
          for (let j = range[0]; j < range[1] && left > 0; j++) {
            const t = this.slots[j];
            if (pass === 0 && t && t.id === s.id && t.count < STACK) {
              const n = Math.min(STACK - t.count, left);
              t.count += n;
              left -= n;
            } else if (pass === 1 && !t) {
              this.slots[j] = { id: s.id, count: left };
              left = 0;
            }
          }
        }
        this.slots[i] = left ? { id: s.id, count: left } : null;
        this.changed();
        return;
      }
      const c = this.cursor;
      if (button === 2) {
        if (!c && s) {
          const half = Math.ceil(s.count / 2);
          this.cursor = { id: s.id, count: half };
          s.count -= half;
          if (!s.count) this.slots[i] = null;
        } else if (c && (!s || (s.id === c.id && s.count < STACK))) {
          if (s) s.count += 1;
          else this.slots[i] = { id: c.id, count: 1 };
          c.count -= 1;
          if (!c.count) this.cursor = null;
        }
        this.changed();
        return;
      }
      if (c && s && s.id === c.id) {
        const n = Math.min(STACK - s.count, c.count);
        s.count += n;
        c.count -= n;
        if (!c.count) this.cursor = null;
      } else {
        this.slots[i] = c;
        this.cursor = s;
      }
      this.changed();
    },

    // Creative palette: put a block into the selected hotbar slot.
    assignCreative(id) {
      this.slots[this.selected] = { id, count: 1 };
      this.changed();
    },

    // Anything left on the cursor when the screen closes goes back into the bag (or is dropped).
    returnCursor(dropAt) {
      if (!this.cursor) return;
      const left = this.add(this.cursor.id, this.cursor.count);
      if (left && dropAt) Drops.spawn(this.cursor.id, dropAt.x, dropAt.y, dropAt.z, 0, 2, 0, left);
      this.cursor = null;
      this.changed();
    },

    serialize() {
      return this.slots.map((s) => (s ? [s.id, s.count] : 0));
    },
    load(list, creative) {
      this.creative = creative;
      this.slots.fill(null);
      (list || []).forEach((v, i) => {
        if (i < 36 && Array.isArray(v) && QY.BLOCKS[v[0]] && v[1] > 0) this.slots[i] = { id: v[0], count: Math.min(STACK, v[1] | 0) };
      });
      this.cursor = null;
      this.changed();
    },
  };

  // ---- crafting -------------------------------------------------------------------------------
  const RECIPES = [
    { out: "planks", count: 4, need: [["log", 1]] },
    { out: "stone", count: 1, need: [["cobble", 1]] },
    { out: "stonebrick", count: 4, need: [["stone", 4]] },
    { out: "glass", count: 1, need: [["sand", 1]] },
    { out: "sandstone", count: 1, need: [["sand", 4]] },
    { out: "brick", count: 2, need: [["gravel", 1], ["dirt", 1]] },
    { out: "bookshelf", count: 1, need: [["planks", 6]] },
    { out: "lamp", count: 1, need: [["coal", 1], ["glass", 1]] },
  ].map((r) => ({ out: ID[r.out], count: r.count, need: r.need.map(([k, n]) => [ID[k], n]) }));

  const Crafting = {
    RECIPES,
    canCraft(r) {
      return r.need.every(([id, n]) => Inventory.count(id) >= n);
    },
    craft(r, dropAt) {
      if (Inventory.creative || !this.canCraft(r)) return false;
      r.need.forEach(([id, n]) => Inventory.remove(id, n));
      const left = Inventory.add(r.out, r.count);
      if (left && dropAt) Drops.spawn(r.out, dropAt.x, dropAt.y, dropAt.z, 0, 2, 0, left);
      return true;
    },
  };

  // ---- dropped items ---------------------------------------------------------------------------
  let scene = null;
  const list = [];
  const MAX_DROPS = 120;

  const Drops = {
    init(s) {
      scene = s;
    },
    spawn(id, x, y, z, vx, vy, vz, count = 1, delay = 0.4) {
      if (!scene || !QY.BLOCKS[id]) return;
      if (list.length >= MAX_DROPS) this.remove(0);
      const geo = QY.Mesher.litItem(id, 1, 0);
      const mesh = new THREE.Mesh(geo, QY.Chunks.materials.opaque);
      const plant = QY.BLOCKS[id].kind === "plant";
      mesh.scale.setScalar(plant ? 0.42 : 0.26);
      scene.add(mesh);
      list.push({ id, count, x, y, z, vx, vy, vz, age: 0, delay, mesh, spin: Math.random() * 6, cell: -1, plant });
    },
    remove(i) {
      const d = list[i];
      scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      list.splice(i, 1);
    },
    clear() {
      while (list.length) this.remove(0);
    },
    // Simple physics, magnet toward the player, pickup into the inventory.
    update(dt, player) {
      const px = player.pos.x;
      const py = player.pos.y + 0.8;
      const pz = player.pos.z;
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        d.age += dt;
        if (d.age > 300 || d.y < QY.CFG.VOID_Y) {
          this.remove(i);
          continue;
        }
        const half = d.plant ? 0.21 : 0.13;
        const inWater = QY.T_KIND[W.get(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z))] === QY.KIND.WATER;
        d.vy -= (inWater ? 4 : 20) * dt;
        if (inWater) d.vy = Math.max(d.vy, -1.2);
        const dx = px - d.x;
        const dy = py - d.y;
        const dz = pz - d.z;
        const dist = Math.hypot(dx, dy, dz);
        if (d.age > d.delay && dist < 2.2 && player.alive) {
          const pull = 9 * dt;
          d.vx += (dx / dist) * pull * 4;
          d.vy += (dy / dist) * pull * 4;
          d.vz += (dz / dist) * pull * 4;
          if (dist < 0.7) {
            const left = Inventory.add(d.id, d.count);
            if (left < d.count) QY.Audio.pop();
            if (!left) {
              this.remove(i);
              continue;
            }
            d.count = left;
          }
        }
        const nx = d.x + d.vx * dt;
        if (!W.isSolid(Math.floor(nx), Math.floor(d.y), Math.floor(d.z))) d.x = nx;
        else d.vx = 0;
        const nz = d.z + d.vz * dt;
        if (!W.isSolid(Math.floor(d.x), Math.floor(d.y), Math.floor(nz))) d.z = nz;
        else d.vz = 0;
        const ny = d.y + d.vy * dt;
        if (W.isSolid(Math.floor(d.x), Math.floor(ny - half), Math.floor(d.z))) {
          if (d.vy < 0) d.y = Math.floor(ny - half) + 1 + half;
          d.vy = 0;
          d.vx *= Math.pow(0.02, dt);
          d.vz *= Math.pow(0.02, dt);
        } else if (W.isSolid(Math.floor(d.x), Math.floor(ny + half), Math.floor(d.z)) && d.vy > 0) {
          d.vy = 0;
        } else d.y = ny;

        d.spin += dt * 1.6;
        d.mesh.position.set(d.x, d.y + Math.sin(d.age * 2.6) * 0.06 + 0.04, d.z);
        d.mesh.rotation.y = d.spin;
        const cell = W.inside(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) ? W.index(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) : -1;
        if (cell !== d.cell) {
          d.cell = cell;
          const sky = W.skyAt(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z));
          QY.Mesher.litItem(d.id, sky, W.lightAt(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)), d.mesh.geometry);
        }
      }
    },
    count: () => list.length,
  };

  QY.Inventory = Inventory;
  QY.Crafting = Crafting;
  QY.Drops = Drops;
})(window.QY = window.QY || {});
