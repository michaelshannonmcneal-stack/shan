/**
 * config.js — deployed contract addresses and chain config.
 * Fill in addresses after running:  npm run deploy:fuji
 */

export const CHAINS = {
  fuji: {
    chainId:    "0xa869",
    chainName:  "Avalanche Fuji Testnet",
    rpcUrl:     "https://api.avax-test.network/ext/bc/C/rpc",
    explorer:   "https://testnet.snowtrace.io",
    currency:   { name: "AVAX", symbol: "AVAX", decimals: 18 },
    // Filled in after deploy:fuji
    raceCarNFT:     "",
    carUpgrades:    "",
    carMarketplace: "",
    raceWager:      "",
    titleRace:      "",
  },
  avax: {
    chainId:    "0xa86a",
    chainName:  "Avalanche Mainnet",
    rpcUrl:     "https://api.avax.network/ext/bc/C/rpc",
    explorer:   "https://snowtrace.io",
    currency:   { name: "AVAX", symbol: "AVAX", decimals: 18 },
    raceCarNFT:     "",
    carUpgrades:    "",
    carMarketplace: "",
    raceWager:      "",
    titleRace:      "",
  },
};

export const DEFAULT_CHAIN = "fuji";

// Minimal ABIs — just the functions the UI calls
export const ABIS = {
  raceCarNFT: [
    "function mint(uint256 quantity) external payable",
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function tokenURI(uint256 tokenId) external view returns (string)",
    "function totalSupply() external view returns (uint256)",
    "function mintCount(address) external view returns (uint256)",
    "function carStats(uint256) external view returns (uint8,uint8,uint8,uint8,uint8,uint8)",
    "function approve(address to, uint256 tokenId) external",
    "function setApprovalForAll(address operator, bool approved) external",
    "function isApprovedForAll(address owner, address operator) external view returns (bool)",
    "event CarMinted(address indexed to, uint256 indexed tokenId, tuple(uint8,uint8,uint8,uint8,uint8,uint8) stats)",
  ],
  carUpgrades: [
    "function buyUpgrade(uint256 upgradeId, uint256 amount) external payable",
    "function equip(uint256 carId, uint256 upgradeId, uint8 slot) external",
    "function unequip(uint256 carId, uint8 slot) external",
    "function getEffectiveStats(uint256 carId) external view returns (uint8[5])",
    "function getEquipped(uint256 carId) external view returns (uint256[5])",
    "function upgradeTypes(uint256) external view returns (string,uint8,uint8,uint256,bool)",
    "function balanceOf(address account, uint256 id) external view returns (uint256)",
    "function allUpgradeIds() external view returns (uint256[])",
  ],
  carMarketplace: [
    "function list(uint256 tokenId, uint256 price) external",
    "function delist(uint256 tokenId) external",
    "function buy(uint256 tokenId) external payable",
    "function listings(uint256) external view returns (address,uint256,bool)",
    "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
    "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee)",
  ],
  raceWager: [
    "function createRace(bytes32 raceId) external payable",
    "function joinRace(bytes32 raceId) external payable",
    "function cancel(bytes32 raceId) external",
    "function timeoutRefund(bytes32 raceId) external",
    "function races(bytes32) external view returns (address,address,uint256,uint256,uint8)",
    "event RaceCreated(bytes32 indexed raceId, address indexed player1, uint256 wager)",
    "event RaceJoined(bytes32 indexed raceId, address indexed player2)",
    "event RaceSettled(bytes32 indexed raceId, address indexed winner, uint256 payout, uint256 fee)",
  ],
  titleRace: [
    "function createRace(bytes32 raceId, uint256 carId) external payable",
    "function joinRace(bytes32 raceId, uint256 carId) external payable",
    "function cancel(bytes32 raceId) external",
    "function timeoutRefund(bytes32 raceId) external",
    "function entryFee() external view returns (uint256)",
    "function races(bytes32) external view returns (address,address,uint256,uint256,uint256,uint8)",
    "event TitleRaceCreated(bytes32 indexed raceId, address indexed player1, uint256 car1Id)",
    "event TitleRaceJoined(bytes32 indexed raceId, address indexed player2, uint256 car2Id)",
    "event TitleRaceSettled(bytes32 indexed raceId, address indexed winner, uint256 wonCarId)",
  ],
};
