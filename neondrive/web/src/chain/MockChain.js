/**
 * MockChain.js — In-memory simulation of all 5 NeonDrive contracts.
 * Used for offline development / demo mode (no wallet needed).
 */

import { ethers } from "ethers";

// ── Sample data ───────────────────────────────────────────────────
const SAMPLE_CARS = [
  { tokenId:1, name:"Phantom #001",     rarity:"Legendary", color:"#ff006e",
    stats:{speed:95,handling:88,acceleration:90,durability:75,boost:92,rarity:4},
    glb:"models/cars/phantom-001.glb" },
  { tokenId:2, name:"Specter #042",     rarity:"Epic",      color:"#7b2fff",
    stats:{speed:82,handling:85,acceleration:88,durability:80,boost:78,rarity:3},
    glb:"models/cars/specter-042.glb" },
  { tokenId:3, name:"Ghost #108",       rarity:"Rare",      color:"#00d4ff",
    stats:{speed:75,handling:72,acceleration:70,durability:85,boost:68,rarity:2},
    glb:"models/cars/ghost-108.glb"  },
  { tokenId:4, name:"Wraith #217",      rarity:"Rare",      color:"#00ff9d",
    stats:{speed:70,handling:78,acceleration:72,durability:75,boost:73,rarity:2},
    glb:"models/cars/wraith-217.glb" },
  { tokenId:5, name:"Banshee #333",     rarity:"Uncommon",  color:"#ff6b00",
    stats:{speed:60,handling:65,acceleration:62,durability:68,boost:58,rarity:1},
    glb:"models/cars/banshee-333.glb"},
  { tokenId:6, name:"Revenant #512",    rarity:"Common",    color:"#ffdd00",
    stats:{speed:50,handling:52,acceleration:48,durability:55,boost:45,rarity:0},
    glb:"models/cars/revenant-512.glb"},
];

const UPGRADE_TYPES = (() => {
  const types = {};
  const cats = [
    ["Engine","Speed",0],["Tires","Handling",1],["NOS","Acceleration",2],
    ["Armor","Durability",3],["Turbo","Boost",4]
  ];
  const boosts = [5,8,12,16,20];
  const prices = [0.05,0.1,0.2,0.35,0.5];
  let id = 1;
  cats.forEach(([cat,stat,si]) => {
    boosts.forEach((b,mk) => {
      types[id] = {id, name:`${cat} Mk${mk+1}`, statIndex:si, boostAmount:b,
                   price:prices[mk], stat, category:cat};
      id++;
    });
  });
  types[26] = {id:26, name:"Race ECU",  statIndex:0, boostAmount:15, price:0.3, stat:"Speed",    category:"Special"};
  types[27] = {id:27, name:"Aero Kit",  statIndex:1, boostAmount:15, price:0.3, stat:"Handling", category:"Special"};
  return types;
})();

export class MockChain {
  constructor() {
    this.address = "0xMockPlayer1";
    this._cars   = {};      // tokenId → { owner, ...car }
    this._inventory = {};   // address → { upgradeId → qty }
    this._equipped  = {};   // tokenId → [u0,u1,u2,u3,u4]
    this._listings  = {};   // tokenId → { seller, price }
    this._wagers    = {};   // raceId → race
    this._titles    = {};   // raceId → race
    this._balance   = 10.0; // mock AVAX balance
    this._listeners = {};

    // Seed: give the mock player cars 1, 2, 3
    [1,2,3].forEach(id => {
      const car = SAMPLE_CARS.find(c => c.tokenId === id);
      this._cars[id] = { ...car, owner: this.address };
    });
    // Others owned by "other" address
    [4,5,6].forEach(id => {
      const car = SAMPLE_CARS.find(c => c.tokenId === id);
      this._cars[id] = { ...car, owner: "0xOther" };
    });
    // Start inventory with a few upgrades
    this._inventory[this.address] = {1:2, 6:1, 11:1};
    // Empty equipment slots
    for(let i=1;i<=6;i++) this._equipped[i] = [0,0,0,0,0];
  }

  // ── Chain info ────────────────────────────────────────────────
  get chainName() { return "Mock (offline)"; }
  get isMock()    { return true; }

  async getBalance() { return this._balance; }

  // ── NFT ───────────────────────────────────────────────────────
  getOwnedCars(address = this.address) {
    return Object.values(this._cars)
      .filter(c => c.owner === address)
      .map(c => ({
        ...c,
        effectiveStats: this.getEffectiveStats(c.tokenId),
        equipped: [...(this._equipped[c.tokenId] || [0,0,0,0,0])],
      }));
  }

  async mint(quantity = 1) {
    const cost = 0.5 * quantity;
    if (this._balance < cost) throw new Error("Insufficient balance");
    const owned = this.getOwnedCars().length;
    if (owned + quantity > 3) throw new Error("Wallet cap exceeded");
    this._balance -= cost;

    const minted = [];
    for (let i = 0; i < quantity; i++) {
      const randomCar = SAMPLE_CARS[Math.floor(Math.random() * SAMPLE_CARS.length)];
      const newId = Math.max(...Object.keys(this._cars).map(Number), 0) + 1;
      this._cars[newId] = { ...randomCar, tokenId: newId, owner: this.address };
      this._equipped[newId] = [0,0,0,0,0];
      minted.push(this._cars[newId]);
    }
    this._emit("mint", minted);
    return minted;
  }

  // ── Upgrades ──────────────────────────────────────────────────
  get upgradeTypes()  { return UPGRADE_TYPES; }

  getInventory(address = this.address) {
    return this._inventory[address] || {};
  }

  async buyUpgrade(upgradeId, amount = 1) {
    const u = UPGRADE_TYPES[upgradeId];
    if (!u) throw new Error("Unknown upgrade");
    const cost = u.price * amount;
    if (this._balance < cost) throw new Error("Insufficient balance");
    this._balance -= cost;
    if (!this._inventory[this.address]) this._inventory[this.address] = {};
    this._inventory[this.address][upgradeId] = (this._inventory[this.address][upgradeId] || 0) + amount;
    this._emit("inventoryUpdate");
    return { upgradeId, amount };
  }

  async equip(carId, upgradeId, slot) {
    const car = this._cars[carId];
    if (!car || car.owner !== this.address) throw new Error("Not car owner");
    const inv = this._inventory[this.address] || {};
    if (!inv[upgradeId] || inv[upgradeId] < 1) throw new Error("Don't own upgrade");

    const oldPart = this._equipped[carId][slot];
    if (oldPart) {
      inv[oldPart] = (inv[oldPart] || 0) + 1;
    }
    inv[upgradeId]--;
    if (inv[upgradeId] <= 0) delete inv[upgradeId];
    this._equipped[carId][slot] = upgradeId;
    this._emit("equipped", { carId, slot, upgradeId });
  }

  async unequip(carId, slot) {
    const car = this._cars[carId];
    if (!car || car.owner !== this.address) throw new Error("Not car owner");
    const part = this._equipped[carId][slot];
    if (!part) throw new Error("Slot empty");
    this._equipped[carId][slot] = 0;
    const inv = this._inventory[this.address] || {};
    inv[part] = (inv[part] || 0) + 1;
    this._emit("equipped", { carId, slot, upgradeId: 0 });
  }

  getEffectiveStats(carId) {
    const car = this._cars[carId];
    if (!car) return null;
    const s  = { ...car.stats };
    const eq = this._equipped[carId] || [0,0,0,0,0];
    const statKeys = ["speed","handling","acceleration","durability","boost"];
    eq.forEach(pid => {
      if (!pid) return;
      const u = UPGRADE_TYPES[pid];
      if (!u) return;
      s[statKeys[u.statIndex]] = Math.min(100, s[statKeys[u.statIndex]] + u.boostAmount);
    });
    return s;
  }

  // ── Marketplace ───────────────────────────────────────────────
  getListings() {
    return Object.entries(this._listings)
      .filter(([,l]) => l.active)
      .map(([tid, l]) => ({ tokenId:Number(tid), ...l, car: this._cars[tid] }));
  }

  async listCar(tokenId, priceAvax) {
    const car = this._cars[tokenId];
    if (!car || car.owner !== this.address) throw new Error("Not owner");
    this._listings[tokenId] = { seller: this.address, price: priceAvax, active: true };
    this._emit("listed", { tokenId, price: priceAvax });
  }

  async delistCar(tokenId) {
    if (!this._listings[tokenId]) throw new Error("Not listed");
    this._listings[tokenId].active = false;
    this._emit("delisted", { tokenId });
  }

  async buyCar(tokenId) {
    const l = this._listings[tokenId];
    if (!l || !l.active) throw new Error("Not listed");
    if (l.seller === this.address) throw new Error("Self-buy");
    if (this._balance < l.price) throw new Error("Insufficient balance");
    const fee    = l.price * 0.035;
    const payout = l.price - fee;
    this._balance -= l.price;
    this._cars[tokenId].owner = this.address;
    l.active = false;
    this._emit("sold", { tokenId, price: l.price, fee, payout });
  }

  // ── Wager races ───────────────────────────────────────────────
  async createWager(raceId, wagerAvax) {
    if (this._wagers[raceId]) throw new Error("Race ID taken");
    if (this._balance < wagerAvax) throw new Error("Insufficient balance");
    this._balance -= wagerAvax;
    this._wagers[raceId] = {
      player1: this.address, player2: null,
      wager: wagerAvax, status: "open"
    };
    this._emit("wagerCreated", { raceId, wager: wagerAvax });
    return raceId;
  }

  getOpenWagers() {
    return Object.entries(this._wagers)
      .filter(([,r]) => r.status === "open")
      .map(([raceId, r]) => ({ raceId, ...r }));
  }

  async joinWager(raceId, wagerAvax) {
    const race = this._wagers[raceId];
    if (!race) throw new Error("Race not found");
    if (race.status !== "open") throw new Error("Race not open");
    if (race.player1 === this.address) throw new Error("Cannot join own race");
    if (Math.abs(race.wager - wagerAvax) > 0.001) throw new Error("Wager mismatch");
    if (this._balance < wagerAvax) throw new Error("Insufficient balance");
    this._balance -= wagerAvax;
    race.player2 = this.address;
    race.status = "active";
    this._emit("wagerJoined", { raceId });
    return raceId;
  }

  async cancelWager(raceId) {
    const race = this._wagers[raceId];
    if (!race) throw new Error("Race not found");
    if (race.player1 !== this.address) throw new Error("Not race creator");
    if (race.status !== "open") throw new Error("Can only cancel open races");
    this._balance += race.wager;
    race.status = "cancelled";
    this._emit("wagerCancelled", { raceId });
  }

  // Simulate settle for mock mode
  async mockSettleWager(raceId, winnerAddress) {
    const race = this._wagers[raceId];
    if (!race || race.status !== "active") throw new Error("Race not active");
    const total = race.wager * 2;
    const fee   = total * 0.035;
    const payout = total - fee;
    if (winnerAddress === this.address) {
      this._balance += payout;
    }
    race.status = "settled";
    race.winner = winnerAddress;
    this._emit("wagerSettled", { raceId, winner: winnerAddress, payout, fee });
  }

  // ── Title races ───────────────────────────────────────────────
  async createTitle(raceId, carId, entryFeeAvax = 0.1) {
    if (this._titles[raceId]) throw new Error("Race ID taken");
    if (this._balance < entryFeeAvax) throw new Error("Insufficient balance");
    const car = this._cars[carId];
    if (!car || car.owner !== this.address) throw new Error("Not car owner");
    this._balance -= entryFeeAvax;
    car.escrowed = true;
    this._titles[raceId] = {
      player1: this.address, player2: null,
      car1Id: carId, car2Id: null,
      entryFee: entryFeeAvax, status: "open"
    };
    this._emit("titleCreated", { raceId, carId });
    return raceId;
  }

  getOpenTitleRaces() {
    return Object.entries(this._titles)
      .filter(([,r]) => r.status === "open")
      .map(([raceId, r]) => ({ raceId, ...r }));
  }

  async joinTitle(raceId, carId, entryFeeAvax = 0.1) {
    const race = this._titles[raceId];
    if (!race) throw new Error("Race not found");
    if (race.status !== "open") throw new Error("Race not open");
    if (race.player1 === this.address) throw new Error("Cannot join own race");
    if (this._balance < entryFeeAvax) throw new Error("Insufficient balance");
    const car = this._cars[carId];
    if (!car || car.owner !== this.address) throw new Error("Not car owner");
    this._balance -= entryFeeAvax;
    car.escrowed = true;
    race.player2 = this.address;
    race.car2Id  = carId;
    race.status  = "active";
    this._emit("titleJoined", { raceId, carId });
    return raceId;
  }

  async mockSettleTitle(raceId, winnerAddress) {
    const race = this._titles[raceId];
    if (!race || race.status !== "active") throw new Error("Race not active");
    const isPlayer1Win = winnerAddress === race.player1;
    const wonCarId     = isPlayer1Win ? race.car2Id : race.car1Id;
    const loserCarId   = isPlayer1Win ? race.car1Id : race.car2Id;

    this._cars[wonCarId].owner = winnerAddress;
    this._cars[wonCarId].escrowed = false;
    this._cars[loserCarId].escrowed = false;

    race.status = "settled";
    race.winner = winnerAddress;
    race.wonCarId = wonCarId;
    this._emit("titleSettled", { raceId, winner: winnerAddress, wonCarId });
  }

  // ── Events ────────────────────────────────────────────────────
  on(event, cb)  { (this._listeners[event] = this._listeners[event]||[]).push(cb); return this; }
  off(event, cb) { if(this._listeners[event]) this._listeners[event] = this._listeners[event].filter(x=>x!==cb); }
  _emit(event, data) { (this._listeners[event]||[]).forEach(cb => cb(data)); }
}
