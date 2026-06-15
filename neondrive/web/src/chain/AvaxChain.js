/**
 * AvaxChain.js — Real ethers.js v6 adapter for Avalanche (Fuji / Mainnet).
 * Connects to browser wallets (MetaMask, Core Wallet).
 */

import { ethers } from "ethers";
import { CHAINS, DEFAULT_CHAIN } from "../config.js";
import ABIS from "../abis.json" assert { type: "json" };

export class AvaxChain {
  constructor(chainKey = DEFAULT_CHAIN) {
    this.chainKey   = chainKey;
    this.config     = CHAINS[chainKey];
    this.provider   = null;
    this.signer     = null;
    this.address    = null;
    this._contracts = {};
    this._listeners = {};
  }

  get isMock()    { return false; }
  get chainName() { return this.config.chainName; }

  // ── Connect wallet ─────────────────────────────────────────────
  async connect() {
    if (!window.ethereum) throw new Error("No wallet detected. Install MetaMask or Avalanche Core.");

    this.provider = new ethers.BrowserProvider(window.ethereum);

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: this.config.chainId }],
      });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId:           this.config.chainId,
            chainName:         this.config.chainName,
            rpcUrls:           [this.config.rpcUrl],
            nativeCurrency:    this.config.currency,
            blockExplorerUrls: [this.config.explorer],
          }],
        });
      } else throw err;
    }

    await this.provider.send("eth_requestAccounts", []);
    this.signer  = await this.provider.getSigner();
    this.address = await this.signer.getAddress();
    this._initContracts();
    return this.address;
  }

  _initContracts() {
    const c = this.config;
    if (!c.raceCarNFT) throw new Error(`No deployed address for ${this.chainKey}. Run deploy:${this.chainKey} first.`);
    this._contracts = {
      carNFT:      new ethers.Contract(c.raceCarNFT,     ABIS.RaceCarNFT,     this.signer),
      upgrades:    new ethers.Contract(c.carUpgrades,    ABIS.CarUpgrades,    this.signer),
      marketplace: new ethers.Contract(c.carMarketplace, ABIS.CarMarketplace, this.signer),
      wager:       new ethers.Contract(c.raceWager,      ABIS.RaceWager,      this.signer),
      titleRace:   new ethers.Contract(c.titleRace,      ABIS.TitleRace,      this.signer),
    };
  }

  // ── Balance ────────────────────────────────────────────────────
  async getBalance() {
    const raw = await this.provider.getBalance(this.address);
    return parseFloat(ethers.formatEther(raw));
  }

  // ── NFT ───────────────────────────────────────────────────────
  async mint(quantity) {
    const value = ethers.parseEther((0.5 * quantity).toString());
    const tx = await this._contracts.carNFT.mint(quantity, { value });
    return tx.wait();
  }

  async getOwnedCars() {
    // Scan Transfer(any → me) events to build owned token list
    const filter = this._contracts.carNFT.filters.Transfer(null, this.address);
    const events = await this._contracts.carNFT.queryFilter(filter, 0, "latest");
    const ids = [...new Set(events.map(e => Number(e.args.tokenId)))];

    const owned = [];
    for (const tokenId of ids) {
      try {
        const owner = await this._contracts.carNFT.ownerOf(tokenId);
        if (owner.toLowerCase() !== this.address.toLowerCase()) continue;
        const raw   = await this._contracts.carNFT.carStats(tokenId);
        const stats = { speed:Number(raw[0]), handling:Number(raw[1]), acceleration:Number(raw[2]),
                        durability:Number(raw[3]), boost:Number(raw[4]), rarity:Number(raw[5]) };
        const uri   = await this._contracts.carNFT.tokenURI(tokenId);
        let meta = null;
        try { meta = await fetch(uri).then(r => r.json()); } catch {}
        owned.push({ tokenId, stats, uri, name: meta?.name ?? `Car #${tokenId}`,
                     color: "#ff006e", glb: `models/cars/${meta?.name?.toLowerCase().split(" ")[0] ?? tokenId}.glb` });
      } catch {}
    }
    return owned;
  }

  async getEffectiveStats(carId) {
    const raw = await this._contracts.upgrades.getEffectiveStats(carId);
    return { speed:Number(raw[0]), handling:Number(raw[1]), acceleration:Number(raw[2]),
             durability:Number(raw[3]), boost:Number(raw[4]) };
  }

  async getEquipped(carId) {
    const raw = await this._contracts.upgrades.getEquipped(carId);
    return raw.map(Number);
  }

  // ── Upgrades ──────────────────────────────────────────────────
  async getAllUpgradeTypes() {
    const ids = await this._contracts.upgrades.allUpgradeIds();
    const types = {};
    for (const id of ids) {
      const raw = await this._contracts.upgrades.upgradeTypes(id);
      types[Number(id)] = { id:Number(id), name:raw[0], statIndex:Number(raw[1]),
                            boostAmount:Number(raw[2]), price:ethers.formatEther(raw[3]) };
    }
    return types;
  }

  async getInventory() {
    const ids = await this._contracts.upgrades.allUpgradeIds();
    const inv = {};
    for (const id of ids) {
      const bal = await this._contracts.upgrades.balanceOf(this.address, id);
      if (Number(bal) > 0) inv[Number(id)] = Number(bal);
    }
    return inv;
  }

  async buyUpgrade(upgradeId, amount = 1) {
    const raw   = await this._contracts.upgrades.upgradeTypes(upgradeId);
    const price = raw[3];
    const tx    = await this._contracts.upgrades.buyUpgrade(upgradeId, amount, { value: price * BigInt(amount) });
    return tx.wait();
  }

  async equip(carId, upgradeId, slot) {
    const tx = await this._contracts.upgrades.equip(carId, upgradeId, slot);
    return tx.wait();
  }

  async unequip(carId, slot) {
    const tx = await this._contracts.upgrades.unequip(carId, slot);
    return tx.wait();
  }

  // ── Marketplace ───────────────────────────────────────────────
  async getListings() {
    const filter = this._contracts.marketplace.filters.Listed();
    const events = await this._contracts.marketplace.queryFilter(filter, 0, "latest");
    const listings = [];
    for (const e of events) {
      const tokenId = Number(e.args.tokenId);
      try {
        const l = await this._contracts.marketplace.listings(tokenId);
        if (!l[2]) continue; // not active
        listings.push({ tokenId, seller: l[0], price: ethers.formatEther(l[1]), active: l[2] });
      } catch {}
    }
    return listings;
  }

  async listCar(tokenId, priceAvax) {
    const price = ethers.parseEther(priceAvax.toString());
    const isApproved = await this._contracts.carNFT.isApprovedForAll(this.address, this.config.carMarketplace);
    if (!isApproved) {
      const t = await this._contracts.carNFT.setApprovalForAll(this.config.carMarketplace, true);
      await t.wait();
    }
    const tx = await this._contracts.marketplace.list(tokenId, price);
    return tx.wait();
  }

  async delistCar(tokenId) {
    const tx = await this._contracts.marketplace.delist(tokenId);
    return tx.wait();
  }

  async buyCar(tokenId) {
    const l   = await this._contracts.marketplace.listings(tokenId);
    const tx  = await this._contracts.marketplace.buy(tokenId, { value: l[1] });
    return tx.wait();
  }

  // ── Wager races ───────────────────────────────────────────────
  async createWager(raceId, wagerAvax) {
    const tx = await this._contracts.wager.createRace(raceId, { value: ethers.parseEther(wagerAvax.toString()) });
    return tx.wait();
  }

  async joinWager(raceId, wagerAvax) {
    const tx = await this._contracts.wager.joinRace(raceId, { value: ethers.parseEther(wagerAvax.toString()) });
    return tx.wait();
  }

  async cancelWager(raceId) {
    const tx = await this._contracts.wager.cancel(raceId);
    return tx.wait();
  }

  // ── Title races ───────────────────────────────────────────────
  async createTitle(raceId, carId) {
    const fee = await this._contracts.titleRace.entryFee();
    const t   = await this._contracts.carNFT.approve(this.config.titleRace, carId);
    await t.wait();
    const tx  = await this._contracts.titleRace.createRace(raceId, carId, { value: fee });
    return tx.wait();
  }

  async joinTitle(raceId, carId) {
    const fee = await this._contracts.titleRace.entryFee();
    const t   = await this._contracts.carNFT.approve(this.config.titleRace, carId);
    await t.wait();
    const tx  = await this._contracts.titleRace.joinRace(raceId, carId, { value: fee });
    return tx.wait();
  }

  async cancelTitle(raceId) {
    const tx = await this._contracts.titleRace.cancel(raceId);
    return tx.wait();
  }

  // ── Events (minimal) ─────────────────────────────────────────
  on(event, cb)  { (this._listeners[event] ||= []).push(cb); }
  _emit(e, d)    { (this._listeners[e] || []).forEach(cb => cb(d)); }
}
