// Squall: items, rarity rolls and the five-slot inventory shared by players and bots. By The_headphones
(function (SQ) {
  let nextUid = 1;

  const Items = {
    weapon(type, rarity) {
      const def = SQ.WEAPONS[type];
      const r = Math.max(rarity, def.minRarity);
      return { uid: nextUid++, kind: "weapon", type, rarity: r, mag: def.mag };
    },
    consumable(type, count) {
      const def = SQ.CONSUMABLES[type];
      return { uid: nextUid++, kind: "consumable", type, rarity: def.rarity, count: count ?? def.spawnCount };
    },
    ammo(ammoType, amount) {
      return { uid: nextUid++, kind: "ammo", ammo: ammoType, amount, rarity: 0 };
    },
    mats(amount) {
      return { uid: nextUid++, kind: "mats", amount, rarity: 0 };
    },
    name(item) {
      if (item.kind === "weapon") return SQ.WEAPONS[item.type].name;
      if (item.kind === "consumable") return SQ.CONSUMABLES[item.type].name;
      if (item.kind === "ammo") return SQ.AMMO[item.ammo].name;
      return "Building materials";
    },
    color(item) {
      if (item.kind === "ammo") return SQ.AMMO[item.ammo].color;
      if (item.kind === "mats") return "#c08a54";
      return SQ.RARITY[item.rarity].color;
    },
    rollRarity(bias = 0) {
      const weights = [40, 30, 18, 9, 3];
      for (let i = 0; i < bias; i++) {
        weights[0] *= 0.5;
        weights[3] *= 1.4;
        weights[4] *= 1.6;
      }
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return i;
      }
      return 0;
    },
    randomWeaponType() {
      const types = Object.keys(SQ.WEAPONS);
      const total = types.reduce((sum, t) => sum + SQ.WEAPONS[t].weight, 0);
      let roll = Math.random() * total;
      for (const t of types) {
        roll -= SQ.WEAPONS[t].weight;
        if (roll <= 0) return t;
      }
      return types[0];
    },
    randomConsumable() {
      const roll = Math.random();
      if (roll < 0.38) return Items.consumable("patch", 4);
      if (roll < 0.66) return Items.consumable("cell", 2);
      if (roll < 0.86) return Items.consumable("flask", 1);
      return Items.consumable("medkit", 1);
    },
    // A weapon and a stack of its ammo, the usual floor or chest drop.
    weaponDrop(bias = 0) {
      const type = Items.randomWeaponType();
      const weapon = Items.weapon(type, Items.rollRarity(bias));
      const def = SQ.WEAPONS[type];
      return [weapon, Items.ammo(def.ammo, def.pickupAmmo)];
    },
  };

  class Inventory {
    constructor() {
      this.slots = [null, null, null, null, null];
      this.selected = 0;
      this.ammo = { light: 0, medium: 0, shells: 0, heavy: 0 };
      this.mats = 0;
    }

    current() {
      return this.slots[this.selected];
    }

    firstEmpty() {
      return this.slots.indexOf(null);
    }

    // Adds an item; returns any item that had to be swapped out (to drop on the floor).
    add(item, swapIfFull = true) {
      if (item.kind === "ammo") {
        this.ammo[item.ammo] = Math.min(999, this.ammo[item.ammo] + item.amount);
        return { added: true, dropped: null };
      }
      if (item.kind === "mats") {
        const room = SQ.CFG.BUILD.maxMats - this.mats;
        if (room <= 0) return { added: false, dropped: null };
        const taken = Math.min(room, item.amount);
        this.mats += taken;
        item.amount -= taken;
        return { added: item.amount === 0, dropped: null, partial: item.amount > 0 };
      }
      if (item.kind === "consumable") {
        const def = SQ.CONSUMABLES[item.type];
        for (const slot of this.slots) {
          if (slot && slot.kind === "consumable" && slot.type === item.type && slot.count < def.stack) {
            const move = Math.min(def.stack - slot.count, item.count);
            slot.count += move;
            item.count -= move;
            if (item.count === 0) return { added: true, dropped: null };
          }
        }
      }
      const empty = this.firstEmpty();
      if (empty >= 0) {
        this.slots[empty] = item;
        return { added: true, dropped: null, slot: empty };
      }
      if (!swapIfFull) return { added: false, dropped: null };
      const dropped = this.slots[this.selected];
      this.slots[this.selected] = item;
      return { added: true, dropped, slot: this.selected };
    }

    removeSlot(index) {
      const item = this.slots[index];
      this.slots[index] = null;
      return item;
    }

    consumeOne(index) {
      const item = this.slots[index];
      if (!item) return;
      item.count -= 1;
      if (item.count <= 0) this.slots[index] = null;
    }

    weapons() {
      return this.slots.map((item, i) => ({ item, i })).filter((e) => e.item && e.item.kind === "weapon");
    }

    findConsumable(kind) {
      return this.slots.findIndex((item) => item && item.kind === "consumable" && SQ.CONSUMABLES[item.type].kind === kind);
    }

    // Everything this inventory holds, flattened into droppable items.
    dumpAll() {
      const out = this.slots.filter(Boolean);
      Object.entries(this.ammo).forEach(([kind, amount]) => {
        if (amount > 0) out.push(Items.ammo(kind, amount));
      });
      if (this.mats > 0) out.push(Items.mats(this.mats));
      this.slots = [null, null, null, null, null];
      this.ammo = { light: 0, medium: 0, shells: 0, heavy: 0 };
      this.mats = 0;
      return out;
    }
  }

  SQ.Items = Items;
  SQ.Inventory = Inventory;
})(window.SQ = window.SQ || {});
