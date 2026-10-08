import type { GameState, Player, Resource, DevCardKind } from "./types";
import { RESOURCES } from "./types";
import {
  canAfford, payToBank, gainCost, log, currentPlayer, totalResources,
  COSTS, refreshVP, computeVP, newDevCardId, recordTurnEnd,
} from "./state";

// ---------- Winning ----------

/** The player whose turn it is wins the moment they hold 10 VP (hidden VP cards included). */
export function checkImmediateWin(state: GameState): boolean {
  if (state.phase === "gameover" || state.phase === "setup1" || state.phase === "setup2") return false;
  const p = currentPlayer(state);
  if (computeVP(state, p.id) < 10) return false;
  state.winnerId = p.id;
  state.phase = "gameover";
  recordTurnEnd(state);
  state.stats.turningPoints.push({ turn: state.turn, playerId: p.id, text: `${p.name} wins with ${computeVP(state, p.id)} VP` });
  log(state, { kind: "achievement", playerId: p.id, text: `${p.name} has won the realm!` });
  return true;
}

// ---------- Placement validation ----------

export function canPlaceSettlement(
  state: GameState,
  vertexId: number,
  playerId: string,
  setup: boolean,
): boolean {
  const v = state.vertices[vertexId];
  if (!v) return false;
  if (v.building) return false;
  // distance rule: no adjacent vertex has a building
  for (const adjId of v.adj) {
    if (state.vertices[adjId].building) return false;
  }
  if (!setup) {
    // must connect to player's road
    const connected = v.adj.some((adjId) => {
      const edge = state.edges.find(
        (e) =>
          (e.vertexIds[0] === vertexId && e.vertexIds[1] === adjId) ||
          (e.vertexIds[1] === vertexId && e.vertexIds[0] === adjId),
      );
      return edge?.road?.playerId === playerId;
    });
    if (!connected) return false;
  }
  return true;
}

export function canPlaceCity(state: GameState, vertexId: number, playerId: string): boolean {
  const v = state.vertices[vertexId];
  return !!v?.building && v.building.playerId === playerId && v.building.kind === "settlement";
}

export function canPlaceRoad(
  state: GameState,
  edgeId: number,
  playerId: string,
  freeFromVertex?: number,
): boolean {
  const e = state.edges[edgeId];
  if (!e) return false;
  if (e.road) return false;
  const [v1, v2] = e.vertexIds;
  const touches = (vid: number) => {
    const v = state.vertices[vid];
    if (v.building?.playerId === playerId) return true;
    // any adjacent edge owned by player, but not blocked by opponent settlement at this vertex
    if (v.building && v.building.playerId !== playerId) return false;
    return state.edges.some(
      (other) =>
        other.id !== edgeId &&
        other.road?.playerId === playerId &&
        (other.vertexIds[0] === vid || other.vertexIds[1] === vid),
    );
  };
  if (freeFromVertex !== undefined) {
    // setup phase: road must touch the just-placed settlement
    return v1 === freeFromVertex || v2 === freeFromVertex;
  }
  return touches(v1) || touches(v2);
}

// ---------- Actions ----------

export function placeSettlement(state: GameState, vertexId: number, free: boolean) {
  const p = currentPlayer(state);
  if (!free) {
    if (!canAfford(p, COSTS.settlement)) throw new Error("Cannot afford settlement");
    payToBank(state, p, COSTS.settlement);
  }
  if (p.settlementsLeft <= 0) throw new Error("No settlements left");
  state.vertices[vertexId].building = { playerId: p.id, kind: "settlement" };
  p.settlementsLeft--;
  log(state, { kind: "build", playerId: p.id, text: `${p.name} built a settlement` });
  updateLongestRoad(state);
  refreshVP(state);
  checkImmediateWin(state);
}

export function placeCity(state: GameState, vertexId: number) {
  const p = currentPlayer(state);
  if (!canAfford(p, COSTS.city)) throw new Error("Cannot afford city");
  payToBank(state, p, COSTS.city);
  if (p.citiesLeft <= 0) throw new Error("No cities left");
  state.vertices[vertexId].building = { playerId: p.id, kind: "city" };
  p.settlementsLeft++; // settlement returned
  p.citiesLeft--;
  log(state, { kind: "build", playerId: p.id, text: `${p.name} upgraded to a city` });
  refreshVP(state);
  checkImmediateWin(state);
}

export function placeRoad(state: GameState, edgeId: number, free: boolean) {
  const p = currentPlayer(state);
  if (!free) {
    if (!canAfford(p, COSTS.road)) throw new Error("Cannot afford road");
    payToBank(state, p, COSTS.road);
  }
  if (p.roadsLeft <= 0) throw new Error("No roads left");
  state.edges[edgeId].road = { playerId: p.id };
  p.roadsLeft--;
  log(state, { kind: "build", playerId: p.id, text: `${p.name} built a road` });
  updateLongestRoad(state);
  refreshVP(state);
  checkImmediateWin(state);
}

// ---------- Dice & production ----------

export function rollDice(state: GameState): [number, number] {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  state.dice = [d1, d2];
  state.lastRoll = { values: [d1, d2], playerId: currentPlayer(state).id };
  state.hasRolled = true;
  const sum = d1 + d2;
  state.stats.rolls[sum] += 1;
  log(state, { kind: "roll", playerId: currentPlayer(state).id, text: `${currentPlayer(state).name} rolled ${d1} + ${d2} = ${sum}` });
  if (sum === 7) {
    handleSeven(state);
  } else {
    produceResources(state, sum);
    state.phase = "main";
  }
  return [d1, d2];
}

export function produceResources(state: GameState, roll: number) {
  // 1) What every player is owed.
  const owed: Record<string, Partial<Record<Resource, number>>> = {};
  state.hexes.forEach((h) => {
    if (h.number !== roll) return;
    if (h.id === state.robberHexId) return;
    if (h.terrain === "desert") return;
    const res = h.terrain as Resource;
    h.vertexIds.forEach((vid) => {
      const v = state.vertices[vid];
      if (!v.building) return;
      const amt = v.building.kind === "city" ? 2 : 1;
      const pid = v.building.playerId;
      owed[pid] = owed[pid] || {};
      owed[pid][res] = (owed[pid][res] ?? 0) + amt;
    });
  });

  // 2) Apply the bank limit: if the bank can't cover everyone, several claimants get nothing,
  //    while a lone claimant receives whatever is left.
  const gains: Record<string, Partial<Record<Resource, number>>> = {};
  RESOURCES.forEach((r) => {
    const claimants = Object.keys(owed).filter((pid) => (owed[pid][r] ?? 0) > 0);
    if (!claimants.length) return;
    const total = claimants.reduce((sum, pid) => sum + (owed[pid][r] ?? 0), 0);
    const grant: Record<string, number> = {};
    if (total <= state.bank[r]) {
      claimants.forEach((pid) => (grant[pid] = owed[pid][r] ?? 0));
    } else if (claimants.length === 1) {
      grant[claimants[0]] = state.bank[r];
    } else {
      log(state, { kind: "info", text: `The bank doesn't have enough ${r} for everyone, so nobody collects it.` });
    }
    Object.entries(grant).forEach(([pid, n]) => {
      if (n <= 0) return;
      gains[pid] = gains[pid] || {};
      gains[pid][r] = n;
      state.bank[r] -= n;
    });
  });

  Object.entries(gains).forEach(([pid, g]) => {
    const p = state.players.find((x) => x.id === pid)!;
    gainCost(p, g);
    RESOURCES.forEach((r) => { state.stats.produced[pid][r] += g[r] ?? 0; });
    const desc = RESOURCES.filter((r) => g[r]).map((r) => `${g[r]} ${r}`).join(", ");
    log(state, { kind: "info", playerId: pid, text: `${p.name} gained ${desc}` });
  });
}

function handleSeven(state: GameState) {
  // discard for any player with > 7 cards
  const toDiscard = state.players.filter((p) => totalResources(p) > 7).map((p) => p.id);
  if (toDiscard.length) {
    state.pendingDiscards = toDiscard;
    state.phase = "discard";
    log(state, { kind: "robber", text: `Robbers raid! Players with over 7 cards must discard half.` });
  } else {
    state.phase = "moveRobber";
    log(state, { kind: "robber", text: `${currentPlayer(state).name} must move the robber.` });
  }
}

export function discardResources(state: GameState, playerId: string, toDiscard: Partial<Record<Resource, number>>) {
  const p = state.players.find((x) => x.id === playerId)!;
  const total = totalResources(p);
  const need = Math.floor(total / 2);
  const sum = RESOURCES.reduce((s, r) => s + (toDiscard[r] ?? 0), 0);
  if (sum !== need) throw new Error(`Must discard exactly ${need}`);
  RESOURCES.forEach((r) => {
    if ((toDiscard[r] ?? 0) > p.resources[r]) throw new Error("Not enough of " + r);
  });
  payToBank(state, p, toDiscard);
  state.stats.discarded[playerId] += need;
  state.pendingDiscards = state.pendingDiscards.filter((id) => id !== playerId);
  log(state, { kind: "robber", playerId, text: `${p.name} discarded ${need} cards` });
  if (state.pendingDiscards.length === 0) {
    state.phase = "moveRobber";
  }
}

export function moveRobber(state: GameState, hexId: number, fromKnight = false) {
  if (hexId === state.robberHexId) throw new Error("Must move robber to a different hex");
  state.robberHexId = hexId;
  const hex = state.hexes[hexId];
  // candidates: players (not current) with a building on this hex who have >0 resources
  const me = currentPlayer(state).id;
  const candidates = new Set<string>();
  hex.vertexIds.forEach((vid) => {
    const b = state.vertices[vid].building;
    if (b && b.playerId !== me) {
      const target = state.players.find((p) => p.id === b.playerId)!;
      if (totalResources(target) > 0) candidates.add(b.playerId);
    }
  });
  log(state, { kind: "robber", playerId: me, text: `${currentPlayer(state).name} moved the robber${fromKnight ? " (Knight)" : ""}` });
  const resume = state.hasRolled ? "main" : "roll"; // a Knight played before rolling returns to the roll
  if (candidates.size === 0) {
    state.phase = resume;
    state.stealCandidates = [];
  } else if (candidates.size === 1) {
    stealFrom(state, [...candidates][0]);
    state.phase = resume;
  } else {
    state.stealCandidates = [...candidates];
    state.phase = "stealing";
  }
}

export function stealFrom(state: GameState, targetId: string) {
  const me = currentPlayer(state);
  const target = state.players.find((p) => p.id === targetId)!;
  const pool: Resource[] = [];
  RESOURCES.forEach((r) => { for (let i = 0; i < target.resources[r]; i++) pool.push(r); });
  if (!pool.length) return;
  const stolen = pool[Math.floor(Math.random() * pool.length)];
  target.resources[stolen]--;
  me.resources[stolen]++;
  state.stats.stolenBy[me.id] += 1;
  state.stats.stolenFrom[target.id] += 1;
  log(state, { kind: "robber", playerId: me.id, text: `${me.name} stole 1 card from ${target.name}` });
  state.stealCandidates = [];
  state.phase = state.hasRolled ? "main" : "roll";
}

// ---------- Trading ----------

/** Trade ratio for `give`: 4 by default, 3 with a generic harbor, 2 with that resource's harbor. */
export function bankRate(state: GameState, playerId: string, give: Resource): number {
  let rate = 4;
  state.harbors.forEach((h) => {
    const owns = h.vertexIds.some((vid) => state.vertices[vid].building?.playerId === playerId);
    if (!owns) return;
    if (h.type === "any") rate = Math.min(rate, 3);
    else if (h.type === give) rate = Math.min(rate, 2);
  });
  return rate;
}

export function bankTrade(state: GameState, give: Resource, get: Resource) {
  const p = currentPlayer(state);
  const rate = bankRate(state, p.id, give);
  if (p.resources[give] < rate) throw new Error(`Need ${rate} to trade with bank`);
  if (give === get) throw new Error("Choose different resources");
  if (state.bank[get] < 1) throw new Error(`The bank has no ${get} left`);
  p.resources[give] -= rate;
  state.bank[give] += rate;
  p.resources[get] += 1;
  state.bank[get] -= 1;
  state.stats.bankTrades[p.id] += 1;
  log(state, { kind: "trade", playerId: p.id, text: `${p.name} traded ${rate} ${give} for 1 ${get}${rate < 4 ? " (harbor)" : ""}` });
}

// ---------- Dev cards ----------

export function buyDevCard(state: GameState) {
  const p = currentPlayer(state);
  if (!canAfford(p, COSTS.devCard)) throw new Error("Cannot afford");
  if (state.devDeck.length === 0) throw new Error("Deck is empty");
  payToBank(state, p, COSTS.devCard);
  const kind = state.devDeck.pop()!;
  p.devCards.push({ id: newDevCardId(), kind, purchasedTurn: state.turn });
  if (kind === "victoryPoint") p.hiddenVP += 1;
  log(state, { kind: "dev", playerId: p.id, text: `${p.name} purchased a development card` });
  refreshVP(state);
  checkImmediateWin(state);
}

export function playDevCard(
  state: GameState,
  cardId: number,
  opts?: { hexId?: number; resources?: [Resource, Resource]; monopoly?: Resource; edge1?: number; edge2?: number },
) {
  const p = currentPlayer(state);
  if (state.hasPlayedDevCard) throw new Error("Already played a dev card this turn");
  const card = p.devCards.find((c) => c.id === cardId);
  if (!card || card.played) throw new Error("Invalid card");
  if (card.kind === "victoryPoint") throw new Error("VP cards are scored automatically");
  if (card.purchasedTurn === state.turn) throw new Error("Cannot play a card on the turn it was purchased");

  switch (card.kind) {
    case "knight": {
      if (opts?.hexId === undefined) throw new Error("Pick a hex");
      card.played = true;
      p.playedKnights += 1;
      state.hasPlayedDevCard = true;
      updateLargestArmy(state);
      moveRobber(state, opts.hexId, true);
      break;
    }
    case "yearOfPlenty": {
      if (!opts?.resources) throw new Error("Pick 2 resources");
      card.played = true;
      state.hasPlayedDevCard = true;
      const taken: Resource[] = [];
      opts.resources.forEach((r) => {
        if (state.bank[r] > 0) { state.bank[r]--; p.resources[r]++; taken.push(r); }
      });
      log(state, { kind: "dev", playerId: p.id, text: `${p.name} played Bounty: ${taken.length ? taken.map((r) => "+" + r).join(", ") : "the bank was empty"}` });
      break;
    }
    case "monopoly": {
      if (!opts?.monopoly) throw new Error("Pick a resource");
      card.played = true;
      state.hasPlayedDevCard = true;
      let total = 0;
      state.players.forEach((other) => {
        if (other.id === p.id) return;
        total += other.resources[opts.monopoly!];
        other.resources[opts.monopoly!] = 0;
      });
      p.resources[opts.monopoly] += total;
      log(state, { kind: "dev", playerId: p.id, text: `${p.name} played Royal Decree (monopoly): claimed ${total} ${opts.monopoly}` });
      break;
    }
    case "roadBuilding": {
      card.played = true;
      state.hasPlayedDevCard = true;
      let placed = 0;
      if (opts?.edge1 !== undefined && canPlaceRoad(state, opts.edge1, p.id)) {
        state.edges[opts.edge1].road = { playerId: p.id };
        p.roadsLeft--; placed++;
      }
      if (opts?.edge2 !== undefined && canPlaceRoad(state, opts.edge2, p.id)) {
        state.edges[opts.edge2].road = { playerId: p.id };
        p.roadsLeft--; placed++;
      }
      log(state, { kind: "dev", playerId: p.id, text: `${p.name} played Surveyors: placed ${placed} free road${placed === 1 ? "" : "s"}` });
      updateLongestRoad(state);
      refreshVP(state);
      break;
    }
  }
  refreshVP(state);
  checkImmediateWin(state);
}

// ---------- Longest road ----------

function buildPlayerRoadGraph(state: GameState, playerId: string) {
  // adjacency: edgeId -> list of edgeIds connected via shared vertex (not blocked by opponent building)
  const playerEdges = state.edges.filter((e) => e.road?.playerId === playerId);
  const edgesByVertex: Record<number, number[]> = {};
  playerEdges.forEach((e) => {
    e.vertexIds.forEach((vid) => {
      (edgesByVertex[vid] ??= []).push(e.id);
    });
  });
  return { playerEdges, edgesByVertex };
}

export function longestRoadFor(state: GameState, playerId: string): number {
  const { playerEdges, edgesByVertex } = buildPlayerRoadGraph(state, playerId);
  if (playerEdges.length === 0) return 0;
  let best = 0;
  const dfs = (edgeId: number, viaVertex: number, visited: Set<number>) => {
    if (visited.has(edgeId)) return;
    visited.add(edgeId);
    const e = state.edges[edgeId];
    const other = e.vertexIds[0] === viaVertex ? e.vertexIds[1] : e.vertexIds[0];
    let extended = false;
    // can extend through `other` only if no opposing building there
    const blocking = state.vertices[other].building;
    if (!blocking || blocking.playerId === playerId) {
      const next = edgesByVertex[other] || [];
      for (const nid of next) {
        if (!visited.has(nid)) {
          extended = true;
          dfs(nid, other, visited);
        }
      }
    }
    if (!extended) {
      best = Math.max(best, visited.size);
    } else {
      best = Math.max(best, visited.size);
    }
    visited.delete(edgeId);
  };
  // start DFS from both endpoints of each edge
  playerEdges.forEach((e) => {
    e.vertexIds.forEach((vid) => dfs(e.id, e.vertexIds[0] === vid ? e.vertexIds[1] : e.vertexIds[0], new Set()));
  });
  return best;
}

/**
 * Who holds Longest Road after a recalculation? Follows the official FAQ:
 *  - the card needs a road of 5+ that is strictly longer than every other player's;
 *  - the current holder keeps it if they still meet the requirements, alone or tied;
 *  - otherwise a single player who now meets them receives it;
 *  - if nobody, or several players (none of them the holder), meet them, the card is set aside (null).
 */
export function awardLongestRoad(holder: string | null, scores: { id: string; len: number }[]): string | null {
  const max = Math.max(0, ...scores.map((s) => s.len));
  const leaders = max >= 5 ? scores.filter((s) => s.len === max) : [];
  if (holder && leaders.some((l) => l.id === holder)) return holder;
  if (leaders.length === 1) return leaders[0].id;
  return null;
}

export function updateLongestRoad(state: GameState) {
  const scores = state.players.map((p) => ({ id: p.id, len: longestRoadFor(state, p.id) }));
  const holder = state.longestRoad.playerId;
  const next = awardLongestRoad(holder, scores);
  const name = (id: string) => state.players.find((p) => p.id === id)!.name;
  const len = next ? scores.find((sc) => sc.id === next)!.len : 0;

  if (next && next !== holder) {
    log(state, { kind: "achievement", playerId: next, text: `${name(next)} claimed the Longest Trail (${len})` });
  } else if (!next && holder) {
    const tied = scores.filter((sc) => sc.len >= 5 && sc.len === Math.max(...scores.map((x) => x.len))).length > 1;
    log(state, { kind: "info", text: `${name(holder)} lost the Longest Trail${tied ? " (tie: card set aside)" : ""}` });
  }
  state.longestRoad = { playerId: next, length: len };
}

export function updateLargestArmy(state: GameState) {
  const sorted = state.players.slice().sort((a, b) => b.playedKnights - a.playedKnights);
  const top = sorted[0];
  if (top.playedKnights >= 3) {
    const holder = state.largestArmy.playerId;
    if (holder !== top.id && top.playedKnights > state.largestArmy.size) {
      state.largestArmy = { playerId: top.id, size: top.playedKnights };
      log(state, { kind: "achievement", playerId: top.id, text: `${top.name} commands the Largest Host (${top.playedKnights})` });
    } else if (holder === top.id) {
      state.largestArmy.size = top.playedKnights;
    }
  }
}

// ---------- Setup / turn flow ----------

export function endTurn(state: GameState) {
  refreshVP(state);
  if (checkImmediateWin(state)) return;
  if (state.phase !== "setup1" && state.phase !== "setup2") recordTurnEnd(state);
  if (state.phase === "setup1") {
    // forward order; if last player just placed, switch to setup2 with same player
    if (state.currentPlayerIdx === state.players.length - 1) {
      state.phase = "setup2";
    } else {
      state.currentPlayerIdx++;
    }
    return;
  }
  if (state.phase === "setup2") {
    // reverse order; after first player places again, go to main
    if (state.currentPlayerIdx === 0) {
      state.phase = "roll";
      state.hasRolled = false;
      state.hasPlayedDevCard = false;
      state.turn = 2;
      log(state, { kind: "info", text: `Setup complete. ${currentPlayer(state).name} begins.` });
    } else {
      state.currentPlayerIdx--;
    }
    return;
  }
  // normal turn end
  state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
  state.phase = "roll";
  state.hasRolled = false;
  state.hasPlayedDevCard = false;
  state.turn++;
  state.dice = null;
  // A player who reached 10 VP during someone else's turn (e.g. by taking Longest Road) wins as their turn begins.
  checkImmediateWin(state);
}

export function giveSetupResources(state: GameState, vertexId: number) {
  const p = currentPlayer(state);
  const v = state.vertices[vertexId];
  const g: Partial<Record<Resource, number>> = {};
  v.hexIds.forEach((hid) => {
    const h = state.hexes[hid];
    if (h.terrain === "desert") return;
    g[h.terrain as Resource] = (g[h.terrain as Resource] ?? 0) + 1;
  });
  RESOURCES.forEach((r) => {
    if (g[r]) g[r] = Math.min(g[r]!, state.bank[r]);
    state.bank[r] -= g[r] ?? 0;
  });
  gainCost(p, g);
  const desc = RESOURCES.filter((r) => g[r]).map((r) => `${g[r]} ${r}`).join(", ");
  if (desc) log(state, { kind: "info", playerId: p.id, text: `${p.name} received ${desc}` });
}

export { canAfford, COSTS } from "./state";
