/**
 * resolver/index.js — NeonDrive race resolver service.
 * NEVER hardcode private keys. Always use environment variables.
 */

import "dotenv/config";
import express  from "express";
import { ethers } from "ethers";
import { Settler } from "./settler.js";
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const network = process.env.NETWORK || "fuji";
const addrFile = path.join(__dirname, `../contracts/deployed-${network}.json`);

if (!existsSync(addrFile)) {
  console.error(`No deployed addresses found at ${addrFile}`);
  console.error(`Run:  npm run deploy:${network}  first`);
  process.exit(1);
}

const deployed = JSON.parse(readFileSync(addrFile, "utf8"));

const SETTLE_ABI = [
  "function settle(bytes32 raceId, address winner) external"
];

const settler = new Settler({
  rpcUrl:       process.env.RPC_URL  || "https://api.avax-test.network/ext/bc/C/rpc",
  resolverKey:  process.env.RESOLVER_PRIVATE_KEY,   // never hardcoded
  wagerAddress: deployed.raceWager,
  titleAddress: deployed.titleRace,
  wagerAbi:     SETTLE_ABI,
  titleAbi:     SETTLE_ABI,
});

const app = express();
app.use(express.json());

const AUTH_TOKEN = process.env.RESOLVER_AUTH_TOKEN;
function auth(req, res, next) {
  if (!AUTH_TOKEN) return next();
  if (req.headers["x-resolver-token"] !== AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/health", (req, res) => {
  res.json({ ok: true, network, wager: deployed.raceWager, title: deployed.titleRace });
});

app.post("/settle/wager", auth, async (req, res) => {
  try {
    const { raceId, winner } = req.body;
    if (!raceId || !winner) return res.status(400).json({ error: "raceId and winner required" });
    const receipt = await settler.settleWager(raceId, winner);
    res.json({ ok: true, tx: receipt.hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/settle/title", auth, async (req, res) => {
  try {
    const { raceId, winner } = req.body;
    if (!raceId || !winner) return res.status(400).json({ error: "raceId and winner required" });
    const receipt = await settler.settleTitle(raceId, winner);
    res.json({ ok: true, tx: receipt.hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[resolver] listening on :${PORT}  network=${network}`);
});
