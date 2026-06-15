/**
 * settler.js — submits race results to RaceWager and TitleRace contracts.
 *
 * TRUST MODEL (current):
 *   The resolver is a single authorized EOA whose private key is stored in .env.
 *   This is a centralised trust assumption — the operator can pick winners.
 *
 * STRONGER ALTERNATIVES:
 *   1. Both-players-sign (threshold 2-of-2):
 *      Each player signs { raceId, winner } off-chain.  The contract
 *      verifies both signatures in settle().  Neither player can cheat;
 *      the operator cannot insert a winner without both signatures.
 *      Downside: requires both players to be online at race end.
 *
 *   2. Commit-reveal:
 *      Before race, each player commits hash(result + secret).
 *      After race, both reveal.  Contract derives winner from XOR of secrets.
 *      Downside: collusion possible if one player reveals early.
 *
 *   3. Chainlink Functions / DECO:
 *      An on-chain oracle fetches the race result from a verifiable off-chain
 *      game server or VDF beacon.  Most trustless but highest complexity.
 *
 *   RECOMMENDATION: Ship with current model + 2-of-2 player-sign for v2.
 *   Document the centralisation risk clearly in the UI.
 */

import { ethers } from "ethers";

export class Settler {
  constructor({ rpcUrl, resolverKey, wagerAddress, titleAddress, wagerAbi, titleAbi }) {
    if (!resolverKey) throw new Error("RESOLVER_PRIVATE_KEY not set — never hardcode keys");
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet   = new ethers.Wallet(resolverKey, this.provider);
    this.wager    = new ethers.Contract(wagerAddress, wagerAbi, this.wallet);
    this.title    = new ethers.Contract(titleAddress, titleAbi, this.wallet);
  }

  async settleWager(raceId, winnerAddress) {
    console.log(`[settler] settleWager ${raceId} → winner ${winnerAddress}`);
    const tx = await this.wager.settle(raceId, winnerAddress);
    const receipt = await tx.wait();
    console.log(`[settler] wager settled — tx ${receipt.hash}`);
    return receipt;
  }

  async settleTitle(raceId, winnerAddress) {
    console.log(`[settler] settleTitle ${raceId} → winner ${winnerAddress}`);
    const tx = await this.title.settle(raceId, winnerAddress);
    const receipt = await tx.wait();
    console.log(`[settler] title settled — tx ${receipt.hash}`);
    return receipt;
  }
}
