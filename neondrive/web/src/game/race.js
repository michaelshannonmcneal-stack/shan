/**
 * race.js — Hybrid race engine for PINKS NeonDrive.
 *
 * Algorithm:
 *   1. carPowerScore = weighted sum of effectiveStats × trackWeights.
 *   2. playerSkillMultiplier from timing results (0.85 – 1.25).
 *   3. effective power = carPowerScore × skillMultiplier.
 *   4. Compare against opponent via sigmoid → win probability.
 *   5. Roll Math.random() against probability → winner.
 */

const PERFECT_MULT = 1.25;
const GOOD_MULT    = 1.10;
const OK_MULT      = 1.00;
const MISS_MULT    = 0.88;

const PERFECT_MS   = 50;
const GOOD_MS      = 130;
const OK_MS        = 220;

export function carPowerScore(stats, trackWeights) {
  return (
    (stats.speed        ?? 50) * (trackWeights.speed        ?? 0.2) +
    (stats.handling     ?? 50) * (trackWeights.handling     ?? 0.2) +
    (stats.acceleration ?? 50) * (trackWeights.acceleration ?? 0.2) +
    (stats.durability   ?? 50) * (trackWeights.durability   ?? 0.2) +
    (stats.boost        ?? 50) * (trackWeights.boost        ?? 0.2)
  );
}

export function skillMultiplier(results) {
  if (!results || results.length === 0) return 1.0;
  const mults = results.map(r => {
    const abs = Math.abs(r.timing);
    if (abs <= PERFECT_MS) return PERFECT_MULT;
    if (abs <= GOOD_MS)    return GOOD_MULT;
    if (abs <= OK_MS)      return OK_MULT;
    return MISS_MULT;
  });
  return mults.reduce((a, b) => a + b, 0) / mults.length;
}

export function winProbability({ playerStats, opponentStats, playerSkill, opponentSkill, track }) {
  const pPow = carPowerScore(playerStats,   track.statWeights) * playerSkill;
  const oPow = carPowerScore(opponentStats, track.statWeights) * opponentSkill;
  const diff = (pPow - oPow) / 12;
  return sigmoid(diff);
}

export function simulateRace({ playerCar, opponentCar, playerSkillResults, track, raceId }) {
  const pSkill = skillMultiplier(playerSkillResults);

  const opponentRarity = opponentCar?.stats?.rarity ?? 2;
  const seed           = stringHash(String(raceId));
  const oSkill         = 0.88 + opponentRarity * 0.04 + (seededRandom(seed) * 0.22 - 0.11);

  const pStats = playerCar.effectiveStats  ?? playerCar.stats;
  const oStats = opponentCar.effectiveStats ?? opponentCar.stats;

  const prob   = winProbability({ playerStats: pStats, opponentStats: oStats, playerSkill: pSkill, opponentSkill: oSkill, track });
  const roll   = Math.random();
  const winner = roll < prob ? "player" : "opponent";

  return {
    winner,
    winProbability: prob,
    playerSkill:    pSkill,
    opponentSkill:  oSkill,
    roll,
    raceId,
    breakdown: {
      playerPower:   carPowerScore(pStats, track.statWeights) * pSkill,
      opponentPower: carPowerScore(oStats, track.statWeights) * oSkill,
    },
  };
}

export function opponentSkillResults(raceId, eventCount) {
  const seed = stringHash(String(raceId) + "opp");
  return Array.from({ length: eventCount }, (_, i) => {
    const offset = (seededRandom(seed + i) - 0.5) * 300;
    return { timing: Math.round(offset) };
  });
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function stringHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h;
}

function seededRandom(seed) {
  let s = (seed >>> 0) + 0x6D2B79F5;
  s     = Math.imul(s ^ (s >>> 15), 1 | s);
  s    ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}
