import type { GameState, Player, Resource, ResourceCounts } from "./types";
import { RESOURCES, RESOURCE_LABEL } from "./types";
import { COSTS, log } from "./state";
import { canPlaceSettlement } from "./rules";

type Cost = Partial<Record<Resource, number>>;

export function emptyCounts(): ResourceCounts {
  return { wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 };
}

export function countCards(c: Partial<Record<Resource, number>>): number {
  return RESOURCES.reduce((s, r) => s + (c[r] ?? 0), 0);
}

export function describeCounts(c: Partial<Record<Resource, number>>): string {
  const parts = RESOURCES.filter((r) => (c[r] ?? 0) > 0).map((r) => `${c[r]} ${RESOURCE_LABEL[r]}`);
  return parts.length ? parts.join(", ") : "nothing";
}

/** Returns an error message, or null if the swap is legal. `give` is what `fromId` hands over, `get` what they receive. */
export function validateTrade(
  state: GameState, fromId: string, toId: string, give: ResourceCounts, get: ResourceCounts,
): string | null {
  const from = state.players.find((p) => p.id === fromId);
  const to = state.players.find((p) => p.id === toId);
  if (!from || !to || fromId === toId) return "Pick another player to trade with.";
  if (countCards(give) === 0 || countCards(get) === 0) return "Both sides of a trade must include at least one card.";
  for (const r of RESOURCES) {
    if (give[r] > 0 && get[r] > 0) return "You can't trade a resource for the same resource.";
    if (give[r] > from.resources[r]) return `${from.name} doesn't have enough ${RESOURCE_LABEL[r]}.`;
    if (get[r] > to.resources[r]) return `${to.name} doesn't have enough ${RESOURCE_LABEL[r]}.`;
  }
  return null;
}

export function executeTrade(
  state: GameState, fromId: string, toId: string, give: ResourceCounts, get: ResourceCounts,
) {
  const err = validateTrade(state, fromId, toId, give, get);
  if (err) throw new Error(err);
  const from = state.players.find((p) => p.id === fromId)!;
  const to = state.players.find((p) => p.id === toId)!;
  RESOURCES.forEach((r) => {
    from.resources[r] += get[r] - give[r];
    to.resources[r] += give[r] - get[r];
  });
  state.stats.playerTrades[fromId] += 1;
  state.stats.playerTrades[toId] += 1;
  log(state, {
    kind: "trade", playerId: fromId,
    text: `${from.name} traded ${describeCounts(give)} to ${to.name} for ${describeCounts(get)}`,
  });
}

/** Like executeTrade but never throws (safe inside React state updaters). Returns whether the trade happened. */
export function safeTrade(
  state: GameState, fromId: string, toId: string, give: ResourceCounts, get: ResourceCounts,
): boolean {
  if (validateTrade(state, fromId, toId, give, get) !== null) return false;
  executeTrade(state, fromId, toId, give, get);
  return true;
}

// ---------- AI valuation ----------

interface Goal { cost: Cost; weight: number }

function goalsFor(state: GameState, p: Player): Goal[] {
  const goals: Goal[] = [];
  const hasSettlement = state.vertices.some((v) => v.building?.playerId === p.id && v.building.kind === "settlement");
  if (p.citiesLeft > 0 && hasSettlement) goals.push({ cost: COSTS.city, weight: 3 });
  if (p.settlementsLeft > 0 && state.vertices.some((v) => canPlaceSettlement(state, v.id, p.id, false))) {
    goals.push({ cost: COSTS.settlement, weight: 3 });
  }
  if (state.devDeck.length > 0) goals.push({ cost: COSTS.devCard, weight: 1.5 });
  if (p.roadsLeft > 0) goals.push({ cost: COSTS.road, weight: 1 });
  return goals;
}

/** How much `p` wants one more card of `r`. */
function wantWeight(p: Player, r: Resource, goals: Goal[]): number {
  let w = p.resources[r] >= 4 ? 0.5 : 0.8;
  for (const g of goals) {
    if ((g.cost[r] ?? 0) > p.resources[r]) w = Math.max(w, 1 + g.weight * 0.6);
  }
  return w;
}

/** How much `p` dislikes losing one card of `r`. */
function keepWeight(p: Player, r: Resource, goals: Goal[]): number {
  let w = p.resources[r] >= 3 ? 0.6 : 0.8;
  for (const g of goals) {
    const need = g.cost[r] ?? 0;
    if (need > 0) w = Math.max(w, 1 + g.weight * (p.resources[r] <= need ? 0.5 : 0.15));
  }
  return w;
}

/** Would the AI accept? `receives` = what the AI gets, `gives` = what it hands over. */
export function evaluateAITrade(
  state: GameState, aiId: string, proposerId: string, receives: ResourceCounts, gives: ResourceCounts,
): { accept: boolean; reason: string } {
  const ai = state.players.find((p) => p.id === aiId)!;
  const proposer = state.players.find((p) => p.id === proposerId)!;
  for (const r of RESOURCES) {
    if (gives[r] > ai.resources[r]) return { accept: false, reason: `doesn't have enough ${RESOURCE_LABEL[r]}` };
  }
  if (proposer.victoryPoints >= 8) return { accept: false, reason: "won't help you get any closer to winning" };
  const goals = goalsFor(state, ai);
  let gain = 0;
  let loss = 0;
  let mostPrecious: Resource | null = null;
  let preciousW = 0;
  for (const r of RESOURCES) {
    gain += receives[r] * wantWeight(ai, r, goals);
    const kw = keepWeight(ai, r, goals);
    loss += gives[r] * kw;
    if (gives[r] > 0 && kw > preciousW) { preciousW = kw; mostPrecious = r; }
  }
  if (gain >= loss * 1.2) return { accept: true, reason: "accepts" };
  if (mostPrecious && preciousW >= 1.9) return { accept: false, reason: `needs its ${RESOURCE_LABEL[mostPrecious]}` };
  return { accept: false, reason: "wants a better deal" };
}

/** A simple 1-for-1 offer the AI would like to make to the human, or null. */
export function aiTradeProposal(
  state: GameState, aiId: string, targetId?: string,
): { give: ResourceCounts; get: ResourceCounts } | null {
  const ai = state.players.find((p) => p.id === aiId)!;
  const target = targetId ? state.players.find((p) => p.id === targetId) : undefined;
  const goals = goalsFor(state, ai);
  // Pick the goal that is closest to being affordable (1-2 cards short).
  let best: { missing: Resource; short: number; goal: Goal } | null = null;
  for (const g of goals) {
    if (g.weight < 1.5) continue;
    const missing = RESOURCES.filter((r) => (g.cost[r] ?? 0) > ai.resources[r]);
    // Only ask for a card the other player could actually hand over (the AI can see hand sizes at the table).
    const askable = target ? missing.filter((r) => target.resources[r] > 0) : missing;
    if (askable.length === 0) continue;
    const short = missing.reduce((s, r) => s + ((g.cost[r] ?? 0) - ai.resources[r]), 0);
    if (short >= 1 && short <= 2 && (!best || short < best.short)) best = { missing: askable[0], short, goal: g };
  }
  if (!best) return null;
  // Offer a card we don't need for that goal and hold plenty of.
  const spare = RESOURCES
    .filter((r) => r !== best!.missing && ai.resources[r] > (best!.goal.cost[r] ?? 0) && ai.resources[r] >= 2)
    .sort((a, b) => ai.resources[b] - ai.resources[a])[0];
  if (!spare) return null;
  const give = emptyCounts();
  const get = emptyCounts();
  give[spare] = 1;
  get[best.missing] = 1;
  return { give, get };
}

/**
 * When the AI turns a proposal down it may answer with a small change it would accept:
 * ask for one more card, give one card less, or hand over a different (cheaper) card.
 * `receives` / `gives` are from the AI's point of view, like in evaluateAITrade.
 */
export function aiCounterOffer(
  state: GameState, aiId: string, proposerId: string, receives: ResourceCounts, gives: ResourceCounts,
): { receives: ResourceCounts; gives: ResourceCounts; note: string } | null {
  const ai = state.players.find((p) => p.id === aiId)!;
  const proposer = state.players.find((p) => p.id === proposerId)!;
  const goals = goalsFor(state, ai);
  const ok = (rec: ResourceCounts, giv: ResourceCounts) =>
    countCards(rec) > 0 && countCards(giv) > 0 &&
    RESOURCES.every((r) => !(rec[r] > 0 && giv[r] > 0)) &&
    validateTrade(state, proposerId, aiId, rec, giv) === null &&
    evaluateAITrade(state, aiId, proposerId, rec, giv).accept;

  // 1) ask for one more card of something it wants
  const wanted = [...RESOURCES].sort((a, b) => wantWeight(ai, b, goals) - wantWeight(ai, a, goals));
  for (const r of wanted) {
    if (gives[r] > 0 || proposer.resources[r] <= receives[r]) continue;
    const rec = { ...receives };
    rec[r] += 1;
    if (ok(rec, gives)) return { receives: rec, gives, note: `wants 1 more ${RESOURCE_LABEL[r]}` };
  }
  // 2) hand over one card less
  if (countCards(gives) > 1) {
    for (const r of RESOURCES) {
      if (gives[r] <= 0) continue;
      const giv = { ...gives };
      giv[r] -= 1;
      if (ok(receives, giv)) return { receives, gives: giv, note: `gives 1 less ${RESOURCE_LABEL[r]}` };
    }
  }
  // 3) hand over a different card it values less
  const cheap = [...RESOURCES].sort((a, b) => keepWeight(ai, a, goals) - keepWeight(ai, b, goals));
  for (const r of RESOURCES) {
    if (gives[r] <= 0) continue;
    for (const alt of cheap) {
      if (alt === r || receives[alt] > 0 || ai.resources[alt] - gives[alt] < 1) continue;
      const giv = { ...gives };
      giv[r] -= 1;
      giv[alt] += 1;
      if (ok(receives, giv)) return { receives, gives: giv, note: `gives ${RESOURCE_LABEL[alt]} instead of ${RESOURCE_LABEL[r]}` };
    }
  }
  return null;
}
