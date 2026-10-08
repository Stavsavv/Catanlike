import type { GameState, Resource, ResourceCounts } from "./types";
import { RESOURCES } from "./types";
import { canAfford, COSTS, currentPlayer, log } from "./state";
import {
  canPlaceSettlement, canPlaceCity, canPlaceRoad,
  placeSettlement, placeCity, placeRoad, rollDice, endTurn, buyDevCard, playDevCard,
  moveRobber, stealFrom, discardResources, bankTrade, giveSetupResources,
} from "./rules";
import { validateTrade, evaluateAITrade, aiCounterOffer, executeTrade } from "./trade";

/**
 * Everything a player can ask the game to do, as plain data. The same list is used for a game on one
 * screen and for an online game, where the server checks each request before it touches the game.
 */
export type Action =
  | { type: "roll" }
  | { type: "endTurn" }
  | { type: "setupSettlement"; vertexId: number }
  | { type: "setupRoad"; edgeId: number }
  | { type: "settlement"; vertexId: number }
  | { type: "city"; vertexId: number }
  | { type: "road"; edgeId: number }
  | { type: "buyDev" }
  | { type: "playDev"; cardId: number; opts?: { hexId?: number; resources?: [Resource, Resource]; monopoly?: Resource; edge1?: number; edge2?: number } }
  | { type: "moveRobber"; hexId: number }
  | { type: "steal"; targetId: string }
  | { type: "discard"; picks: Partial<Record<Resource, number>> }
  | { type: "bankTrade"; give: Resource; get: Resource }
  | { type: "tradeAI"; withId: string; give: ResourceCounts; get: ResourceCounts }
  | { type: "offerTrade"; toId: string; give: ResourceCounts; get: ResourceCounts }
  | { type: "answerTrade"; answer: "accept" | "decline" }
  | { type: "cancelOffer" };

/** What an AI said to a trade proposal (sent back only to the person who asked). */
export interface TradeReply {
  accepted: boolean;
  reason?: string;
  counter?: { give: ResourceCounts; get: ResourceCounts; note: string };
}

export type ActionResult = { ok: true; reply?: TradeReply } | { ok: false; error: string };

// ---------- helpers ----------

/** Where a player is in their setup turn: place a settlement, then a road next to it. */
export function setupStep(state: GameState, playerId: string): { step: "settlement" } | { step: "road"; vertexId: number } | null {
  if (state.phase !== "setup1" && state.phase !== "setup2") return null;
  const mine = state.vertices.filter((v) => v.building?.playerId === playerId);
  const roads = state.edges.filter((e) => e.road?.playerId === playerId);
  if (mine.length === roads.length) return { step: "settlement" };
  const lone = mine.find((v) => !roads.some((e) => e.vertexIds[0] === v.id || e.vertexIds[1] === v.id));
  return lone ? { step: "road", vertexId: lone.id } : { step: "settlement" };
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const isResource = (r: unknown): r is Resource => typeof r === "string" && (RESOURCES as readonly string[]).includes(r);

/** Never trust numbers that came over the network. */
function cleanCounts(x: unknown, what: string): ResourceCounts {
  const out: ResourceCounts = { wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 };
  if (typeof x !== "object" || x === null) throw new Error(`Bad ${what}`);
  for (const r of RESOURCES) {
    const n = (x as Record<string, unknown>)[r] ?? 0;
    if (!isInt(n) || n < 0 || n > 99) throw new Error(`Bad ${what}`);
    out[r] = n;
  }
  return out;
}

const fail = (msg: string): never => { throw new Error(msg); };

/**
 * Check that `playerId` may do `action` right now and, if so, do it. The state is changed in place,
 * so callers pass a copy and keep it only when the result is ok. Nothing here trusts the caller.
 */
export function applyAction(state: GameState, playerId: string, action: Action): ActionResult {
  try {
    return run(state, playerId, action);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That move is not allowed" };
  }
}

function run(state: GameState, pid: string, a: Action): ActionResult {
  const player = state.players.find((p) => p.id === pid);
  if (!player) return fail("You are not in this game");
  if (state.phase === "gameover") return fail("The game is over");
  if (typeof a !== "object" || a === null) return fail("Bad request");

  const mine = currentPlayer(state).id === pid;
  const mainTurn = mine && state.phase === "main";
  const pending = state.pendingTrade ?? null;

  // While a person has a trade offer to answer, only the trade moves are allowed.
  const tradeMoves = ["answerTrade", "offerTrade", "tradeAI", "cancelOffer"];
  if (pending && !tradeMoves.includes(a.type)) return fail("A trade offer is waiting for an answer");

  switch (a.type) {
    case "roll":
      if (!mine || state.phase !== "roll") return fail("You can't roll now");
      rollDice(state);
      return { ok: true };

    case "endTurn":
      if (!mainTurn) return fail("You can't end your turn now");
      endTurn(state);
      return { ok: true };

    case "setupSettlement": {
      const step = setupStep(state, pid);
      if (!mine || step?.step !== "settlement") return fail("Place your road first");
      if (!isInt(a.vertexId) || !canPlaceSettlement(state, a.vertexId, pid, true)) return fail("You can't build there");
      placeSettlement(state, a.vertexId, true);
      if (state.phase === "setup2") giveSetupResources(state, a.vertexId);
      return { ok: true };
    }

    case "setupRoad": {
      const step = setupStep(state, pid);
      if (!mine || step?.step !== "road") return fail("Place a settlement first");
      if (!isInt(a.edgeId) || !canPlaceRoad(state, a.edgeId, pid, step.vertexId)) return fail("The road must touch your new settlement");
      placeRoad(state, a.edgeId, true);
      endTurn(state);
      return { ok: true };
    }

    case "settlement":
      if (!mainTurn) return fail("You can only build during your turn");
      if (!isInt(a.vertexId) || !canPlaceSettlement(state, a.vertexId, pid, false)) return fail("You can't build there");
      if (!canAfford(player, COSTS.settlement)) return fail("You can't afford a settlement");
      if (player.settlementsLeft <= 0) return fail("No settlements left");
      placeSettlement(state, a.vertexId, false);
      return { ok: true };

    case "city":
      if (!mainTurn) return fail("You can only build during your turn");
      if (!isInt(a.vertexId) || !canPlaceCity(state, a.vertexId, pid)) return fail("Only one of your settlements can become a city");
      if (!canAfford(player, COSTS.city)) return fail("You can't afford a city");
      if (player.citiesLeft <= 0) return fail("No cities left");
      placeCity(state, a.vertexId);
      return { ok: true };

    case "road":
      if (!mainTurn) return fail("You can only build during your turn");
      if (!isInt(a.edgeId) || !canPlaceRoad(state, a.edgeId, pid)) return fail("You can't build there");
      if (!canAfford(player, COSTS.road)) return fail("You can't afford a road");
      if (player.roadsLeft <= 0) return fail("No roads left");
      placeRoad(state, a.edgeId, false);
      return { ok: true };

    case "buyDev":
      if (!mainTurn) return fail("You can only buy during your turn");
      buyDevCard(state); // checks cost and deck
      return { ok: true };

    case "playDev": {
      if (!mine || (state.phase !== "main" && state.phase !== "roll")) return fail("You can't play a card now");
      if (!isInt(a.cardId)) return fail("Bad card");
      const o = a.opts ?? {};
      const opts: NonNullable<Extract<Action, { type: "playDev" }>["opts"]> = {};
      if (o.hexId !== undefined) { if (!isInt(o.hexId) || !state.hexes[o.hexId]) return fail("Bad hex"); opts.hexId = o.hexId; }
      if (o.resources !== undefined) {
        if (!Array.isArray(o.resources) || o.resources.length !== 2 || !isResource(o.resources[0]) || !isResource(o.resources[1])) return fail("Pick two resources");
        opts.resources = [o.resources[0], o.resources[1]];
      }
      if (o.monopoly !== undefined) { if (!isResource(o.monopoly)) return fail("Pick a resource"); opts.monopoly = o.monopoly; }
      if (o.edge1 !== undefined) { if (!isInt(o.edge1)) return fail("Bad road"); opts.edge1 = o.edge1; }
      if (o.edge2 !== undefined) { if (!isInt(o.edge2)) return fail("Bad road"); opts.edge2 = o.edge2; }
      playDevCard(state, a.cardId, opts);
      return { ok: true };
    }

    case "moveRobber":
      if (!mine || state.phase !== "moveRobber") return fail("You can't move the robber now");
      if (!isInt(a.hexId) || !state.hexes[a.hexId]) return fail("Bad hex");
      moveRobber(state, a.hexId);
      return { ok: true };

    case "steal":
      if (!mine || state.phase !== "stealing") return fail("You can't steal now");
      if (typeof a.targetId !== "string" || !state.stealCandidates.includes(a.targetId)) return fail("You can't steal from them");
      stealFrom(state, a.targetId);
      return { ok: true };

    case "discard":
      if (state.phase !== "discard" || !state.pendingDiscards.includes(pid)) return fail("You don't have to discard");
      discardResources(state, pid, cleanCounts(a.picks, "discard"));
      return { ok: true };

    case "bankTrade":
      if (!mainTurn) return fail("You can only trade during your turn");
      if (!isResource(a.give) || !isResource(a.get)) return fail("Bad trade");
      bankTrade(state, a.give, a.get);
      return { ok: true };

    case "tradeAI": {
      const give = cleanCounts(a.give, "trade");
      const get = cleanCounts(a.get, "trade");
      const target = state.players.find((p) => p.id === a.withId);
      if (!target || !target.isAI) return fail("Pick an AI player");
      // Allowed on your own turn, or to answer that AI's own offer with a counteroffer.
      const counterToIt = !!pending && pending.toPlayerId === pid && pending.fromPlayerId === target.id;
      if (!(mainTurn && !pending) && !counterToIt) return fail("You can't trade now");
      const err = validateTrade(state, pid, target.id, give, get);
      if (err) return fail(err);
      const verdict = evaluateAITrade(state, target.id, pid, give, get);
      if (verdict.accept) {
        executeTrade(state, pid, target.id, give, get);
        if (counterToIt) state.pendingTrade = null;
        return { ok: true, reply: { accepted: true } };
      }
      const counter = aiCounterOffer(state, target.id, pid, give, get);
      return {
        ok: true,
        reply: {
          accepted: false,
          reason: verdict.reason,
          counter: counter ? { give: counter.receives, get: counter.gives, note: counter.note } : undefined,
        },
      };
    }

    case "offerTrade": {
      const give = cleanCounts(a.give, "trade");
      const get = cleanCounts(a.get, "trade");
      const target = state.players.find((p) => p.id === a.toId);
      if (!target || target.isAI || target.id === pid) return fail("Pick another person");
      // Allowed on your own turn, or to answer that person's offer with a counteroffer.
      const counterToIt = !!pending && pending.toPlayerId === pid && pending.fromPlayerId === target.id;
      if (!(mainTurn && !pending) && !counterToIt) return fail("You can't trade now");
      const err = validateTrade(state, pid, target.id, give, get);
      if (err) return fail(err);
      state.pendingTrade = { fromPlayerId: pid, toPlayerId: target.id, offer: give, request: get };
      log(state, { kind: "trade", playerId: pid, text: counterToIt ? `${player.name} countered ${target.name}'s offer` : `${player.name} offered ${target.name} a trade` });
      return { ok: true };
    }

    case "answerTrade": {
      if (!pending || pending.toPlayerId !== pid) return fail("There is no offer for you");
      const from = state.players.find((p) => p.id === pending.fromPlayerId)!;
      if (a.answer === "accept") {
        const err = validateTrade(state, pending.fromPlayerId, pid, pending.offer, pending.request);
        if (err) return fail(err);
        executeTrade(state, pending.fromPlayerId, pid, pending.offer, pending.request);
        state.pendingTrade = null;
        return { ok: true };
      }
      if (a.answer !== "decline") return fail("Bad answer");
      log(state, { kind: "trade", playerId: pid, text: `${player.name} declined ${from.name}'s offer` });
      state.pendingTrade = null;
      return { ok: true };
    }

    case "cancelOffer":
      if (!pending || pending.fromPlayerId !== pid) return fail("You have no offer to cancel");
      log(state, { kind: "trade", playerId: pid, text: `${player.name} withdrew the offer` });
      state.pendingTrade = null;
      return { ok: true };

    default:
      return fail("Unknown move");
  }
}
