const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "AVAX");

  // Fee recipient = deployer for now; change before mainnet
  const feeRecipient = deployer.address;
  const resolver     = process.env.RESOLVER_ADDRESS || deployer.address;

  // 1. RaceCarNFT
  const RaceCarNFT = await hre.ethers.getContractFactory("RaceCarNFT");
  const carNFT = await RaceCarNFT.deploy(
    deployer.address,
    feeRecipient,
    process.env.BASE_METADATA_URI || "https://metadata.neondrive.io/cars/"
  );
  await carNFT.waitForDeployment();
  console.log("RaceCarNFT:", await carNFT.getAddress());

  // 2. CarUpgrades
  const CarUpgrades = await hre.ethers.getContractFactory("CarUpgrades");
  const upgrades = await CarUpgrades.deploy(
    deployer.address, await carNFT.getAddress(), feeRecipient
  );
  await upgrades.waitForDeployment();
  console.log("CarUpgrades:", await upgrades.getAddress());

  // 3. CarMarketplace
  const CarMarketplace = await hre.ethers.getContractFactory("CarMarketplace");
  const marketplace = await CarMarketplace.deploy(
    deployer.address, await carNFT.getAddress(), feeRecipient
  );
  await marketplace.waitForDeployment();
  console.log("CarMarketplace:", await marketplace.getAddress());

  // 4. RaceWager
  const RaceWager = await hre.ethers.getContractFactory("RaceWager");
  const wager = await RaceWager.deploy(
    deployer.address, resolver, feeRecipient
  );
  await wager.waitForDeployment();
  console.log("RaceWager:", await wager.getAddress());

  // 5. TitleRace
  const entryFee = hre.ethers.parseEther(process.env.TITLE_ENTRY_FEE || "0.1");
  const TitleRace = await hre.ethers.getContractFactory("TitleRace");
  const titleRace = await TitleRace.deploy(
    deployer.address,
    await carNFT.getAddress(),
    resolver,
    feeRecipient,
    entryFee
  );
  await titleRace.waitForDeployment();
  console.log("TitleRace:", await titleRace.getAddress());

  // Save addresses
  const fs = require("fs");
  const addresses = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    raceCarNFT:      await carNFT.getAddress(),
    carUpgrades:     await upgrades.getAddress(),
    carMarketplace:  await marketplace.getAddress(),
    raceWager:       await wager.getAddress(),
    titleRace:       await titleRace.getAddress(),
    deployedAt:      new Date().toISOString(),
  };

  const outPath = `./deployed-${hre.network.name}.json`;
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log("Addresses saved to", outPath);
}

main().catch(err => { console.error(err); process.exit(1); });
