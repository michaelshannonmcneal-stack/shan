const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const boosts  = [5, 8, 12, 16, 20];
const prices  = ["0.05", "0.1", "0.2", "0.35", "0.5"];
const cats    = [
  { prefix: "Engine", stat: 0 },
  { prefix: "Tires",  stat: 1 },
  { prefix: "NOS",    stat: 2 },
  { prefix: "Armor",  stat: 3 },
  { prefix: "Turbo",  stat: 4 },
];

const UPGRADES = [];
let id = 1;
for (const cat of cats) {
  for (let mk = 1; mk <= 5; mk++) {
    UPGRADES.push({
      id,
      name:   `${cat.prefix} Mk${mk}`,
      stat:   cat.stat,
      boost:  boosts[mk - 1],
      price:  prices[mk - 1],
    });
    id++;
  }
}
UPGRADES.push({ id: 26, name: "Race ECU", stat: 0, boost: 15, price: "0.3" });
UPGRADES.push({ id: 27, name: "Aero Kit", stat: 1, boost: 15, price: "0.3" });

const NAMED_CARS = [
  { name: "Phantom",  stats: { speed: 95, handling: 88, acceleration: 90, durability: 75, boost: 92, rarity: 4 } },
  { name: "Specter",  stats: { speed: 82, handling: 85, acceleration: 88, durability: 80, boost: 78, rarity: 3 } },
  { name: "Ghost",    stats: { speed: 75, handling: 72, acceleration: 70, durability: 85, boost: 68, rarity: 2 } },
  { name: "Wraith",   stats: { speed: 70, handling: 78, acceleration: 72, durability: 75, boost: 73, rarity: 2 } },
  { name: "Banshee",  stats: { speed: 60, handling: 65, acceleration: 62, durability: 68, boost: 58, rarity: 1 } },
  { name: "Revenant", stats: { speed: 50, handling: 52, acceleration: 48, durability: 55, boost: 45, rarity: 0 } },
];

async function main() {
  const network = hre.network.name;
  const addrFile = path.join(__dirname, `../deployed-${network}.json`);

  if (!fs.existsSync(addrFile)) {
    throw new Error(`No deployed-${network}.json found. Run deploy.js first.`);
  }
  const addresses = JSON.parse(fs.readFileSync(addrFile, "utf8"));
  console.log(`Seeding on ${network}`, addresses);

  const [deployer] = await hre.ethers.getSigners();

  const carUpgrades = await hre.ethers.getContractAt("CarUpgrades", addresses.carUpgrades, deployer);
  const carNFT = await hre.ethers.getContractAt("RaceCarNFT", addresses.raceCarNFT, deployer);

  console.log("\n── Creating 27 upgrade types ──");
  for (const u of UPGRADES) {
    const price = hre.ethers.parseEther(u.price);
    console.log(`  [${u.id}] ${u.name} stat=${u.stat} boost=${u.boost} price=${u.price} AVAX`);
    const tx = await carUpgrades.createUpgrade(u.id, u.name, u.stat, u.boost, price);
    await tx.wait();
  }
  console.log("All upgrades created.");

  console.log("\n── Minting 6 named cars to deployer ──");
  const baseURI = process.env.BASE_METADATA_URI || "https://metadata.neondrive.io/cars/";
  for (const car of NAMED_CARS) {
    const uri = `${baseURI}${car.name.toLowerCase()}.json`;
    console.log(`  Minting ${car.name} rarity=${car.stats.rarity}`);
    const tx = await carNFT.ownerMint(deployer.address, car.stats, uri);
    await tx.wait();
  }
  console.log("All named cars minted.");
  console.log("\nTotal supply:", (await carNFT.totalSupply()).toString());
}

main().catch(err => { console.error(err); process.exit(1); });
