import type { GameState, Player, Resource, Harbor } from "./types";
import { RESOURCES } from "./types";
import {
  canPlaceSettlement, canPlaceRoad, placeSettlement, placeRoad, placeCity,
  rollDice, endTurn, discardResources, moveRobber, stealFrom, bankTrade,
  buyDevCard, playDevCard, giveSetupResources, bankRate,
} from "./rules";
import { aiTradeProposal, evaluateAITrade, executeTrade, validateTrade } from "./trade";
import { canAfford, COSTS, currentPlayer, totalResources, log } from "./state";

const PIP: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

const PIP_OF = PIP;

/** Extra value of a vertex that sits on a harbor (0 if the player already has an equivalent one). */
function harborBonus(state: GameState, vid: number, playerId: string): number {
  const h = state.harbors.find((hb) => hb.vertexIds.includes(vid));
  if (!h) return 0;
  const owns = (hb: Harbor) => hb.vertexIds.some((v) => state.vertices[v].building?.playerId === playerId);
  if (owns(h)) return 0;
  if (h.type === "any") {
    // A 3:1 port is only a small bonus if we already hold a 2:1 port.
    const hasAnyPort = state.harbors.some((hb) => hb.type === "any" && owns(hb));
    return hasAnyPort ? 0 : 2;
  }
  // 2:1 port: worth more the more of that resource we (would) produce.
  if (state.harbors.some((hb) => hb.type === h.type && owns(hb))) return 0;
  let pips = 0;
  const addPips = (hexIds: number[], mult: number) => hexIds.forEach((hid) => {
    const hx = state.hexes[hid];
    if (hx.terrain === h.type && hx.number) pips += (PIP_OF[hx.number] || 0) * mult;
  });
  addPips(state.vertices[vid].hexIds, 1);
  state.vertices.forEach((v) => {
    if (v.building?.playerId === playerId) addPips(v.hexIds, v.building.kind === "city" ? 2 : 1);
  });
  return Math.min(6, 0.5 + pips * 0.7);
}

function vertexScore(state: GameState, vid: number, playerId?: string): number {
  const v = state.vertices[vid];
  let score = 0;
  const resCount: Record<string, number> = {};
  v.hexIds.forEach((hid) => {
    const h = state.hexes[hid];
    if (h.number && h.terrain !== "desert") {
      score += PIP[h.number] || 0;
      resCount[h.terrain] = (resCount[h.terrain] ?? 0) + 1;
    }
  });
  // diversity bonus
  score += Object.keys(resCount).length * 2;
  // harbor bonus
  if (playerId) score += harborBonus(state, vid, playerId);
  return score;
}

function pickKnightTarget(s: GameState, pid: string): number {
  const opponents = s.players.filter((pp) => pp.id !== pid).sort((a, b) => b.victoryPoints - a.victoryPoints);
  const leader = opponents[0];
  let target = -1;
  let best = -1;
  s.hexes.forEach((h) => {
    if (h.id === s.robberHexId) return;
    let sc = 0;
    let hasMe = false;
    h.vertexIds.forEach((vid) => {
      const b = s.vertices[vid].building;
      if (!b) return;
      if (b.playerId === pid) hasMe = true;
      else if (leader && b.playerId === leader.id) sc += 2;
    });
    if (hasMe) sc = -1;
    if (sc > best) { best = sc; target = h.id; }
  });
  return best >= 0 ? target : -1;
}

export function aiSetupPlace(state: GameState): { vertexId: number; edgeId: number } {
  const me = currentPlayer(state).id;
  // pick best valid vertex
  const valid = state.vertices.filter((v) => canPlaceSettlement(state, v.id, me, true));
  valid.sort((a, b) => vertexScore(state, b.id, me) - vertexScore(state, a.id, me));
  const vid = valid[0].id;
  // pick best adjacent road (toward highest-score neighbor)
  const candidates = state.edges
    .filter((e) => e.vertexIds.includes(vid) && !e.road)
    .map((e) => {
      const other = e.vertexIds[0] === vid ? e.vertexIds[1] : e.vertexIds[0];
      return { e, score: vertexScore(state, other, me) };
    })
    .sort((a, b) => b.score - a.score);
  return { vertexId: vid, edgeId: candidates[0].e.id };
}

export async function runAITurn(
  state: GameState,
  apply: (mutator: (s: GameState) => void) => void,
  delay: (ms: number) => Promise<void>,
) {
  const me = () => currentPlayer(state);

  if (state.phase === "setup1" || state.phase === "setup2") {
    await delay(500);
    const { vertexId, edgeId } = aiSetupPlace(state);
    apply((s) => {
      placeSettlement(s, vertexId, true);
      if (s.phase === "setup2") giveSetupResources(s, vertexId);
      placeRoad(s, edgeId, true);
      endTurn(s);
    });
    return;
  }

  if (state.phase === "roll") {
    await delay(500);
    // A Knight played before the roll can evict the robbers from one of our own hexes.
    const p0 = me();
    const knight = p0.devCards.find((c) => c.kind === "knight" && !c.played && c.purchasedTurn < state.turn);
    const robberOnMe = state.hexes[state.robberHexId].vertexIds.some((vid) => state.vertices[vid].building?.playerId === p0.id);
    if (knight && robberOnMe && !state.hasPlayedDevCard) {
      const target = pickKnightTarget(state, p0.id);
      if (target >= 0) {
        apply((s) => playDevCard(s, knight.id, { hexId: target }));
        await delay(400);
        // apply() changed the phase; TypeScript still remembers it as "roll", so widen the type here
        if ((state.phase as GameState["phase"]) === "stealing") {
          apply((s) => {
            const richest = s.stealCandidates
              .map((id) => s.players.find((pp) => pp.id === id)!)
              .sort((a, b) => totalResources(b) - totalResources(a))[0];
            stealFrom(s, richest.id);
          });
          await delay(300);
        }
      }
    }
    if (state.phase === "roll") apply((s) => { rollDice(s); });
  }

  // discard if needed
  while (state.phase === "discard") {
    const myId = me().id;
    if (!state.pendingDiscards.includes(myId)) break;
    await delay(400);
    apply((s) => {
      const p = s.players.find((x) => x.id === myId)!;
      const need = Math.floor(totalResources(p) / 2);
      // discard from largest stacks, prefer wool/wood/brick first
      const order: Resource[] = ["wool", "wood", "brick", "grain", "ore"];
      const toDiscard: Partial<Record<Resource, number>> = {};
      let remaining = need;
      for (const r of order) {
        const take = Math.min(p.resources[r], remaining);
        if (take > 0) { toDiscard[r] = take; remaining -= take; }
        if (!remaining) break;
      }
      discardResources(s, myId, toDiscard);
    });
  }

  if (state.phase === "moveRobber") {
    await delay(500);
    apply((s) => {
      const myId = me().id;
      // pick hex adjacent to leading opponent (most VP) and not current desert position
      const opponents = s.players.filter((p) => p.id !== myId);
      const leader = opponents.slice().sort((a, b) => b.victoryPoints - a.victoryPoints)[0];
      let bestHex = -1;
      let bestScore = -1;
      s.hexes.forEach((h) => {
        if (h.id === s.robberHexId) return;
        let score = 0;
        let hasMe = false;
        h.vertexIds.forEach((vid) => {
          const b = s.vertices[vid].building;
          if (!b) return;
          if (b.playerId === myId) hasMe = true;
          else if (b.playerId === leader.id) score += b.kind === "city" ? 3 : 2;
          else score += 0.5;
        });
        if (hasMe) score -= 100;
        if (h.number) score *= (PIP[h.number] || 1);
        if (score > bestScore) { bestScore = score; bestHex = h.id; }
      });
      if (bestHex === -1) {
        bestHex = s.hexes.find((h) => h.id !== s.robberHexId)!.id;
      }
      moveRobber(s, bestHex);
    });
  }

  if (state.phase === "stealing") {
    await delay(400);
    apply((s) => {
      // steal from richest candidate
      const richest = s.stealCandidates
        .map((id) => s.players.find((p) => p.id === id)!)
        .sort((a, b) => totalResources(b) - totalResources(a))[0];
      stealFrom(s, richest.id);
    });
  }

  // Swap cards with the other AIs (at most two deals per turn). Both sides must like the deal.
  if (state.phase === "main") {
    const myId = me().id;
    let deals = 0;
    for (const other of state.players.filter((pl) => pl.isAI && pl.id !== myId)) {
      if (deals >= 2 || state.phase !== "main") break;
      const prop = aiTradeProposal(state, myId, other.id);
      if (!prop) continue;
      const verdict = evaluateAITrade(state, other.id, myId, prop.give, prop.get);
      if (!verdict.accept || validateTrade(state, myId, other.id, prop.give, prop.get) !== null) continue;
      await delay(400);
      apply((s) => { if (validateTrade(s, myId, other.id, prop.give, prop.get) === null) executeTrade(s, myId, other.id, prop.give, prop.get); });
      deals++;
      await delay(300);
    }
  }

  // Offer a human a 1-for-1 swap once per turn (before building, so a yes can be used right away).
  // With several humans on one screen the one who is asked first rotates from turn to turn.
  if (state.phase === "main") {
    const humans = state.players.filter((pl) => !pl.isAI && totalResources(pl) > 0);
    let target: Player | undefined;
    let proposal: ReturnType<typeof aiTradeProposal> = null;
    for (let k = 0; k < humans.length && !proposal; k++) {
      const h = humans[(k + state.turn) % humans.length];
      const prop = aiTradeProposal(state, me().id, h.id);
      if (prop) { target = h; proposal = prop; }
    }
    if (target && proposal) {
      const human = target;
      const offer = proposal;
      await delay(500);
      const myId = me().id;
      apply((s) => {
        s.pendingTrade = { fromPlayerId: myId, toPlayerId: human.id, offer: offer.give, request: offer.get };
      });
      await delay(300);
      let waited = 0;
      while (state.pendingTrade && waited < 300000) { await delay(300); waited += 300; }
      if (state.pendingTrade) {
        apply((s) => {
          s.pendingTrade = null;
          log(s, { kind: "trade", playerId: myId, text: `${s.players.find((pl) => pl.id === myId)!.name}'s offer expired` });
        });
        await delay(300);
      }
    }
  }

  // BUILD PHASE: loop until no good action
  let safety = 20;
  while (safety-- > 0 && state.phase === "main") {
    await delay(400);
    let acted = false;
    apply((s) => {
      const p = currentPlayer(s);
      // 1. Build city if affordable & have settlement
      if (canAfford(p, COSTS.city) && p.citiesLeft > 0) {
        const upgradable = s.vertices.find((v) => v.building?.playerId === p.id && v.building.kind === "settlement");
        if (upgradable) {
          placeCity(s, upgradable.id);
          acted = true;
          return;
        }
      }
      // 2. Build settlement if affordable & connected vertex available
      if (canAfford(p, COSTS.settlement) && p.settlementsLeft > 0) {
        const candidates = s.vertices
          .filter((v) => canPlaceSettlement(s, v.id, p.id, false))
          .sort((a, b) => vertexScore(s, b.id, p.id) - vertexScore(s, a.id, p.id));
        if (candidates.length > 0) {
          placeSettlement(s, candidates[0].id, false);
          acted = true;
          return;
        }
      }
      // 3. Build road if it opens a new settlement spot
      if (canAfford(p, COSTS.road) && p.roadsLeft > 0) {
        const road = s.edges
          .map((e) => ({ e, valid: canPlaceRoad(s, e.id, p.id) }))
          .filter((x) => x.valid)
          .map(({ e }) => {
            // score = best vertex score at far end (if not yet a settlement spot for us)
            const newVerts = e.vertexIds.filter((vid) => !s.vertices[vid].building);
            const future = Math.max(0, ...newVerts.map((vid) => vertexScore(s, vid, p.id)));
            return { e, score: future };
          })
          .sort((a, b) => b.score - a.score);
        if (road.length > 0 && road[0].score >= 6) {
          placeRoad(s, road[0].e.id, false);
          acted = true;
          return;
        }
      }
      // 4. Buy dev card
      if (canAfford(p, COSTS.devCard) && s.devDeck.length > 0) {
        buyDevCard(s);
        acted = true;
        return;
      }
      // 5. Play unplayed knight
      const knight = p.devCards.find((c) => c.kind === "knight" && !c.played && c.purchasedTurn < s.turn);
      if (knight && !s.hasPlayedDevCard) {
        // pick a hex on opponent
        const opponents = s.players.filter((pp) => pp.id !== p.id);
        const leader = opponents.sort((a, b) => b.victoryPoints - a.victoryPoints)[0];
        let target = -1;
        let best = -1;
        s.hexes.forEach((h) => {
          if (h.id === s.robberHexId) return;
          let sc = 0;
          let hasMe = false;
          h.vertexIds.forEach((vid) => {
            const b = s.vertices[vid].building;
            if (!b) return;
            if (b.playerId === p.id) hasMe = true;
            else if (b.playerId === leader.id) sc += 2;
          });
          if (hasMe) sc = -1;
          if (sc > best) { best = sc; target = h.id; }
        });
        if (target >= 0 && best >= 0) {
          playDevCard(s, knight.id, { hexId: target });
          acted = true;
          return;
        }
      }
      // 6. Bank trade if hoarding one resource
      const surplus = RESOURCES.find((r) => p.resources[r] >= bankRate(s, p.id, r) + 2);
      if (surplus) {
        const need = RESOURCES.find((r) => p.resources[r] === 0 && s.bank[r] > 0) || RESOURCES.find((r) => p.resources[r] < 2 && s.bank[r] > 0);
        if (need && need !== surplus) {
          bankTrade(s, surplus, need);
          acted = true;
          return;
        }
      }
    });
    if (!acted) break;
  }

  await delay(400);
  apply((s) => { if (s.phase === "main") endTurn(s); });
}
