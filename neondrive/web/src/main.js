/**
 * main.js — NeonDrive SPA entry point.
 * Wires: MockChain (default) / AvaxChain (wallet), Three.js garage viewer,
 * upgrade shop, marketplace, and the skill-event race mini-game.
 */

import { MockChain }        from "./chain/MockChain.js";
import { AvaxChain }        from "./chain/AvaxChain.js";
import { createGarageScene, clearParts, attachPart } from "./three/pink-loader.js";
import { TRACKS, getTrack } from "./game/tracks.js";
import { simulateRace, skillMultiplier } from "./game/race.js";

const state = {
  chain:         new MockChain(),
  cars:          [],
  upgradeTypes:  {},
  inventory:     {},
  listings:      [],
  activeView:    "garage",
  selectedCar:   null,
  raceCar:       null,
  raceTrack:     null,
  garageScene:   null,
  events:        [],
  eventIndex:    0,
  timingResults: [],
  eventStart:    0,
  eventActive:   false,
};

async function boot() {
  setupNav();
  setupWallet();
  await loadAll();
  renderGarage();
  renderShop();
  renderMarket();
  renderRaceSetup();
  setupRaceArena();
}

async function loadAll() {
  const [cars, upgradeTypes, inventory, listings] = await Promise.all([
    state.chain.getOwnedCars(),
    state.chain.getAllUpgradeTypes
      ? state.chain.getAllUpgradeTypes()
      : Promise.resolve(state.chain.upgradeTypes),
    state.chain.getInventory(),
    state.chain.getListings(),
  ]);
  state.cars         = cars;
  state.upgradeTypes = upgradeTypes;
  state.inventory    = inventory;
  state.listings     = listings;
}

function setupNav() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
}

function switchView(name) {
  state.activeView = name;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `${name}-view`));
}

function setupWallet() {
  const btnConnect = document.getElementById("btn-connect");
  const btnMint    = document.getElementById("btn-mint");
  const status     = document.getElementById("wallet-status");

  btnConnect.addEventListener("click", async () => {
    if (state.chain instanceof AvaxChain) { toast("Already connected."); return; }
    try {
      btnConnect.disabled = true;
      btnConnect.innerHTML = '<span class="spinner"></span>';
      const real = new AvaxChain();
      const addr = await real.connect();
      state.chain = real;
      status.textContent  = addr.slice(0,6) + "…" + addr.slice(-4);
      status.className    = "connected";
      btnConnect.textContent = "Connected";
      btnConnect.disabled    = true;
      btnMint.style.display  = "";
      await loadAll();
      renderGarage(); renderShop(); renderMarket();
      toast("Wallet connected — Avalanche network.");
    } catch (err) {
      toast("Connect failed: " + (err.message || err));
      btnConnect.disabled   = false;
      btnConnect.textContent = "Connect Wallet";
    }
  });

  btnMint.addEventListener("click", async () => {
    try {
      btnMint.disabled = true;
      toast("Minting 1 car for 0.5 AVAX…");
      await state.chain.mint(1);
      await loadAll();
      renderGarage();
      toast("Car minted!");
    } catch (err) {
      toast("Mint failed: " + err.message);
    } finally {
      btnMint.disabled = false;
    }
  });
}

function renderGarage() {
  const grid = document.getElementById("car-grid");
  grid.innerHTML = "";
  if (!state.cars.length) {
    grid.innerHTML = '<p style="color:var(--muted);font-size:13px">No cars yet. Mint one!</p>';
    refreshShopCarSelect(); return;
  }
  state.cars.forEach(car => {
    const card = document.createElement("div");
    card.className = "nft-card";
    card.innerHTML = `
      <canvas width="220" height="150"></canvas>
      <div class="nft-card-body">
        <div class="nft-name">${car.name}</div>
        <div class="nft-rarity" style="color:${rarityColor(car.stats.rarity)}">${rarityLabel(car.stats.rarity)}</div>
        <div class="stat-row">
          ${statPill("SPD", car.stats.speed)}
          ${statPill("HDL", car.stats.handling)}
          ${statPill("ACC", car.stats.acceleration)}
          ${statPill("DUR", car.stats.durability)}
          ${statPill("BST", car.stats.boost)}
        </div>
      </div>
    `;
    grid.appendChild(card);
    const canvas = card.querySelector("canvas");
    try { createGarageScene(canvas, car); } catch {}
    card.addEventListener("click", () => openViewer(car));
  });
  refreshShopCarSelect();
}

function openViewer(car) {
  state.selectedCar = car;
  const overlay = document.getElementById("viewer-overlay");
  const canvas  = document.getElementById("viewer-canvas");
  const nameEl  = document.getElementById("viewer-car-name");
  const partsEl = document.getElementById("viewer-parts");

  overlay.classList.add("open");
  nameEl.textContent = car.name.toUpperCase();

  if (state.garageScene) { state.garageScene.dispose(); state.garageScene = null; }
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  state.garageScene = createGarageScene(canvas, car);

  partsEl.innerHTML = "";
  const equipped = car.equipped || [0,0,0,0,0];
  equipped.forEach((id) => {
    if (!id) return;
    const ut = state.upgradeTypes[id];
    if (!ut) return;
    const chip = document.createElement("div");
    chip.className = "part-chip";
    chip.textContent = ut.name.toUpperCase();
    partsEl.appendChild(chip);
  });

  if (state.garageScene && equipped.some(Boolean)) {
    state.garageScene.attachParts(equipped, state.upgradeTypes);
  }

  const onResize = () => {
    if (state.garageScene) state.garageScene.resize(canvas.clientWidth, canvas.clientHeight);
  };
  window.addEventListener("resize", onResize);
  canvas._resizeHandler = onResize;
}

document.getElementById("btn-viewer-close").addEventListener("click", () => {
  document.getElementById("viewer-overlay").classList.remove("open");
  if (state.garageScene) { state.garageScene.dispose(); state.garageScene = null; }
  const c = document.getElementById("viewer-canvas");
  if (c && c._resizeHandler) window.removeEventListener("resize", c._resizeHandler);
});

document.getElementById("btn-viewer-race").addEventListener("click", () => {
  if (!state.selectedCar) return;
  state.raceCar = state.selectedCar;
  document.getElementById("viewer-overlay").classList.remove("open");
  if (state.garageScene) { state.garageScene.dispose(); state.garageScene = null; }
  switchView("race");
  highlightRaceCar(state.raceCar.tokenId);
});

function renderShop() {
  const grid = document.getElementById("upgrade-grid");
  grid.innerHTML = "";
  const types = Object.values(state.upgradeTypes);
  if (!types.length) { grid.innerHTML = '<p style="color:var(--muted);font-size:13px">No upgrades available.</p>'; return; }
  const STAT_NAMES = ["Speed","Handling","Acceleration","Durability","Boost"];
  types.forEach(ut => {
    const ownedQty = state.inventory[ut.id] ?? 0;
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.innerHTML = `
      <div class="upgrade-name">${ut.name}</div>
      <div class="upgrade-meta">${STAT_NAMES[ut.statIndex] ?? "?"} upgrade · Tier ${ut.tier ?? "—"}</div>
      <div class="upgrade-boost">+${ut.boostAmount} ${STAT_NAMES[ut.statIndex] ?? "stat"}</div>
      <div style="font-size:11px;color:var(--gold);margin-bottom:10px">${ut.price} AVAX</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Owned: ${ownedQty}</div>
      <div style="display:flex;gap:8px">
        <button class="btn sm" data-buy="${ut.id}">Buy</button>
        ${ownedQty > 0 ? `<button class="btn sm cyan" data-equip="${ut.id}">Equip</button>` : ""}
      </div>
    `;
    card.querySelector("[data-buy]")?.addEventListener("click", async (e) => {
      const id = Number(e.target.dataset.buy);
      try {
        e.target.disabled = true;
        await state.chain.buyUpgrade(id, 1);
        state.inventory = await state.chain.getInventory();
        renderShop();
        toast(`Bought ${ut.name}!`);
      } catch (err) { toast("Buy failed: " + err.message); e.target.disabled = false; }
    });
    card.querySelector("[data-equip]")?.addEventListener("click", async (e) => {
      const upgradeId = Number(e.target.dataset.equip);
      const carId = Number(document.getElementById("shop-car-select").value);
      if (!carId) { toast("Select a car first."); return; }
      const slot = state.upgradeTypes[upgradeId]?.statIndex ?? 0;
      try {
        e.target.disabled = true;
        await state.chain.equip(carId, upgradeId, slot);
        state.cars     = await state.chain.getOwnedCars();
        state.inventory = await state.chain.getInventory();
        renderShop(); renderGarage();
        toast(`${ut.name} equipped!`);
      } catch (err) { toast("Equip failed: " + err.message); e.target.disabled = false; }
    });
    grid.appendChild(card);
  });
}

function refreshShopCarSelect() {
  const sel = document.getElementById("shop-car-select");
  const val = sel.value;
  sel.innerHTML = '<option value="">— choose car —</option>';
  state.cars.forEach(car => {
    const o = document.createElement("option");
    o.value = car.tokenId; o.textContent = car.name; sel.appendChild(o);
  });
  if (val) sel.value = val;
}

function renderMarket() {
  const grid = document.getElementById("listing-grid");
  grid.innerHTML = "";
  if (!state.listings.length) {
    grid.innerHTML = '<p style="color:var(--muted);font-size:13px">No cars listed. Be the first!</p>'; return;
  }
  state.listings.forEach(l => {
    const isMine = l.seller?.toLowerCase() === state.chain.address?.toLowerCase();
    const card = document.createElement("div");
    card.className = "listing-card";
    card.innerHTML = `
      <div class="nft-name">Car #${l.tokenId}</div>
      <div class="listing-price">${l.price} AVAX</div>
      <div class="listing-seller">${isMine ? "YOUR LISTING" : (l.seller?.slice(0,8) ?? "?") + "…"}</div>
      <div>${isMine
        ? `<button class="btn sm" data-delist="${l.tokenId}">Delist</button>`
        : `<button class="btn sm green" data-buy-car="${l.tokenId}">Buy</button>`
      }</div>
    `;
    card.querySelector("[data-delist]")?.addEventListener("click", async (e) => {
      try {
        e.target.disabled = true;
        await state.chain.delistCar(l.tokenId);
        state.listings = await state.chain.getListings();
        renderMarket(); toast("Listing removed.");
      } catch (err) { toast("Delist failed: " + err.message); e.target.disabled = false; }
    });
    card.querySelector("[data-buy-car]")?.addEventListener("click", async (e) => {
      try {
        e.target.disabled = true;
        await state.chain.buyCar(l.tokenId);
        await loadAll(); renderGarage(); renderMarket();
        toast(`Car #${l.tokenId} purchased!`);
      } catch (err) { toast("Buy failed: " + err.message); e.target.disabled = false; }
    });
    grid.appendChild(card);
  });
}

document.getElementById("btn-list-car").addEventListener("click", async () => {
  if (!state.cars.length) { toast("You have no cars."); return; }
  const tokenId = Number(prompt("Token ID to list:", state.cars[0].tokenId));
  const price   = parseFloat(prompt("List price (AVAX):", "1.0"));
  if (!tokenId || isNaN(price)) return;
  try {
    await state.chain.listCar(tokenId, price);
    state.listings = await state.chain.getListings();
    state.cars     = await state.chain.getOwnedCars();
    renderGarage(); renderMarket();
    toast(`Car #${tokenId} listed for ${price} AVAX.`);
  } catch (err) { toast("List failed: " + err.message); }
});

function renderRaceSetup() {
  const trackGrid = document.getElementById("track-grid");
  trackGrid.innerHTML = "";
  TRACKS.forEach(track => {
    const card = document.createElement("div");
    card.className = "track-card";
    card.dataset.trackId = track.id;
    card.innerHTML = `
      <div class="track-name" style="color:${track.accentColor}">${track.name}</div>
      <div class="track-city">${track.city}</div>
      <div class="track-mode" style="color:var(--muted)">${track.mode.toUpperCase()} · ${track.skillEvents.length} events</div>
    `;
    card.addEventListener("click", () => {
      state.raceTrack = track;
      document.querySelectorAll(".track-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      refreshStartBtn();
    });
    trackGrid.appendChild(card);
  });
  renderRaceCarGrid();
}

function renderRaceCarGrid() {
  const grid = document.getElementById("race-car-grid");
  grid.innerHTML = "";
  if (!state.cars.length) {
    grid.innerHTML = '<p style="color:var(--muted);font-size:13px">No cars. Mint one first.</p>'; return;
  }
  state.cars.forEach(car => {
    const card = document.createElement("div");
    card.className = "nft-card";
    card.dataset.carId = car.tokenId;
    card.innerHTML = `
      <div class="nft-card-body" style="padding:12px">
        <div class="nft-name">${car.name}</div>
        <div class="nft-rarity" style="color:${rarityColor(car.stats.rarity)}">${rarityLabel(car.stats.rarity)}</div>
        <div class="stat-row">
          ${statPill("SPD", car.stats.speed)}
          ${statPill("ACC", car.stats.acceleration)}
          ${statPill("BST", car.stats.boost)}
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      state.raceCar = car;
      highlightRaceCar(car.tokenId);
      refreshStartBtn();
    });
    grid.appendChild(card);
  });
}

function highlightRaceCar(tokenId) {
  document.querySelectorAll("#race-car-grid .nft-card").forEach(c => {
    c.classList.toggle("selected", Number(c.dataset.carId) === Number(tokenId));
  });
}

function refreshStartBtn() {
  const btn   = document.getElementById("btn-start-race");
  const panel = document.getElementById("race-wager-panel");
  const ok    = !!(state.raceCar && state.raceTrack);
  btn.disabled = !ok;
  panel.style.display = ok ? "" : "none";
}

document.getElementById("btn-start-race").addEventListener("click", () => {
  if (!state.raceCar || !state.raceTrack) return;
  startRaceArena(state.raceTrack, state.raceCar);
});

function setupRaceArena() {
  const handler = (e) => {
    if (!state.eventActive) return;
    if (e.type === "keydown" && e.code !== "Space") return;
    e.preventDefault(); registerHit();
  };
  document.addEventListener("keydown", handler);
  document.getElementById("race-arena").addEventListener("pointerdown", (e) => {
    if (!state.eventActive) return;
    e.preventDefault(); registerHit();
  });
}

function startRaceArena(track, car) {
  state.events        = [...track.skillEvents];
  state.eventIndex    = 0;
  state.timingResults = [];
  const arena = document.getElementById("race-arena");
  arena.classList.add("open");
  arena.style.background = `linear-gradient(180deg, ${track.bgColor}f0 0%, #04000aee 100%)`;
  nextEvent(track);
}

function nextEvent(track) {
  const events = state.events;
  const idx    = state.eventIndex;
  document.getElementById("arena-progress").textContent = `EVENT ${idx + 1} / ${events.length}`;
  document.getElementById("timing-feedback").textContent = "";
  document.getElementById("timing-feedback").className = "ok";

  if (idx >= events.length) { finishRace(track); return; }

  const ev        = events[idx];
  const total_ms  = 2200;
  const target    = 0.72;
  const perfPct   = ((ev.perfectWindow ?? 100) / total_ms);
  const goodPct   = (130 / total_ms);

  document.getElementById("event-prompt").textContent = ev.prompt;
  document.getElementById("event-prompt").style.color = track.accentColor ?? "var(--pink)";

  const perfectBar = document.getElementById("timing-bar-perfect");
  const goodBar    = document.getElementById("timing-bar-good");
  perfectBar.style.left  = `${(target - perfPct/2)*100}%`;
  perfectBar.style.width = `${perfPct*100}%`;
  goodBar.style.left     = `${(target - goodPct/2)*100}%`;
  goodBar.style.width    = `${goodPct*100}%`;

  const fill = document.getElementById("timing-bar-fill");
  fill.style.width = "0%";

  const start = performance.now();
  state.eventActive = true;
  state.eventStart  = start;

  let raf;
  function animBar(now) {
    const pct = Math.min((now - start) / total_ms, 1);
    fill.style.width = `${pct * 100}%`;
    if (pct < 1) {
      raf = requestAnimationFrame(animBar);
    } else {
      state.eventActive = false;
      const feedbackEl = document.getElementById("timing-feedback");
      feedbackEl.textContent = "MISS"; feedbackEl.className = "miss";
      state.timingResults.push({ timing: 999 });
      state.eventIndex++;
      setTimeout(() => nextEvent(state.raceTrack), 700);
    }
  }
  raf = requestAnimationFrame(animBar);
}

function registerHit() {
  if (!state.eventActive) return;
  state.eventActive = false;
  const elapsed = performance.now() - state.eventStart;
  const target  = 0.72 * 2200;
  const timing  = elapsed - target;
  const abs     = Math.abs(timing);
  let label, cls;
  if (abs <= 50)       { label = "PERFECT!"; cls = "perfect"; }
  else if (abs <= 130) { label = "GOOD";     cls = "good"; }
  else if (abs <= 220) { label = "OK";       cls = "ok"; }
  else                 { label = "MISS";     cls = "miss"; }
  const feedbackEl = document.getElementById("timing-feedback");
  feedbackEl.textContent = label; feedbackEl.className = cls;
  state.timingResults.push({ timing: Math.round(timing) });
  state.eventIndex++;
  setTimeout(() => nextEvent(state.raceTrack), 650);
}

function finishRace(track) {
  document.getElementById("race-arena").classList.remove("open");
  const car      = state.raceCar;
  const raceId   = `race-${Date.now()}`;
  const wager    = parseFloat(document.getElementById("wager-input").value) || 0.1;
  const opponentCar = { stats: { speed: 55, handling: 55, acceleration: 55, durability: 55, boost: 55, rarity: 2 }, effectiveStats: null };
  const result = simulateRace({
    playerCar:          { stats: car.stats, effectiveStats: car.effectiveStats ?? car.stats },
    opponentCar,
    playerSkillResults: state.timingResults,
    track:              { statWeights: track.statWeights },
    raceId,
  });
  showRaceResult(result, wager, track);
}

function showRaceResult(result, wager, track) {
  const isWin   = result.winner === "player";
  const payout  = isWin ? (wager * 2 * (1 - 0.035)).toFixed(4) : "0.0000";
  const skillPct = (result.playerSkill * 100 - 100).toFixed(1);
  const banner  = document.getElementById("result-banner");
  banner.textContent = isWin ? "WIN!" : "LOSS";
  banner.className   = isWin ? "win" : "lose";
  document.getElementById("result-details").innerHTML = `
    Track: <span>${track.name}</span><br>
    Win Probability: <span>${(result.winProbability * 100).toFixed(1)}%</span><br>
    Your Skill: <span>${skillPct > 0 ? "+" : ""}${skillPct}%</span><br>
    Player Power: <span>${result.breakdown.playerPower.toFixed(1)}</span><br>
    Opponent Power: <span>${result.breakdown.opponentPower.toFixed(1)}</span><br>
    ${isWin ? `Payout (mock): <span>${payout} AVAX</span>` : ""}
  `;
  const resultEl = document.getElementById("race-result");
  resultEl.classList.add("open");
  resultEl.style.background = `radial-gradient(ellipse at center, ${isWin ? "#00ff9d22" : "#ff333322"} 0%, var(--bg) 70%)`;
}

document.getElementById("btn-result-again").addEventListener("click", () => {
  document.getElementById("race-result").classList.remove("open");
  if (state.raceTrack && state.raceCar) startRaceArena(state.raceTrack, state.raceCar);
});

document.getElementById("btn-result-garage").addEventListener("click", () => {
  document.getElementById("race-result").classList.remove("open");
  switchView("garage");
});

function statPill(label, val) { return `<span class="stat-pill">${label}:${val}</span>`; }
function rarityLabel(r) { return ["COMMON","UNCOMMON","RARE","EPIC","LEGENDARY"][r] ?? "UNKNOWN"; }
function rarityColor(r) { return ["#888","#00d4ff","#7b2fff","#ffdd00","#ff006e"][r] ?? "#888"; }

let _toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

boot().catch(err => console.error("Boot error:", err));
