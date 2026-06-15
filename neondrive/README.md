# PINKS — NeonDrive

Avalanche C-Chain NFT street-racing dApp. Race car NFTs, upgrade parts, bet AVAX, win pink slips.

## Architecture

```
neondrive/
├── contracts/       Hardhat — 5 Solidity contracts + full test suite
├── web/             Vite SPA — Three.js garage, skill mini-game, MockChain/AvaxChain
├── resolver/        Node.js settle() service (authorized EOA pattern)
├── tools/           Asset pipeline scripts (Blender FBX→GLB, metadata generator)
└── metadata/        Generated JSON metadata for 6 cars + 27 upgrade parts
```

## Contracts

| Contract | Purpose |
|---|---|
| `RaceCarNFT` | ERC-721 with on-chain stats (speed/handling/acceleration/durability/boost/rarity) |
| `CarUpgrades` | ERC-1155 upgrade parts; `equip()` burns from inventory and writes to car slot |
| `CarMarketplace` | List/delist/buy cars; **3.5% fee** (350 bps) |
| `RaceWager` | AVAX wager escrow; **3.5% fee** on winnings; 300-block timeout |
| `TitleRace` | Pink-slip race — winner takes **both** NFTs; `entryFee` × 2 → fee recipient |

**Fee is exactly 3.5% (350 / 10 000). Never changes.**

## Race Engine

Hybrid model: player executes a timing skill mini-game AND car stats/upgrades influence win probability.

1. `carPowerScore` = weighted sum of `effectiveStats × trackWeights`
2. `skillMultiplier` = average of per-event ratings (PERFECT 1.25× → MISS 0.88×)
3. Win probability = `sigmoid((playerPower − opponentPower) / 12)` → (0, 1)
4. Roll `Math.random()` against probability → winner
5. Result sent to resolver → `settle(raceId, winner)` on-chain

## Tracks

8 tracks across 4 cities (Miami, Vegas, NYC, LA) × 2 modes (Drag / Circuit).
Each has `statWeights` and 4–7 skill events.

## Quick start

```bash
# Install all workspaces
npm install

# Run tests
npm test

# Start web dev server (mock mode — no wallet needed)
npm run dev

# Deploy to Fuji testnet
npm run deploy:fuji

# Seed contracts (27 upgrades + 6 cars)
npm run seed:fuji
```

## Environment variables

```bash
# contracts/.env
FUJI_PRIVATE_KEY=<deployer key — NEVER commit>
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc

# resolver/.env
RESOLVER_PRIVATE_KEY=<resolver EOA key — NEVER commit>
NEONDRIVE_RESOLVER_TOKEN=<shared secret for /settle endpoints>
```

## Asset pipeline

Blender is required to convert source FBX → optimised GLB. If Blender is installed:

```bash
python3 tools/convert_fbx_to_glb.py --print-command
```

That prints the exact `blender --background --python` command for your platform.
Place output `.glb` files in `web/public/models/cars/` and `web/public/models/parts/`.
The Three.js loader falls back to procedural meshes when GLBs are absent.

## Generate metadata

```bash
python3 tools/generate_metadata.py
# Writes metadata/cars/*.json and metadata/parts/*.json
```

## Resolver trust model

Current implementation: single **authorized EOA** calls `settle()`.
This is intentionally centralised for the prototype — the code documents three upgrade paths:
- **2-of-2 player signatures** (both sign the result, relay submits)
- **Commit-reveal** (hash committed on-chain, reveal after race)
- **Chainlink Functions** (fully trustless, result computed on-chain)

## Chainlink VRF

`RaceCarNFT._deriveStats()` currently uses pseudo-random block data.
The contract has a TODO comment with the exact steps to replace it with VRF v2.5.

## Fuji contract addresses

Fill in after running `npm run deploy:fuji`:

```
RaceCarNFT:     —
CarUpgrades:    —
CarMarketplace: —
RaceWager:      —
TitleRace:      —
```
