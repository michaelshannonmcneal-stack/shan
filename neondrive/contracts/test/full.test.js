const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, mine } = require("@nomicfoundation/hardhat-network-helpers");

const MALICIOUS_SELLER_ABI = [
  "function attack(address marketplace, uint256 tokenId) external payable",
  "function withdrawAll() external",
];

describe("NeonDrive Contracts", function () {
  async function deployAll() {
    const [owner, feeRecipient, resolver, player1, player2, buyer, extra] =
      await ethers.getSigners();

    const RaceCarNFT = await ethers.getContractFactory("RaceCarNFT");
    const carNFT = await RaceCarNFT.deploy(
      owner.address,
      feeRecipient.address,
      "https://metadata.neondrive.io/cars/"
    );

    const CarUpgrades = await ethers.getContractFactory("CarUpgrades");
    const upgrades = await CarUpgrades.deploy(
      owner.address,
      await carNFT.getAddress(),
      feeRecipient.address
    );

    const CarMarketplace = await ethers.getContractFactory("CarMarketplace");
    const marketplace = await CarMarketplace.deploy(
      owner.address,
      await carNFT.getAddress(),
      feeRecipient.address
    );

    const RaceWager = await ethers.getContractFactory("RaceWager");
    const wager = await RaceWager.deploy(
      owner.address,
      resolver.address,
      feeRecipient.address
    );

    const TitleRace = await ethers.getContractFactory("TitleRace");
    const titleRace = await TitleRace.deploy(
      owner.address,
      await carNFT.getAddress(),
      resolver.address,
      feeRecipient.address,
      ethers.parseEther("0.1")
    );

    return { carNFT, upgrades, marketplace, wager, titleRace, owner, feeRecipient, resolver, player1, player2, buyer, extra };
  }

  async function mintCarTo(carNFT, owner, to) {
    const stats = { speed: 50, handling: 50, acceleration: 50, durability: 50, boost: 50, rarity: 0 };
    await carNFT.connect(owner).ownerMint(to.address, stats, "ipfs://test");
    const total = await carNFT.totalSupply();
    return total;
  }

  // ── RaceCarNFT ───────────────────────────────────────────────────────────
  describe("RaceCarNFT", function () {
    it("deploy succeeds and sets name/symbol/feeRecipient", async function () {
      const { carNFT, feeRecipient } = await loadFixture(deployAll);
      expect(await carNFT.name()).to.equal("PINKS NeonDrive Car");
      expect(await carNFT.symbol()).to.equal("PNDC");
      expect(await carNFT.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("mint(1): emits CarMinted, mintCount increments, stats populated, URI set", async function () {
      const { carNFT, buyer } = await loadFixture(deployAll);
      const mintPrice = await carNFT.MINT_PRICE();
      const tx = await carNFT.connect(buyer).mint(1, { value: mintPrice });
      const receipt = await tx.wait();
      const event = receipt.logs.map(log => { try { return carNFT.interface.parseLog(log); } catch { return null; } }).find(e => e && e.name === "CarMinted");
      expect(event).to.not.be.undefined;
      expect(event.args.to).to.equal(buyer.address);
      expect(event.args.tokenId).to.equal(1n);
      expect(await carNFT.mintCount(buyer.address)).to.equal(1n);
      const stats = await carNFT.carStats(1n);
      expect(stats.rarity).to.be.within(0, 4);
      expect(stats.speed).to.be.within(30, 99);
      const uri = await carNFT.tokenURI(1n);
      expect(uri).to.include("1.json");
    });

    it("mint(3): succeeds at cap", async function () {
      const { carNFT, buyer } = await loadFixture(deployAll);
      const mintPrice = await carNFT.MINT_PRICE();
      await carNFT.connect(buyer).mint(3, { value: mintPrice * 3n });
      expect(await carNFT.mintCount(buyer.address)).to.equal(3n);
      expect(await carNFT.totalSupply()).to.equal(3n);
    });

    it("mint(4): reverts 'Invalid qty'", async function () {
      const { carNFT, buyer } = await loadFixture(deployAll);
      const mintPrice = await carNFT.MINT_PRICE();
      await expect(carNFT.connect(buyer).mint(4, { value: mintPrice * 4n })).to.be.revertedWith("Invalid qty");
    });

    it("second mint: wallet that already has 3 reverts 'Wallet cap exceeded'", async function () {
      const { carNFT, buyer } = await loadFixture(deployAll);
      const mintPrice = await carNFT.MINT_PRICE();
      await carNFT.connect(buyer).mint(3, { value: mintPrice * 3n });
      await expect(carNFT.connect(buyer).mint(1, { value: mintPrice })).to.be.revertedWith("Wallet cap exceeded");
    });

    it("mint with wrong AVAX reverts 'Wrong AVAX amount'", async function () {
      const { carNFT, buyer } = await loadFixture(deployAll);
      const mintPrice = await carNFT.MINT_PRICE();
      await expect(carNFT.connect(buyer).mint(1, { value: mintPrice - 1n })).to.be.revertedWith("Wrong AVAX amount");
    });

    it("ownerMint: creates car with exact stats provided", async function () {
      const { carNFT, owner, buyer } = await loadFixture(deployAll);
      const stats = { speed: 95, handling: 88, acceleration: 90, durability: 75, boost: 92, rarity: 4 };
      await carNFT.connect(owner).ownerMint(buyer.address, stats, "ipfs://phantom");
      const tokenId = await carNFT.totalSupply();
      const stored = await carNFT.carStats(tokenId);
      expect(stored.speed).to.equal(95);
      expect(stored.handling).to.equal(88);
      expect(stored.acceleration).to.equal(90);
      expect(stored.durability).to.equal(75);
      expect(stored.boost).to.equal(92);
      expect(stored.rarity).to.equal(4);
      expect(await carNFT.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("ownerMint by non-owner reverts", async function () {
      const { carNFT, buyer } = await loadFixture(deployAll);
      const stats = { speed: 50, handling: 50, acceleration: 50, durability: 50, boost: 50, rarity: 0 };
      await expect(carNFT.connect(buyer).ownerMint(buyer.address, stats, "ipfs://test")).to.be.revertedWithCustomError(carNFT, "OwnableUnauthorizedAccount");
    });

    it("setFeeRecipient by non-owner reverts", async function () {
      const { carNFT, buyer } = await loadFixture(deployAll);
      await expect(carNFT.connect(buyer).setFeeRecipient(buyer.address)).to.be.revertedWithCustomError(carNFT, "OwnableUnauthorizedAccount");
    });

    it("setFeeRecipient zero address reverts", async function () {
      const { carNFT, owner } = await loadFixture(deployAll);
      await expect(carNFT.connect(owner).setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWith("Zero address");
    });

    it("feeRecipient receives mint proceeds", async function () {
      const { carNFT, buyer, feeRecipient } = await loadFixture(deployAll);
      const mintPrice = await carNFT.MINT_PRICE();
      const before = await ethers.provider.getBalance(feeRecipient.address);
      await carNFT.connect(buyer).mint(1, { value: mintPrice });
      const after = await ethers.provider.getBalance(feeRecipient.address);
      expect(after - before).to.equal(mintPrice);
    });
  });

  // ── CarUpgrades ──────────────────────────────────────────────────────────
  describe("CarUpgrades", function () {
    async function deployWithUpgrade() {
      const all = await deployAll();
      const { upgrades, owner } = all;
      await upgrades.connect(owner).createUpgrade(1, "Engine Mk1", 0, 5, ethers.parseEther("0.05"));
      return all;
    }

    it("deploy succeeds", async function () {
      const { upgrades, carNFT, feeRecipient } = await loadFixture(deployAll);
      expect(await upgrades.carNFT()).to.equal(await carNFT.getAddress());
      expect(await upgrades.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("createUpgrade: stores type correctly", async function () {
      const { upgrades, owner } = await loadFixture(deployAll);
      await upgrades.connect(owner).createUpgrade(1, "Engine Mk1", 0, 5, ethers.parseEther("0.05"));
      const u = await upgrades.upgradeTypes(1);
      expect(u.name).to.equal("Engine Mk1");
      expect(u.statIndex).to.equal(0);
      expect(u.boostAmount).to.equal(5);
      expect(u.price).to.equal(ethers.parseEther("0.05"));
      expect(u.exists).to.be.true;
    });

    it("createUpgrade: duplicate ID reverts", async function () {
      const { upgrades, owner } = await loadFixture(deployWithUpgrade);
      await expect(upgrades.connect(owner).createUpgrade(1, "Dup", 0, 5, ethers.parseEther("0.05"))).to.be.revertedWith("ID already exists");
    });

    it("createUpgrade: bad statIndex reverts", async function () {
      const { upgrades, owner } = await loadFixture(deployAll);
      await expect(upgrades.connect(owner).createUpgrade(99, "Bad", 5, 5, ethers.parseEther("0.05"))).to.be.revertedWith("Invalid stat index");
    });

    it("createUpgrade: non-owner reverts", async function () {
      const { upgrades, buyer } = await loadFixture(deployAll);
      await expect(upgrades.connect(buyer).createUpgrade(1, "X", 0, 5, ethers.parseEther("0.05"))).to.be.revertedWithCustomError(upgrades, "OwnableUnauthorizedAccount");
    });

    it("buyUpgrade: mints ERC1155 balance and fee forwarded", async function () {
      const { upgrades, feeRecipient, buyer } = await loadFixture(deployWithUpgrade);
      const price = ethers.parseEther("0.05");
      const before = await ethers.provider.getBalance(feeRecipient.address);
      await upgrades.connect(buyer).buyUpgrade(1, 2, { value: price * 2n });
      expect(await upgrades.balanceOf(buyer.address, 1)).to.equal(2n);
      const after = await ethers.provider.getBalance(feeRecipient.address);
      expect(after - before).to.equal(price * 2n);
    });

    it("buyUpgrade: wrong price reverts", async function () {
      const { upgrades, buyer } = await loadFixture(deployWithUpgrade);
      await expect(upgrades.connect(buyer).buyUpgrade(1, 1, { value: 1n })).to.be.revertedWith("Wrong AVAX amount");
    });

    it("equip: slots the part, burns from inventory", async function () {
      const { carNFT, upgrades, owner, buyer } = await loadFixture(deployWithUpgrade);
      const tokenId = await mintCarTo(carNFT, owner, buyer);
      const price = ethers.parseEther("0.05");
      await upgrades.connect(buyer).buyUpgrade(1, 1, { value: price });
      expect(await upgrades.balanceOf(buyer.address, 1)).to.equal(1n);
      await upgrades.connect(buyer).equip(tokenId, 1, 0);
      expect(await upgrades.balanceOf(buyer.address, 1)).to.equal(0n);
      expect(await upgrades.equippedParts(tokenId, 0)).to.equal(1n);
    });

    it("equip: replaces existing part (old returned to inventory)", async function () {
      const { carNFT, upgrades, owner, buyer } = await loadFixture(deployWithUpgrade);
      await upgrades.connect(owner).createUpgrade(2, "Engine Mk2", 0, 8, ethers.parseEther("0.1"));
      const tokenId = await mintCarTo(carNFT, owner, buyer);
      await upgrades.connect(buyer).buyUpgrade(1, 1, { value: ethers.parseEther("0.05") });
      await upgrades.connect(buyer).buyUpgrade(2, 1, { value: ethers.parseEther("0.1") });
      await upgrades.connect(buyer).equip(tokenId, 1, 0);
      expect(await upgrades.equippedParts(tokenId, 0)).to.equal(1n);
      await upgrades.connect(buyer).equip(tokenId, 2, 0);
      expect(await upgrades.equippedParts(tokenId, 0)).to.equal(2n);
      expect(await upgrades.balanceOf(buyer.address, 1)).to.equal(1n);
      expect(await upgrades.balanceOf(buyer.address, 2)).to.equal(0n);
    });

    it("equip: non-car-owner reverts", async function () {
      const { carNFT, upgrades, owner, buyer, extra } = await loadFixture(deployWithUpgrade);
      const tokenId = await mintCarTo(carNFT, owner, buyer);
      await upgrades.connect(extra).buyUpgrade(1, 1, { value: ethers.parseEther("0.05") });
      await expect(upgrades.connect(extra).equip(tokenId, 1, 0)).to.be.revertedWith("Not car owner");
    });

    it("equip: invalid slot reverts", async function () {
      const { carNFT, upgrades, owner, buyer } = await loadFixture(deployWithUpgrade);
      const tokenId = await mintCarTo(carNFT, owner, buyer);
      await upgrades.connect(buyer).buyUpgrade(1, 1, { value: ethers.parseEther("0.05") });
      await expect(upgrades.connect(buyer).equip(tokenId, 1, 5)).to.be.revertedWith("Invalid slot");
    });

    it("equip: no balance reverts", async function () {
      const { carNFT, upgrades, owner, buyer } = await loadFixture(deployWithUpgrade);
      const tokenId = await mintCarTo(carNFT, owner, buyer);
      await expect(upgrades.connect(buyer).equip(tokenId, 1, 0)).to.be.revertedWith("Don't own upgrade");
    });

    it("unequip: returns to inventory", async function () {
      const { carNFT, upgrades, owner, buyer } = await loadFixture(deployWithUpgrade);
      const tokenId = await mintCarTo(carNFT, owner, buyer);
      await upgrades.connect(buyer).buyUpgrade(1, 1, { value: ethers.parseEther("0.05") });
      await upgrades.connect(buyer).equip(tokenId, 1, 0);
      expect(await upgrades.balanceOf(buyer.address, 1)).to.equal(0n);
      await upgrades.connect(buyer).unequip(tokenId, 0);
      expect(await upgrades.balanceOf(buyer.address, 1)).to.equal(1n);
      expect(await upgrades.equippedParts(tokenId, 0)).to.equal(0n);
    });

    it("unequip: empty slot reverts", async function () {
      const { carNFT, upgrades, owner, buyer } = await loadFixture(deployWithUpgrade);
      const tokenId = await mintCarTo(carNFT, owner, buyer);
      await expect(upgrades.connect(buyer).unequip(tokenId, 0)).to.be.revertedWith("Slot empty");
    });

    it("getEffectiveStats: base + boost, capped at 100", async function () {
      const { carNFT, upgrades, owner, buyer } = await loadFixture(deployWithUpgrade);
      await upgrades.connect(owner).createUpgrade(99, "Max Boost", 0, 20, ethers.parseEther("0.5"));
      const stats = { speed: 90, handling: 50, acceleration: 50, durability: 50, boost: 50, rarity: 3 };
      await carNFT.connect(owner).ownerMint(buyer.address, stats, "ipfs://fast");
      const tokenId = await carNFT.totalSupply();
      await upgrades.connect(buyer).buyUpgrade(1, 1, { value: ethers.parseEther("0.05") });
      await upgrades.connect(buyer).equip(tokenId, 1, 0);
      const eff = await upgrades.getEffectiveStats(tokenId);
      expect(eff[0]).to.equal(95);
      await upgrades.connect(buyer).buyUpgrade(99, 1, { value: ethers.parseEther("0.5") });
      await upgrades.connect(buyer).equip(tokenId, 99, 1);
      const eff2 = await upgrades.getEffectiveStats(tokenId);
      expect(eff2[0]).to.equal(100);
      expect(eff2[1]).to.equal(50);
    });
  });

  // ── CarMarketplace ───────────────────────────────────────────────────────
  describe("CarMarketplace", function () {
    async function deployWithListing() {
      const all = await deployAll();
      const { carNFT, marketplace, owner, player1 } = all;
      const tokenId = await mintCarTo(carNFT, owner, player1);
      await carNFT.connect(player1).setApprovalForAll(await marketplace.getAddress(), true);
      await marketplace.connect(player1).list(tokenId, ethers.parseEther("1"));
      return { ...all, tokenId };
    }

    it("list: creates listing", async function () {
      const { marketplace, player1, tokenId } = await loadFixture(deployWithListing);
      const listing = await marketplace.listings(tokenId);
      expect(listing.seller).to.equal(player1.address);
      expect(listing.price).to.equal(ethers.parseEther("1"));
      expect(listing.active).to.be.true;
    });

    it("list: not owner reverts", async function () {
      const { carNFT, marketplace, owner, buyer } = await loadFixture(deployAll);
      const tokenId = await mintCarTo(carNFT, owner, owner);
      await carNFT.connect(owner).setApprovalForAll(await marketplace.getAddress(), true);
      await expect(marketplace.connect(buyer).list(tokenId, ethers.parseEther("1"))).to.be.revertedWith("Not owner");
    });

    it("list: not approved reverts", async function () {
      const { carNFT, marketplace, owner, player1 } = await loadFixture(deployAll);
      const tokenId = await mintCarTo(carNFT, owner, player1);
      await expect(marketplace.connect(player1).list(tokenId, ethers.parseEther("1"))).to.be.revertedWith("Not approved");
    });

    it("list: zero price reverts", async function () {
      const { carNFT, marketplace, owner, player1 } = await loadFixture(deployAll);
      const tokenId = await mintCarTo(carNFT, owner, player1);
      await carNFT.connect(player1).setApprovalForAll(await marketplace.getAddress(), true);
      await expect(marketplace.connect(player1).list(tokenId, 0n)).to.be.revertedWith("Zero price");
    });

    it("delist: removes listing", async function () {
      const { marketplace, player1, tokenId } = await loadFixture(deployWithListing);
      await marketplace.connect(player1).delist(tokenId);
      const listing = await marketplace.listings(tokenId);
      expect(listing.active).to.be.false;
    });

    it("delist: not seller reverts", async function () {
      const { marketplace, buyer, tokenId } = await loadFixture(deployWithListing);
      await expect(marketplace.connect(buyer).delist(tokenId)).to.be.revertedWith("Not seller");
    });

    it("buy: correct AVAX transfers — exact 3.5% fee math", async function () {
      const { marketplace, carNFT, player1, buyer, feeRecipient, tokenId } = await loadFixture(deployWithListing);
      const price = ethers.parseEther("1");
      const expectedFee = ethers.parseEther("0.035");
      const expectedPayout = ethers.parseEther("0.965");
      const sellerBefore = await ethers.provider.getBalance(player1.address);
      const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
      await marketplace.connect(buyer).buy(tokenId, { value: price });
      const sellerAfter = await ethers.provider.getBalance(player1.address);
      const feeAfter = await ethers.provider.getBalance(feeRecipient.address);
      expect(sellerAfter - sellerBefore).to.equal(expectedPayout);
      expect(feeAfter - feeBefore).to.equal(expectedFee);
    });

    it("buy: wrong price reverts", async function () {
      const { marketplace, buyer, tokenId } = await loadFixture(deployWithListing);
      await expect(marketplace.connect(buyer).buy(tokenId, { value: ethers.parseEther("0.5") })).to.be.revertedWith("Wrong price");
    });

    it("buy: not listed reverts", async function () {
      const { marketplace, buyer } = await loadFixture(deployAll);
      await expect(marketplace.connect(buyer).buy(9999n, { value: ethers.parseEther("1") })).to.be.revertedWith("Not listed");
    });

    it("buy: self-buy reverts", async function () {
      const { marketplace, player1, tokenId } = await loadFixture(deployWithListing);
      await expect(marketplace.connect(player1).buy(tokenId, { value: ethers.parseEther("1") })).to.be.revertedWith("Self-buy not allowed");
    });

    it("buy: transfers NFT to buyer", async function () {
      const { marketplace, carNFT, buyer, tokenId } = await loadFixture(deployWithListing);
      await marketplace.connect(buyer).buy(tokenId, { value: ethers.parseEther("1") });
      expect(await carNFT.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("Reentrancy: malicious seller cannot reenter buy()", async function () {
      const { carNFT, marketplace, owner, buyer, feeRecipient } = await loadFixture(deployAll);
      const MaliciousSeller = await ethers.getContractFactory("MaliciousSeller");
      const mal = await MaliciousSeller.deploy(await marketplace.getAddress());
      const malAddr = await mal.getAddress();
      const stats = { speed: 50, handling: 50, acceleration: 50, durability: 50, boost: 50, rarity: 0 };
      await carNFT.connect(owner).ownerMint(malAddr, stats, "ipfs://evil");
      const tokenId = await carNFT.totalSupply();
      await mal.approveMarketplace(await carNFT.getAddress(), tokenId);
      await mal.listCar(tokenId, ethers.parseEther("1"));
      const buyTx = marketplace.connect(buyer).buy(tokenId, { value: ethers.parseEther("1") });
      try {
        await (await buyTx).wait();
        const malBalance = await ethers.provider.getBalance(malAddr);
        expect(malBalance).to.be.lte(ethers.parseEther("1"));
      } catch (e) {
        expect(e.message).to.satisfy(m => m.includes("reentrant") || m.includes("Seller transfer failed") || m.includes("reverted"));
      }
    });
  });

  // ── RaceWager ────────────────────────────────────────────────────────────
  describe("RaceWager", function () {
    const raceId = ethers.id("race-001");
    const wagerAmt = ethers.parseEther("1");

    async function deployWithOpenRace() {
      const all = await deployAll();
      const { wager, player1 } = all;
      await wager.connect(player1).createRace(raceId, { value: wagerAmt });
      return all;
    }

    async function deployWithJoinedRace() {
      const all = await deployWithOpenRace();
      const { wager, player2 } = all;
      await wager.connect(player2).joinRace(raceId, { value: wagerAmt });
      return all;
    }

    it("createRace: state stored, ETH escrowed", async function () {
      const { wager, player1 } = await loadFixture(deployWithOpenRace);
      const race = await wager.races(raceId);
      expect(race.player1).to.equal(player1.address);
      expect(race.wager).to.equal(wagerAmt);
      expect(race.status).to.equal(0);
      expect(await ethers.provider.getBalance(await wager.getAddress())).to.equal(wagerAmt);
    });

    it("joinRace: state updated, block recorded", async function () {
      const { wager, player2 } = await loadFixture(deployWithJoinedRace);
      const race = await wager.races(raceId);
      expect(race.player2).to.equal(player2.address);
      expect(race.status).to.equal(1);
      expect(race.joinedBlock).to.be.gt(0n);
    });

    it("joinRace: wrong amount reverts", async function () {
      const { wager, player2 } = await loadFixture(deployWithOpenRace);
      await expect(wager.connect(player2).joinRace(raceId, { value: wagerAmt - 1n })).to.be.revertedWith("Wrong wager amount");
    });

    it("joinRace: self-join reverts", async function () {
      const { wager, player1 } = await loadFixture(deployWithOpenRace);
      await expect(wager.connect(player1).joinRace(raceId, { value: wagerAmt })).to.be.revertedWith("Cannot race yourself");
    });

    it("joinRace: not open reverts (already joined)", async function () {
      const { wager, extra } = await loadFixture(deployWithJoinedRace);
      await expect(wager.connect(extra).joinRace(raceId, { value: wagerAmt })).to.be.revertedWith("Race not open");
    });

    it("settle: winner gets correct payout, fee correct (3.5% of pot)", async function () {
      const { wager, resolver, player1, feeRecipient } = await loadFixture(deployWithJoinedRace);
      const expectedFee = ethers.parseEther("0.07");
      const expectedPayout = ethers.parseEther("1.93");
      const winnerBefore = await ethers.provider.getBalance(player1.address);
      const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
      await wager.connect(resolver).settle(raceId, player1.address);
      const winnerAfter = await ethers.provider.getBalance(player1.address);
      const feeAfter = await ethers.provider.getBalance(feeRecipient.address);
      expect(winnerAfter - winnerBefore).to.equal(expectedPayout);
      expect(feeAfter - feeBefore).to.equal(expectedFee);
    });

    it("settle: not resolver reverts", async function () {
      const { wager, player1 } = await loadFixture(deployWithJoinedRace);
      await expect(wager.connect(player1).settle(raceId, player1.address)).to.be.revertedWith("Not resolver");
    });

    it("settle: invalid winner reverts", async function () {
      const { wager, resolver, extra } = await loadFixture(deployWithJoinedRace);
      await expect(wager.connect(resolver).settle(raceId, extra.address)).to.be.revertedWith("Invalid winner");
    });

    it("settle: not joined reverts", async function () {
      const { wager, resolver, player1 } = await loadFixture(deployWithOpenRace);
      await expect(wager.connect(resolver).settle(raceId, player1.address)).to.be.revertedWith("Race not joined");
    });

    it("cancel: p1 refunded", async function () {
      const { wager, player1 } = await loadFixture(deployWithOpenRace);
      const before = await ethers.provider.getBalance(player1.address);
      const tx = await wager.connect(player1).cancel(raceId);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(player1.address);
      expect(after + gasCost - before).to.equal(wagerAmt);
    });

    it("cancel: non-p1 reverts", async function () {
      const { wager, player2 } = await loadFixture(deployWithOpenRace);
      await expect(wager.connect(player2).cancel(raceId)).to.be.revertedWith("Not player 1");
    });

    it("cancel: joined race reverts", async function () {
      const { wager, player1 } = await loadFixture(deployWithJoinedRace);
      await expect(wager.connect(player1).cancel(raceId)).to.be.revertedWith("Race not open");
    });

    it("timeoutRefund: both players refunded after TIMEOUT_BLOCKS", async function () {
      const { wager, player1, player2 } = await loadFixture(deployWithJoinedRace);
      const TIMEOUT = await wager.TIMEOUT_BLOCKS();
      await mine(Number(TIMEOUT) + 1);
      const p1Before = await ethers.provider.getBalance(player1.address);
      const p2Before = await ethers.provider.getBalance(player2.address);
      const tx = await wager.connect(player1).timeoutRefund(raceId);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const p1After = await ethers.provider.getBalance(player1.address);
      const p2After = await ethers.provider.getBalance(player2.address);
      expect(p1After + gasCost - p1Before).to.equal(wagerAmt);
      expect(p2After - p2Before).to.equal(wagerAmt);
    });

    it("timeoutRefund: before timeout reverts", async function () {
      const { wager, player1 } = await loadFixture(deployWithJoinedRace);
      await expect(wager.connect(player1).timeoutRefund(raceId)).to.be.revertedWith("Not timed out yet");
    });

    it("timeoutRefund: non-player reverts", async function () {
      const { wager, extra } = await loadFixture(deployWithJoinedRace);
      const TIMEOUT = await wager.TIMEOUT_BLOCKS();
      await mine(Number(TIMEOUT) + 1);
      await expect(wager.connect(extra).timeoutRefund(raceId)).to.be.revertedWith("Not a player");
    });

    it("setResolver: only owner can set", async function () {
      const { wager, owner, extra, buyer } = await loadFixture(deployAll);
      await wager.connect(owner).setResolver(extra.address);
      expect(await wager.resolver()).to.equal(extra.address);
      await expect(wager.connect(buyer).setResolver(buyer.address)).to.be.revertedWithCustomError(wager, "OwnableUnauthorizedAccount");
    });

    it("Fee math: 1 AVAX wager each → pot=2, fee=0.07 AVAX, payout=1.93 AVAX", async function () {
      const { wager, resolver, player1, player2, feeRecipient } = await loadFixture(deployWithJoinedRace);
      const pot = wagerAmt * 2n;
      const fee = (pot * 350n) / 10000n;
      const payout = pot - fee;
      expect(fee).to.equal(ethers.parseEther("0.07"));
      expect(payout).to.equal(ethers.parseEther("1.93"));
      const p1Before = await ethers.provider.getBalance(player1.address);
      const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
      await wager.connect(resolver).settle(raceId, player1.address);
      const p1After = await ethers.provider.getBalance(player1.address);
      const feeAfter = await ethers.provider.getBalance(feeRecipient.address);
      expect(p1After - p1Before).to.equal(payout);
      expect(feeAfter - feeBefore).to.equal(fee);
    });
  });

  // ── TitleRace ────────────────────────────────────────────────────────────
  describe("TitleRace", function () {
    const raceId = ethers.id("title-race-001");
    const ENTRY_FEE = ethers.parseEther("0.1");

    async function deployWithCars() {
      const all = await deployAll();
      const { carNFT, titleRace, owner, player1, player2 } = all;
      const titleRaceAddr = await titleRace.getAddress();
      const car1Id = await mintCarTo(carNFT, owner, player1);
      const car2Id = await mintCarTo(carNFT, owner, player2);
      await carNFT.connect(player1).setApprovalForAll(titleRaceAddr, true);
      await carNFT.connect(player2).setApprovalForAll(titleRaceAddr, true);
      return { ...all, car1Id, car2Id };
    }

    async function deployWithOpenTitleRace() {
      const all = await deployWithCars();
      const { titleRace, player1, car1Id } = all;
      await titleRace.connect(player1).createRace(raceId, car1Id, { value: ENTRY_FEE });
      return all;
    }

    async function deployWithJoinedTitleRace() {
      const all = await deployWithOpenTitleRace();
      const { titleRace, player2, car2Id } = all;
      await titleRace.connect(player2).joinRace(raceId, car2Id, { value: ENTRY_FEE });
      return all;
    }

    it("createRace: escrows NFT + entry fee", async function () {
      const { titleRace, carNFT, car1Id } = await loadFixture(deployWithOpenTitleRace);
      const titleRaceAddr = await titleRace.getAddress();
      expect(await carNFT.ownerOf(car1Id)).to.equal(titleRaceAddr);
      expect(await ethers.provider.getBalance(titleRaceAddr)).to.equal(ENTRY_FEE);
    });

    it("createRace: duplicate ID reverts", async function () {
      const { titleRace, player1, carNFT, owner } = await loadFixture(deployWithOpenTitleRace);
      await carNFT.connect(owner).ownerMint(player1.address, { speed: 50, handling: 50, acceleration: 50, durability: 50, boost: 50, rarity: 0 }, "ipfs://x");
      const extraCar = await carNFT.totalSupply();
      await carNFT.connect(player1).setApprovalForAll(await titleRace.getAddress(), true);
      await expect(titleRace.connect(player1).createRace(raceId, extraCar, { value: ENTRY_FEE })).to.be.revertedWith("Race ID taken");
    });

    it("createRace: wrong fee reverts", async function () {
      const { titleRace, carNFT, owner, player1 } = await loadFixture(deployWithCars);
      const anotherRaceId = ethers.id("title-race-002");
      const tokenId = await mintCarTo(carNFT, owner, player1);
      await carNFT.connect(player1).setApprovalForAll(await titleRace.getAddress(), true);
      await expect(titleRace.connect(player1).createRace(anotherRaceId, tokenId, { value: ENTRY_FEE - 1n })).to.be.revertedWith("Wrong entry fee");
    });

    it("createRace: not car owner reverts", async function () {
      const { titleRace, carNFT, owner, player2, car1Id } = await loadFixture(deployWithCars);
      const anotherRaceId = ethers.id("title-race-003");
      await carNFT.connect(player2).setApprovalForAll(await titleRace.getAddress(), true);
      await expect(titleRace.connect(player2).createRace(anotherRaceId, car1Id, { value: ENTRY_FEE })).to.be.revertedWith("Not car owner");
    });

    it("joinRace: escrows second NFT", async function () {
      const { titleRace, carNFT, car2Id } = await loadFixture(deployWithJoinedTitleRace);
      const titleRaceAddr = await titleRace.getAddress();
      expect(await carNFT.ownerOf(car2Id)).to.equal(titleRaceAddr);
      expect(await ethers.provider.getBalance(titleRaceAddr)).to.equal(ENTRY_FEE * 2n);
    });

    it("joinRace: wrong fee reverts", async function () {
      const { titleRace, player2, car2Id } = await loadFixture(deployWithOpenTitleRace);
      await expect(titleRace.connect(player2).joinRace(raceId, car2Id, { value: ENTRY_FEE - 1n })).to.be.revertedWith("Wrong entry fee");
    });

    it("settle: winner gets both NFTs, fees forwarded to feeRecipient", async function () {
      const { titleRace, carNFT, resolver, player1, car1Id, car2Id, feeRecipient } = await loadFixture(deployWithJoinedTitleRace);
      const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
      await titleRace.connect(resolver).settle(raceId, player1.address);
      expect(await carNFT.ownerOf(car1Id)).to.equal(player1.address);
      expect(await carNFT.ownerOf(car2Id)).to.equal(player1.address);
      const feeAfter = await ethers.provider.getBalance(feeRecipient.address);
      expect(feeAfter - feeBefore).to.equal(ENTRY_FEE * 2n);
    });

    it("settle: not resolver reverts", async function () {
      const { titleRace, player1 } = await loadFixture(deployWithJoinedTitleRace);
      await expect(titleRace.connect(player1).settle(raceId, player1.address)).to.be.revertedWith("Not resolver");
    });

    it("settle: invalid winner reverts", async function () {
      const { titleRace, resolver, extra } = await loadFixture(deployWithJoinedTitleRace);
      await expect(titleRace.connect(resolver).settle(raceId, extra.address)).to.be.revertedWith("Invalid winner");
    });

    it("cancel: car returned + fee refunded to player1", async function () {
      const { titleRace, carNFT, player1, car1Id } = await loadFixture(deployWithOpenTitleRace);
      const p1Before = await ethers.provider.getBalance(player1.address);
      const tx = await titleRace.connect(player1).cancel(raceId);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const p1After = await ethers.provider.getBalance(player1.address);
      expect(await carNFT.ownerOf(car1Id)).to.equal(player1.address);
      expect(p1After + gasCost - p1Before).to.equal(ENTRY_FEE);
    });

    it("cancel: not p1 reverts", async function () {
      const { titleRace, player2 } = await loadFixture(deployWithOpenTitleRace);
      await expect(titleRace.connect(player2).cancel(raceId)).to.be.revertedWith("Not player 1");
    });

    it("timeoutRefund: both cars returned + fees refunded", async function () {
      const { titleRace, carNFT, player1, player2, car1Id, car2Id } = await loadFixture(deployWithJoinedTitleRace);
      const TIMEOUT = await titleRace.TIMEOUT_BLOCKS();
      await mine(Number(TIMEOUT) + 1);
      const p1Before = await ethers.provider.getBalance(player1.address);
      const p2Before = await ethers.provider.getBalance(player2.address);
      const tx = await titleRace.connect(player1).timeoutRefund(raceId);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const p1After = await ethers.provider.getBalance(player1.address);
      const p2After = await ethers.provider.getBalance(player2.address);
      expect(await carNFT.ownerOf(car1Id)).to.equal(player1.address);
      expect(await carNFT.ownerOf(car2Id)).to.equal(player2.address);
      expect(p1After + gasCost - p1Before).to.equal(ENTRY_FEE);
      expect(p2After - p2Before).to.equal(ENTRY_FEE);
    });

    it("timeoutRefund: before timeout reverts", async function () {
      const { titleRace, player1 } = await loadFixture(deployWithJoinedTitleRace);
      await expect(titleRace.connect(player1).timeoutRefund(raceId)).to.be.revertedWith("Not timed out yet");
    });
  });
});
